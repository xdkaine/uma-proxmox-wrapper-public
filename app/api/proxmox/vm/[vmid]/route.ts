
import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `vm_delete:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_DELETE);
    if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    try {
        const { vmid } = await params;
        const searchParams = req.nextUrl.searchParams;
        const node = searchParams.get("node");
        const type = searchParams.get("type"); // qemu or lxc

        if (!node) {
            return NextResponse.json({ error: "Node parameter is required" }, { status: 400 });
        }

        // Check Access
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
        if (!hasAccess) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        let result;
        if (type === 'lxc') {
            result = await proxmox.deleteLXC(node, vmid);
        } else {
            // Default to qemu/vm
            result = await proxmox.deleteVM(node, vmid);
        }

        await logAudit({
            username: session.user.username,
            action: "VM_DELETE",
            resource: `vm:${vmid}`,
            details: { node, type, result },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true, task: result });

    } catch (error: unknown) {
        console.error("Error deleting VM:", error);
        const { vmid } = await params;
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_DELETE",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to delete VM" }, { status: 500 });
    }
}
