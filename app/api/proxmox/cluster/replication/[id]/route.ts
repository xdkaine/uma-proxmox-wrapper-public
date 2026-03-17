
import { proxmox } from "@/lib/proxmox-api";
import { logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { checkVMAccess } from "@/lib/acl";
import { validateCSRFToken } from "@/lib/csrf";
import { getClientContext } from "@/lib/audit";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "REPLICATION_DELETE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "unauthorized" } });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF Protection
    if (!validateCSRFToken(request, session.csrfToken)) {
        await logAudit({ username: session.user.username, action: "REPLICATION_DELETE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_csrf" } });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Rate limiting
    const rlKey = `replication_delete:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_CONFIG);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "REPLICATION_DELETE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "rate_limited", retryAfter: rl.retryAfter } });
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    const { id } = await params;

    if (!id) {
        await logAudit({ username: session.user.username, action: "REPLICATION_DELETE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "missing_job_id" } });
        return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    // Parse vmid from replication job ID (format: {vmid}-{index})
    const vmid = id.split('-')[0];
    if (!vmid) {
        await logAudit({ username: session.user.username, action: "REPLICATION_DELETE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_job_id_format", id } });
        return NextResponse.json({ error: "Invalid job ID format" }, { status: 400 });
    }

    // Access check
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        await logAudit({ username: session.user.username, action: "REPLICATION_DELETE", resource: `replication:${id}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "permission_denied" } });
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        await proxmox.deleteReplicationJob(id);

        await logAudit({
            username: session.user.username,
            action: "REPLICATION_DELETE",
            resource: `replication:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { id },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        await logAudit({ username: session.user.username, action: "REPLICATION_DELETE", resource: `replication:${id}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { error: error?.message || "unknown_error" } });
        return NextResponse.json(
            { error: "Failed to delete replication job" },
            { status: 500 }
        );
    }
}
