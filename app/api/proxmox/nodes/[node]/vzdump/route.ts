
import { proxmox } from "@/lib/proxmox-api";
import { logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { checkVMAccess } from "@/lib/acl";
import { validateCSRFToken } from "@/lib/csrf";
import { getClientContext } from "@/lib/audit";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ node: string }> }
) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "BACKUP_CREATE", resource: "backup:vm", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "unauthorized" } });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        await logAudit({ username: session.user.username, action: "BACKUP_CREATE", resource: "backup:vm", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_csrf" } });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { node } = await params;
    const body = await request.json();
    const { vmid, storage, mode, compress, remove } = body;

    if (!vmid) {
        await logAudit({ username: session.user.username, action: "BACKUP_CREATE", resource: "backup:vm", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "missing_vmid" } });
        return NextResponse.json({ error: "VM ID is required" }, { status: 400 });
    }

    // Access check: user must have access to the VM being backed up
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        await logAudit({ username: session.user.username, action: "BACKUP_CREATE", resource: `vm:${vmid}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "permission_denied" } });
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        const upid = await proxmox.createBackup(node, vmid, storage, mode, compress, remove);

        await logAudit({
            username: session.user.username,
            action: "BACKUP_CREATE",
            resource: `vm:${vmid}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { node, storage, mode, compress, remove, upid },
            status: "SUCCESS"
        });

        return NextResponse.json({ upid });
    } catch (error: any) {
        await logAudit({ username: session.user.username, action: "BACKUP_CREATE", resource: `vm:${vmid}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { error: error?.message || "unknown_error" } });
        return NextResponse.json(
            { error: "Failed to start backup" },
            { status: 500 }
        );
    }
}
