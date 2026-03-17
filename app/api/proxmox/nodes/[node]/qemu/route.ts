
import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkPoolLimits } from "@/lib/limits";
import { checkPoolAccess } from "@/lib/acl";
import { validateCSRFToken } from "@/lib/csrf";
import { getClientContext } from "@/lib/audit";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ node: string }> }) {
    const client = getClientContext(req);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VM_CREATE", resource: "vm:create", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "unauthorized" } });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        await logAudit({ username: session.user.username, action: "VM_CREATE", resource: "vm:create", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_csrf" } });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `vm_create:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_CREATE);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VM_CREATE", resource: "vm:create", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "rate_limited", retryAfter: rl.retryAfter } });
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    try {
        const { node } = await params;
        const body = await req.json();

        // Auto-assign VMID if not provided
        if (!body.vmid) {
            body.vmid = await proxmox.getNextId();
        }

        // Construct params for createVM
        const createParams = {
            name: body.name,
            pool: body.pool,
            storage: body.storage,
            iso: body.iso,
            cores: body.cores,
            memory: body.memory,
            net0: body.net0,
            diskSize: body.diskSize,
            start: body.start
        };

        // Check Pool Cap (global cap applied per pool)
        if (body.pool) {
            // Verify user has manage access to the target pool
            // Ensure session.user.groups is always an array
            const groups = session.user.groups || [];
            const poolAccess = await checkPoolAccess(session.user.username, groups, body.pool);
            if (!poolAccess.allowManage) {
                await logAudit({ username: session.user.username, action: "VM_CREATE", resource: `pool:${body.pool}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "pool_manage_denied" } });
                return NextResponse.json({ error: "permission_denied - Cannot create VMs in this pool" }, { status: 403 });
            }
            await checkPoolLimits(body.pool, 'qemu');
        } else {
            // HIGH-CRITICAL FIX: If no pool is specified, only Admins can create VMs.
            // This prevents regular users from bypassing pool limits and ACLs by creating "orphan" VMs.
            if (!session.user.isAdmin) {
                await logAudit({ username: session.user.username, action: "VM_CREATE", resource: "vm:create", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "orphan_vm_forbidden" } });
                return NextResponse.json({ error: "permission_denied - Only admins can create resources outside of a pool" }, { status: 403 });
            }
        }

        const result = await proxmox.createVM(node, body.vmid, createParams);

        await logAudit({
            username: session.user.username,
            action: "VM_CREATE",
            resource: `vm:${body.vmid}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { node, ...createParams },
            status: "SUCCESS"
        });

        return NextResponse.json({ data: result }); // Returns UPID
    } catch (error: any) {
        console.error("Error creating VM:", error);
        await logAudit({ username: session.user?.username || "unknown", action: "VM_CREATE", resource: "vm:create", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { error: error?.message || "unknown_error" } });
        return NextResponse.json({ error: "Failed to create VM" }, { status: 500 });
    }
}
