import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";

export async function POST(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    try {
        const { vmid } = await params;
        const body = await req.json();
        const { node } = body;

        if (!node) {
            return NextResponse.json({ error: "Node is required" }, { status: 400 });
        }

        // Access Check
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
        if (!hasAccess) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // Convert to template: POST /api2/json/nodes/{node}/qemu/{vmid}/template
        await proxmox.convertVMToTemplate(node, vmid);


        await logAudit({
            username: session.user.username,
            action: "VM_UPDATE",
            resource: `vm:${vmid}`,
            details: { node, action: 'convert_to_template' },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        const { vmid } = await params;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await logAudit({
            username: session.user?.username || 'unknown',
            action: "VM_UPDATE",
            resource: `vm:${vmid}`,
            details: { error: errorMessage, action: 'convert_to_template' },
            status: "FAILURE"
        }).catch(() => { });

        console.error(`Error converting to template:`, error);
        return NextResponse.json({ error: "Failed to convert to template" }, { status: 500 });
    }
}
