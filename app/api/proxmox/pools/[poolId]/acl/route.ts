import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { buildGroupIdVariants } from "@/lib/acl";
import { logger } from "@/lib/logger";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ poolId: string }> } // In Next.js 15+, params is a Promise
) {
    const { poolId } = await params;
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_POOLS", resource: `pool:${poolId || "unknown"}`, details: { poolId, reason: "unauthorized", view: "acl" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `pool-acl-read:${session.user.username}:${poolId}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_POOLS", resource: `pool:${poolId || "unknown"}`, details: { poolId, reason: "rate_limit", retryAfter: rl.retryAfter || 60, view: "acl" }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    if (!poolId) {
        await logAudit({ username: session.user.username, action: "VIEW_POOLS", resource: "pool:unknown", details: { reason: "validation_failed", error: "missing_pool_id", view: "acl" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Pool ID is required" }, { status: 400 });
    }

    try {
        // Authorization check (HIGH-2): Verify user has access to this pool
        const [pools, acls] = await Promise.all([
            proxmox.getPools(),
            proxmox.getACLs()
        ]);

        const currentUser = session.user.username;
        const userGroups = session.user.groups || [];
        const groupIdVariants = buildGroupIdVariants(userGroups);
        const pool = pools.find(p => p.poolid === poolId);

        if (!pool) {
            await logAudit({ username: session.user.username, action: "VIEW_POOLS", resource: `pool:${poolId}`, details: { poolId, reason: "not_found", view: "acl" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Pool not found" }, { status: 404 });
        }

        let hasAccess = false;

        // Check ownership
        if (poolId.startsWith(`DEV_${currentUser}_`)) {
            hasAccess = true;
        }

        // Check ACLs if not owner
        if (!hasAccess) {
            const poolPath = `/pool/${poolId}`;
            const relevantAcls = acls.filter(acl => {
                if (acl.path !== poolPath) return false;

                if (acl.type === 'user') {
                    const [aclUser] = acl.ugid.split('@');
                    return aclUser === currentUser || acl.ugid === currentUser;
                }

                if (acl.type === 'group') {
                    return groupIdVariants.has(acl.ugid) || groupIdVariants.has(acl.ugid.toLowerCase());
                }

                return false;
            });

            hasAccess = relevantAcls.length > 0;
        }

        if (!hasAccess) {
            await logAudit({ username: session.user.username, action: "VIEW_POOLS", resource: `pool:${poolId}`, details: { poolId, reason: "permission_denied", view: "acl" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Forbidden: You don't have access to this pool" }, { status: 403 });
        }

        const poolPath = `/pool/${poolId}`;

        // Filter ACLs for this pool
        const poolAcls = acls.filter(acl => acl.path === poolPath).map(acl => ({
            user: acl.ugid,
            role: acl.roleid,
            type: acl.type


        }));

        logAudit({
            username: session.user!.username,
            action: "VIEW_POOLS",
            resource: `pool:${poolId}`,
            details: { poolId, aclCount: poolAcls.length },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json({ acls: poolAcls });

    } catch (error: any) {
        logger.error("Error fetching pool ACLs", error);
        await logAudit({ username: session.user?.username || "unknown", action: "VIEW_POOLS", resource: `pool:${poolId || "unknown"}`, details: { poolId, reason: "exception", message: error?.message || "unknown_error", view: "acl" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
    }
}
