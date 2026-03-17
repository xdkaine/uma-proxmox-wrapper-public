

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { checkPoolAccess } from "@/lib/acl";
import { validateCSRFToken } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ poolId: string }> }
) {
    const { poolId } = await params;
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.username) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `pool-detail:${session.user.username}:${poolId}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const username = session.user.username;
        const userGroups = session.user.groups || [];

        // Check Permissions (Read Access is enough)
        const { hasAccess } = await checkPoolAccess(username, userGroups, poolId, session.user.isAdmin);

        if (!hasAccess) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // Fetch Pool Details, All Resources (for live stats), and Nodes (for host stats)
        const [poolData, allResources, nodes] = await Promise.all([
            proxmox.getPool(poolId),
            proxmox.getResources(),
            proxmox.getNodes()
        ]);

        // Merge live stats into pool members
        // poolData.members contains the list of VMs in the pool
        // allResources contains live stats (cpu, mem, uptime, etc.)
        if (poolData && poolData.members) {
            poolData.members = poolData.members.map((member: any) => {
                // Find matching resource. valid id in members is usually "qemu/100" or similar
                const resource = allResources.find((r: any) => r.id === member.id);
                return {
                    ...member,
                    ...(resource || {}), // Merge dynamic stats if found
                };
            });
        }

        return NextResponse.json({
            pool: poolData,
            nodes: nodes
        });

    } catch (error: any) {
        console.error("Error fetching pool details:", error);
        return NextResponse.json({ error: "Failed to fetch pool details" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ poolId: string }> }
) {
    const client = getClientContext(request);
    const { poolId } = await params;
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.username) {
        await logAudit({ username: session.user?.username || "anonymous", action: "POOL_DELETE", resource: `pool:${poolId}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "unauthorized" } });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL-3: CSRF Protection for state-changing operation
    if (!validateCSRFToken(request, session.csrfToken)) {
        logger.warn('CSRF token validation failed for pool deletion', {
            user: session.user.username,
            poolId
        });
        await logAudit({ username: session.user.username, action: "POOL_DELETE", resource: `pool:${poolId}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_csrf" } });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    try {
        const username = session.user.username;
        const userGroups = session.user.groups || [];

        // 1. Check Permissions
        // User must be able to manage this pool (similar logic to POST ACL or GET pools)
        const { allowManage } = await checkPoolAccess(username, userGroups, poolId, session.user.isAdmin);

        if (!allowManage) {
            await logAudit({ username, action: "POOL_DELETE", resource: `pool:${poolId}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "permission_denied" } });
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // 2. Check if pool contains VMs
        try {
            const poolDetails = await proxmox.getPool(poolId);
            const members = poolDetails.members || [];

            // Filter only VMs/LXC (type: qemu or lxc)
            const vms = members.filter((m: any) => m.type === 'qemu' || m.type === 'lxc');

            if (vms.length > 0) {
                await logAudit({ username, action: "POOL_DELETE", resource: `pool:${poolId}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "pool_not_empty", vmCount: vms.length } });
                return NextResponse.json({
                    error: "pool_not_empty",
                    message: "Pool contains active VMs/Containers. Please remove them before deleting.",
                    vmCount: vms.length
                }, { status: 409 });
            }

        } catch (fetchError) {
            // If fetching pool details fails, it might not exist or other error.
            console.error("Error checking pool members:", fetchError);
            // Proceed with caution or fail? 
            // If we can't verify it's empty, we shouldn't allow delete via this safe endpoint.
            return NextResponse.json({ error: "verification_failed", message: "Could not verify pool is empty." }, { status: 500 });
        }

        // 3. Delete Pool
        await proxmox.deletePool(poolId);
        console.log(`User ${username} deleted pool ${poolId}`);

        await logAudit({
            username: username,
            action: "POOL_DELETE",
            resource: `pool:${poolId}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {},
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Error deleting pool:", error);
        await logAudit({ username: session.user?.username || "unknown", action: "POOL_DELETE", resource: `pool:${poolId}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { error: error?.message || "unknown_error" } });
        return NextResponse.json({ error: "Failed to delete pool" }, { status: 500 });
    }
}
