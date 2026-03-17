
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

export async function GET(
    request: Request
) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const vmid = searchParams.get("vmid");

    // Access check: if vmid provided, check VM access; otherwise admin-only
    if (vmid) {
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin);
        if (!hasAccess) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }
    } else {
        if (!session.user.isAdmin) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }
    }

    try {
        const jobs = await proxmox.getReplicationJobs(vmid || undefined);

        await logAudit({
            username: session.user.username,
            action: "VIEW_REPLICATION",
            resource: vmid ? `vm:${vmid}` : "cluster:replication",
            details: { vmid },
            status: "SUCCESS"
        });

        return NextResponse.json(jobs);
    } catch {
        return NextResponse.json(
            { error: "Failed to fetch replication jobs" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "REPLICATION_CREATE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "unauthorized" } });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF Protection
    if (!validateCSRFToken(request, session.csrfToken)) {
        await logAudit({ username: session.user.username, action: "REPLICATION_CREATE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_csrf" } });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Rate limiting
    const rlKey = `replication_create:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_CONFIG);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "REPLICATION_CREATE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "rate_limited", retryAfter: rl.retryAfter } });
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    const body = await request.json();
    const { vmid, target, schedule, rate } = body;

    if (!vmid || !target) {
        await logAudit({ username: session.user.username, action: "REPLICATION_CREATE", resource: "cluster:replication", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "missing_required_fields", vmid, target } });
        return NextResponse.json({ error: "VM ID and Target are required" }, { status: 400 });
    }

    // Access check
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        await logAudit({ username: session.user.username, action: "REPLICATION_CREATE", resource: `vm:${vmid}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "permission_denied" } });
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        await proxmox.createReplicationJob(vmid, target, schedule, rate);

        await logAudit({
            username: session.user.username,
            action: "REPLICATION_CREATE",
            resource: `vm:${vmid}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { target, schedule, rate },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        await logAudit({ username: session.user.username, action: "REPLICATION_CREATE", resource: `vm:${vmid}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { error: error?.message || "unknown_error" } });
        return NextResponse.json(
            { error: "Failed to create replication job" },
            { status: 500 }
        );
    }
}
