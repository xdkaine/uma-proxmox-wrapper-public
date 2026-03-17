import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { checkPoolAccess } from "@/lib/acl";
import { getClientContext, logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.username) {
        await logAudit({ username: session.user?.username || "anonymous", action: "POOL_ACL_UPDATE", resource: "pool:acl", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "unauthorized" } });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF Protection (CRITICAL-1)
    if (!validateCSRFToken(request, session.csrfToken)) {
        logger.warn('CSRF token validation failed for ACL addition', { user: session.user.username });
        await logAudit({ username: session.user.username, action: "POOL_ACL_UPDATE", resource: "pool:acl", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_csrf" } });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Rate limiting (CRITICAL-3)
    const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
    const rateLimit = await checkRateLimitAsync(`acl-modify:${identifier}`, RATE_LIMITS.ACL_MODIFY);

    if (!rateLimit.allowed) {
        await logAudit({ username: session.user.username, action: "POOL_ACL_UPDATE", resource: "pool:acl", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "rate_limited", retryAfter: rateLimit.retryAfter } });
        return NextResponse.json(
            { error: `Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.` },
            {
                status: 429,
                headers: {
                    'Retry-After': String(rateLimit.retryAfter)
                }
            }
        );
    }

    try {
        const body = await request.json();
        const { poolId, username: targetUser, groupName, role, type = 'user' } = body;

        // Validate type
        if (type !== 'user' && type !== 'group') {
            return NextResponse.json({ error: "Invalid type. Must be 'user' or 'group'" }, { status: 400 });
        }

        // Validate required fields based on type
        if (type === 'user' && !targetUser) {
            return NextResponse.json({ error: "Missing username" }, { status: 400 });
        }
        if (type === 'group' && !groupName) {
            return NextResponse.json({ error: "Missing groupName" }, { status: 400 });
        }
        if (!poolId || !role) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Validate Role
        const allowedRoles = ['PVEPoolAdmin', 'PVEPoolUser', 'PVEAdmin', 'PVEVMUser', 'PVEVMAdmin'];
        if (!allowedRoles.includes(role)) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }

        // --- Validate Access ---
        const currentUser = session.user.username;
        const userGroups = session.user.groups || [];

        const poolAccess = await checkPoolAccess(currentUser, userGroups, poolId, session.user.isAdmin);
        if (!poolAccess.allowManage) {
            await logAudit({ username: currentUser, action: "POOL_ACL_UPDATE", resource: `pool:${poolId}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "pool_manage_denied" } });
            return NextResponse.json({ error: "You do not have permission to manage this pool" }, { status: 403 });
        }

        // --- Perform Action ---
        // Construct the path
        const path = `/pool/${poolId}`;

        if (type === 'group') {
            const proxmoxGroups = await proxmox.getGroups();
            const envRealm = process.env.PROXMOX_USER_REALM;
            const candidates = [groupName];

            if (envRealm && !groupName.endsWith(`-${envRealm}`)) {
                candidates.push(`${groupName}-${envRealm}`);
            }

            const matchedGroup = candidates
                .map(candidate => proxmoxGroups.find(g => g.groupid === candidate)
                    || proxmoxGroups.find(g => g.groupid.toLowerCase() === candidate.toLowerCase()))
                .find(Boolean);

            if (!matchedGroup) {
                return NextResponse.json({
                    error: `The group '${groupName}' does not exist in Proxmox. Please ask an administrator to create this group in the Proxmox Datacenter -> Groups settings.`
                }, { status: 400 });
            }

            const groupNameFull = matchedGroup.groupid;

            await proxmox.addSimpleACL(path, role, undefined, groupNameFull);
            // logger.audit('pool.acl.add', currentUser, `pool:${poolId}`, 'success', `role:${role} group:${groupNameFull}`);
            await logAudit({
                username: currentUser,
                action: "POOL_ACL_UPDATE",
                resource: `pool:${poolId}`,
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { action: 'add', role, target: groupNameFull, type: 'group' },
                status: "SUCCESS"
            });
        } else {
            // Add user ACL
            let targetUserFull = targetUser;
            if (!targetUserFull.includes('@')) {
                // Use environment variable for realm
                const envRealm = process.env.PROXMOX_USER_REALM;

                if (envRealm) {
                    targetUserFull = `${targetUser}@${envRealm}`;
                } else {
                    // Fetch valid domains from Proxmox to find the correct realm
                    try {
                        const domains = await proxmox.getDomains();
                        const preferredRealm = domains.find(d => d.type === 'ad' || d.type === 'ldap');

                        if (preferredRealm) {
                            targetUserFull = `${targetUser}@${preferredRealm.realm}`;
                        } else if (domains.length > 0) {
                            targetUserFull = `${targetUser}@${domains[0].realm}`;
                        } else {
                            logger.error('No PROXMOX_USER_REALM set and no domains found');
                            throw new Error('Cannot determine user realm');
                        }
                    } catch (err: any) {
                        logger.warn("Failed to fetch domains for realm auto-detection", { error: err });
                        throw new Error('Cannot determine user realm');
                    }
                }
            }

            // Add the ACL
            // Note: 'users' argument in addSimpleACL expects comma-separated list of users.
            await proxmox.addSimpleACL(path, role, targetUserFull);
            // logger.audit('pool.acl.add', currentUser, `pool:${poolId}`, 'success', `role:${role} user:${targetUserFull}`);
            await logAudit({
                username: currentUser,
                action: "POOL_ACL_UPDATE",
                resource: `pool:${poolId}`,
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { action: 'add', role, target: targetUserFull, type: 'user' },
                status: "SUCCESS"
            });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        logger.error("Error setting ACL", error);
        await logAudit({ username: session.user?.username || "unknown", action: "POOL_ACL_UPDATE", resource: "pool:acl", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { error: error?.message || "unknown_error" } });
        return NextResponse.json({ error: "Failed to set permission" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const client = getClientContext(request);
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.username) {
        await logAudit({ username: session.user?.username || "anonymous", action: "POOL_ACL_UPDATE", resource: "pool:acl", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "unauthorized" } });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF Protection (CRITICAL-1)
    if (!validateCSRFToken(request, session.csrfToken)) {
        logger.warn('CSRF token validation failed for ACL removal', { user: session.user.username });
        await logAudit({ username: session.user.username, action: "POOL_ACL_UPDATE", resource: "pool:acl", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "invalid_csrf" } });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Rate limiting (CRITICAL-3)
    const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
    const rateLimit = await checkRateLimitAsync(`acl-modify:${identifier}`, RATE_LIMITS.ACL_MODIFY);

    if (!rateLimit.allowed) {
        await logAudit({ username: session.user.username, action: "POOL_ACL_UPDATE", resource: "pool:acl", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "rate_limited", retryAfter: rateLimit.retryAfter } });
        return NextResponse.json(
            { error: `Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.` },
            {
                status: 429,
                headers: {
                    'Retry-After': String(rateLimit.retryAfter)
                }
            }
        );
    }

    try {
        // Parse body - using json() for DELETE is valid in Next.js/Fetch
        const body = await request.json();
        const { poolId, username, groupName, role, type = 'user' } = body;

        let targetUser = username;
        if (type === 'group') {
            targetUser = groupName;
        }

        if (!poolId || !targetUser || !role) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const currentUser = session.user.username;
        const userGroups = session.user.groups || [];

        if (targetUser === currentUser || targetUser.startsWith(`${currentUser}@`)) {
            return NextResponse.json({ error: "Permission denied: Cannot remove your own permissions." }, { status: 403 });
        }

        // Fetch ACLs to determine Current User's role on this pool / globally
        const acls = await proxmox.getACLs();
        const poolPath = `/pool/${poolId}`;

        // Find what permissions the CURRENT user has
        // We're looking for global PVEAdmin or Pool-specific PVEAdmin/Administrator
        let isAdministrator = session.user.isAdmin || false;
        let isPveAdmin = session.user.isAdmin || false;

        // Check Ownership - Owner is effectively Administrator
        if (poolId.startsWith(`DEV_${currentUser}_`)) {
            isAdministrator = true;
        }

        // Parse CNs from userGroups for easier matching against Proxmox groups
        const groupCNs = userGroups.map((dn: string) => {
            const match = dn.match(/^CN=([^,]+)/i);
            return match ? match[1] : dn;
        });

        // Check ACLs
        for (const acl of acls) {
            let appliesToUser = false;

            if (acl.type === 'user') {
                // Exact match: either "username" or "username@realm"
                const [aclUser] = acl.ugid.split('@');
                appliesToUser = (aclUser === currentUser || acl.ugid === currentUser);
            } else if (acl.type === 'group') {
                // Check against full DNs or extracted CNs
                appliesToUser = (userGroups.includes(acl.ugid) || groupCNs.includes(acl.ugid));
            } else if (acl.type === 'token') {
                appliesToUser = acl.ugid.startsWith(currentUser);
            }

            if (!appliesToUser) continue;

            // Check if path matches (global '/' or pool specific)
            if (acl.path === '/' || acl.path === poolPath) {
                if (acl.roleid === 'Administrator') isAdministrator = true;
                if (acl.roleid === 'PVEAdmin') isPveAdmin = true;
            }
        }

        // Logic Requiement:
        // - Administrator can remove ANYONE.
        // - PVEAdmin can remove ANYONE ... EXCEPT ... 'Administrator'.

        if (!isAdministrator && !isPveAdmin) {
            await logAudit({ username: currentUser, action: "POOL_ACL_UPDATE", resource: `pool:${poolId}`, status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { reason: "permission_denied" } });
            return NextResponse.json({ error: "permission denied" }, { status: 403 });
        }

        // If trying to remove 'Administrator' role, you MUST be 'Administrator'
        // (i.e. PVEAdmin cannot remove Administrator)
        if (role === 'Administrator' && !isAdministrator) {
            return NextResponse.json({ error: "Permission denied: Cannot remove Administrator role" }, { status: 403 });
        }

        // --- Perform Removal ---
        // Construct path
        const path = `/pool/${poolId}`;

        // We need exact username match as stored in Proxmox (likely contains @realm)
        // Since we are iterating *existing* permissions in the UI, we should pass the full user string back.
        // But the UI might just pass 'jsmith'.
        // However, the `targetUser` from the UI list (manage-users-dialog) usually comes from the ACL list which HAS the full user string.

        if (type === 'group') {
            await proxmox.removeSimpleACL(path, role, undefined, groupName);
        } else {
            await proxmox.removeSimpleACL(path, role, targetUser);
        }

        // logger.audit('pool.acl.remove', currentUser, `pool:${poolId}`, 'success', `role:${role} ${type}:${targetUser}`);
        await logAudit({
            username: currentUser,
            action: "POOL_ACL_UPDATE",
            resource: `pool:${poolId}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { action: 'remove', role, target: targetUser, type },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        logger.error("Error removing ACL", error);
        await logAudit({ username: session.user?.username || "unknown", action: "POOL_ACL_UPDATE", resource: "pool:acl", status: "FAILURE", ipAddress: client.ipAddress, userAgent: client.userAgent, details: { error: error?.message || "unknown_error" } });
        return NextResponse.json({ error: "Failed to remove permission" }, { status: 500 });
    }
}
