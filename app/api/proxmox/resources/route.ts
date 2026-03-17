import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { buildGroupIdVariants } from "@/lib/acl";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = 'force-dynamic';

type ProxmoxResourceRecord = {
    type?: string;
    pool?: string;
    poolid?: string;
    name?: string;
    storage?: string;
};

// Helper to determine if a resource is accessible
function isResourceAccessible(resource: ProxmoxResourceRecord, allowedPools: Set<string>, username: string): boolean {
    // 1. Check Pool Access
    if (resource.pool && allowedPools.has(resource.pool)) {
        return true;
    }

    // 2. Check Name Ownership (DEV_username pattern)
    // FIX: HIGH-1 Use strict prefix matching instead of loose substring match
    if (resource.name && resource.name.startsWith(`DEV_${username}_`)) {
        return true;
    }

    return false;
}

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    try {
        // Get session to verify authentication
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

        if (!session.user?.isLoggedIn || !session.user.username) {
            await logAudit({ username: "anonymous", action: "VIEW_RESOURCES", resource: "cluster:resources", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const rlKey = `proxmox-resources:${session.user.username}:${getRateLimitIdentifier(request)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            await logAudit({ username: session.user.username, action: "VIEW_RESOURCES", resource: "cluster:resources", details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        const username = session.user.username;
        const userGroups = session.user.groups || [];

        // Fetch all required data in parallel
        // We need ACLs to determine permissions
        const [allResources, acls, pools] = await Promise.all([
            proxmox.getResources(),
            proxmox.getACLs(),
            proxmox.getPools()
        ]);
        const resourceList = allResources as ProxmoxResourceRecord[];

        // 1. Check if Admin
        const isAdmin = session.user.isAdmin || acls.some(acl =>
            acl.path === '/' &&
            ['Administrator', 'PVEAdmin'].includes(acl.roleid) &&
            (
                (acl.type === 'user' && (acl.ugid === username || acl.ugid.startsWith(`${username}@`))) ||
                (acl.type === 'group' && userGroups.includes(acl.ugid))
            )
        );

        if (isAdmin) {
            // Admins see everything
            // Check type filter
            const { searchParams } = new URL(request.url);
            const type = searchParams.get('type');

            const filtered = type
                ? resourceList.filter(r => r.type === type)
                : resourceList;

            await logAudit({
                username: session.user!.username,
                action: "VIEW_RESOURCES",
                resource: "cluster:resources",
                details: { type },
                status: "SUCCESS",
                ...client,
            });

            return NextResponse.json({ data: filtered });
        }

        // 2. Non-Admin: Filter Resources

        // Determine accessible pools (logic mirrored from pools/route.ts)
        const accessiblePools = new Set<string>();

        // Ownership pools
        pools.forEach(pool => {
            if (pool.poolid.startsWith(`DEV_${username}_`)) {
                accessiblePools.add(pool.poolid);
            }
        });

        // ACL pools
        const groupIdVariants = buildGroupIdVariants(userGroups);
        acls.forEach(acl => {
            if (acl.path.startsWith('/pool/')) {
                const poolId = acl.path.replace('/pool/', '');

                let matches = false;
                if (acl.type === 'user') {
                    const [aclUser] = acl.ugid.split('@');
                    if (aclUser === username || acl.ugid === username) matches = true;
                } else if (acl.type === 'group') {
                    if (groupIdVariants.has(acl.ugid) || groupIdVariants.has(acl.ugid.toLowerCase())) matches = true;
                }

                if (matches) {
                    accessiblePools.add(poolId);
                }
            }
        });

        // Filter the resources
        const { searchParams } = new URL(request.url);
        const typeFilter = searchParams.get('type');

        const safeResources = resourceList.filter(resource => {
            // Apply type filter if present
            if (typeFilter && resource.type !== typeFilter) {
                return false;
            }

            // Always show the accessible pools themselves
            if (resource.type === 'pool') {
                return typeof resource.poolid === 'string' && accessiblePools.has(resource.poolid);
            }

            // Show VMs/LXC if in accessible pool or owned
            if (resource.type === 'qemu' || resource.type === 'lxc') {
                return isResourceAccessible(resource, accessiblePools, username);
            }

            // Allow specific disk storages for VM creation (configured via ALLOWED_PUBLIC_STORAGES env var)
            if (resource.type === 'storage') {
                const allowedStorages = (process.env.ALLOWED_PUBLIC_STORAGES || '').split(',').map(s => s.trim()).filter(Boolean);
                if (typeof resource.storage === 'string' && allowedStorages.includes(resource.storage)) {
                    return true;
                }
            }

            // Hide Nodes and other Storage by default for non-admins to reduce noise/exposure
            return false;
        });

        await logAudit({
            username: session.user!.username,
            action: "VIEW_RESOURCES",
            resource: "cluster:resources",
            details: { type: typeFilter },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json({ data: safeResources });

    } catch (error: unknown) {
        console.error("Failed to fetch resources:", error);
        await logAudit({ username: "unknown", action: "VIEW_RESOURCES", resource: "cluster:resources", details: { reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
