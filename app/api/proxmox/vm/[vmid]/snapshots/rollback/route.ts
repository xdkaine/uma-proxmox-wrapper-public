
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { checkVMAccess } from "@/lib/acl";
import { validateCSRFToken } from "@/lib/csrf";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ vmid: string }> }
) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { vmid } = await params;

    // Access Check — rollback is a destructive operation
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    const body = await request.json();
    const { node, snapname } = body;

    if (!node || !snapname) {
        return NextResponse.json({ error: "Node and Snapshot Name are required" }, { status: 400 });
    }

    try {
        await proxmox.rollbackSnapshot(node, vmid, snapname);

        await logAudit({
            username: session.user.username,
            action: "VM_SNAPSHOT_ROLLBACK",
            resource: `vm:${vmid}`,
            details: { node, snapname },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_SNAPSHOT_ROLLBACK",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { node, snapname, error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to rollback snapshot" },
            { status: 500 }
        );
    }
}
