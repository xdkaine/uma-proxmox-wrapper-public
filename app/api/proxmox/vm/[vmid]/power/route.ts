
import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `vm_power:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_POWER);
    if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    try {
        const { vmid } = await params;
        const body = await req.json();
        const { node, action } = body;

        if (!node || !action) {
            return NextResponse.json({ error: "Node and action are required" }, { status: 400 });
        }

        const validActions = ['start', 'stop', 'shutdown', 'reboot', 'reset', 'suspend', 'resume'];
        if (!validActions.includes(action)) {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        // Access Check
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
        if (!hasAccess) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // Get current VM status for audit context
        let currentStatus = 'unknown';
        try {
            const vmStatus = await proxmox.getVMStatus(node, vmid);
            currentStatus = vmStatus.status;
        } catch {
            // Continue even if we can't get status
        }

        const upid = await proxmox.vmPowerAction(node, vmid, action);

        // Map action to AuditAction if possible, or use VM_UPDATE generic?
        // Let's coerce since we have VM_START, VM_STOP etc.
        let auditAction: "VM_UPDATE" | "VM_START" | "VM_STOP" | "VM_REBOOT" | "VM_SHUTDOWN" = "VM_UPDATE";
        if (action === "start") auditAction = "VM_START";
        else if (action === "stop") auditAction = "VM_STOP";
        else if (action === "reboot") auditAction = "VM_REBOOT";
        else if (action === "shutdown") auditAction = "VM_SHUTDOWN";

        await logAudit({
            username: session.user.username,
            action: auditAction,
            resource: `vm:${vmid}`,
            details: { node, action, upid, previousStatus: currentStatus },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true, upid });

    } catch (error: unknown) {
        const { vmid } = await params;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        // Log failure for audit trail
        await logAudit({
            username: session.user?.username || 'unknown',
            action: "VM_UPDATE",
            resource: `vm:${vmid}`,
            details: { error: errorMessage, action: 'power' },
            status: "FAILURE"
        }).catch(() => { });

        console.error(`Error performing power action:`, error);
        return NextResponse.json({ error: "Power action failed" }, { status: 500 });
    }
}
