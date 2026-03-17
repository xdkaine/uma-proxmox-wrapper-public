
import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { getClientContext, logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";

export async function POST(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const client = getClientContext(req);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VM_CONSOLE_OPEN", resource: "vm:console", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "unauthorized" } });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        await logAudit({ username: session.user.username, action: "VM_CONSOLE_OPEN", resource: "vm:console", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_csrf" } });
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
            await logAudit({ username: session.user.username, action: "VM_CONSOLE_OPEN", resource: `vm:${vmid}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "permission_denied" } });
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // Get VNC Ticket => { ticket, port, upid, cert, user, ... }
        const vncData = await proxmox.createVNCTicket(node, vmid);

        // Extract host for client convenience
        const proxmoxUrl = process.env.PROXMOX_URL;
        let proxmoxHost = "";
        if (proxmoxUrl) {
            try {
                proxmoxHost = new URL(proxmoxUrl).hostname;
            } catch { /* ignore invalid url */ }
        }

        // Audit Log
        const ip = req.headers.get("x-forwarded-for") || "unknown";
        await logAudit({
            userId: undefined, // session user doesn't have an ID property
            username: session.user.username,
            action: "VM_CONSOLE_OPEN",
            resource: `vm:${vmid}`,
            details: { node, proxmoxHost },
            ipAddress: typeof ip === 'string' ? ip : ip[0],
            userAgent: client.userAgent,
            status: "SUCCESS"
        });

        return NextResponse.json({ ...vncData, proxmoxHost });

    } catch (error: unknown) {
        console.error(`Error generating VNC ticket:`, error);
        await logAudit({ username: session.user?.username || "unknown", action: "VM_CONSOLE_OPEN", resource: "vm:console", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { error: error instanceof Error ? error.message : "unknown_error" } });
        return NextResponse.json({ error: "Failed to generate VNC ticket" }, { status: 500 });
    }
}
