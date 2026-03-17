import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { z } from "zod";
import { validateCSRFToken } from "@/lib/csrf";
import { buildGroupIdVariants, buildUsernameVariants, checkPoolAccess, checkPoolOwnership, derivePoolAccessFromAclRoles } from "@/lib/acl";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const [pools, acls] = await Promise.all([
            proxmox.getPools(),
            proxmox.getACLs()
        ]);
        const username = session.user.username;
        const userGroups = session.user.groups || [];
        const usernameVariants = buildUsernameVariants(username);
        const groupIdVariants = buildGroupIdVariants(userGroups);

        // For the list view, allow both ownership and explicit ACL access.
        const isAdmin = session.user?.isAdmin || false;
        const userPools = pools
            .map((pool) => {
                const ownership = checkPoolOwnership(username, userGroups, pool.poolid, isAdmin);
                if (ownership.hasAccess) {
                    return { ...pool, allowManage: ownership.allowManage };
                }

                const poolPath = `/pool/${pool.poolid}`;
                const relevantAcls = acls.filter((acl) => {
                    if (acl.path !== poolPath) return false;

                    if (acl.type === 'user') {
                        const [aclUser] = acl.ugid.split('@');
                        return usernameVariants.has(aclUser) || usernameVariants.has(acl.ugid);
                    }

                    if (acl.type === 'group') {
                        return groupIdVariants.has(acl.ugid) || groupIdVariants.has(acl.ugid.toLowerCase());
                    }

                    return false;
                });

                if (relevantAcls.length === 0) {
                    return null;
                }

                const aclDerivedAccess = derivePoolAccessFromAclRoles(relevantAcls.map((acl) => acl.roleid));
                if (!aclDerivedAccess.hasAccess) {
                    return null;
                }

                return { ...pool, allowManage: aclDerivedAccess.allowManage };
            })
            .filter(pool => pool !== null);

        await logAudit({
            username: session.user!.username,
            action: "VIEW_POOLS",
            resource: "cluster:pools",
            details: { poolCount: userPools.length, isAdmin: session.user?.isAdmin || false },
            status: "SUCCESS"
        });

        return NextResponse.json({ pools: userPools });
    } catch (error: any) {
        logger.error("Error fetching pools", error);
        return NextResponse.json({ error: "Failed to fetch pools" }, { status: 500 });
    }
}

const createPoolSchema = z.object({
    comment: z.string()
        .max(255, 'Comment must be less than 255 characters')
        .regex(/^[a-zA-Z0-9\s\-_.,!?]*$/, 'Comment contains invalid characters')
        .optional(),
    owner: z.object({
        type: z.enum(['user', 'group']),
        name: z.string().min(1)
    }).optional()
});

export async function POST(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.username) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF Protection (CRITICAL-1)
    if (!validateCSRFToken(request, session.csrfToken)) {
        logger.warn('CSRF token validation failed for pool creation', { user: session.user.username });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Rate limiting (CRITICAL-3)
    const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
    const rateLimit = await checkRateLimitAsync(`pool-create:${identifier}`, RATE_LIMITS.POOL_CREATE);

    if (!rateLimit.allowed) {
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

        // Validate input
        const validationResult = createPoolSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({
                error: "Invalid input",
                details: validationResult.error.flatten()
            }, { status: 400 });
        }

        const { comment, owner } = validationResult.data;
        const username = session.user.username;
        const userGroups = session.user.groups || [];

        // Determine effective owner
        let ownerName = username;
        let isGroupOwned = false;

        if (owner && owner.type === 'group') {
            // Verify user is member of the group
            const groupName = owner.name;
            const isMember = userGroups.some((g: string) => g.toLowerCase() === groupName.toLowerCase());

            if (!isMember && !session.user.isAdmin) {
                return NextResponse.json({ error: "You are not a member of this group" }, { status: 403 });
            }

            ownerName = groupName;
            isGroupOwned = true;
        } else if (owner && owner.type === 'user') {
            if (owner.name !== username && !session.user.isAdmin) {
                return NextResponse.json({ error: "Cannot create pool for another user" }, { status: 403 });
            }
            ownerName = owner.name;
        }

        // Validate owner name safety
        if (ownerName.includes('/') || ownerName.includes('\\') || ownerName.includes('..')) {
            return NextResponse.json({ error: "Invalid owner name format" }, { status: 400 });
        }

        // proxmoxOwnerName will hold the actual ID used in Proxmox (e.g. FAST-SDC)
        // ownerName will stay as the base name (e.g. FAST) for the pool ID prefix
        let proxmoxOwnerName = ownerName;

        // Validate group existence in Proxmox if group-owned (CRITICAL: Do not auto-create)
        if (isGroupOwned) {
            try {
                const proxmoxGroups = await proxmox.getGroups();

                // Fuzzy matching logic to handle case sensitivity and suffixes (e.g. CyberForce vs Cyberforce-SDC)
                let matchedGroup = proxmoxGroups.find(g => g.groupid === ownerName);

                if (!matchedGroup) {
                    // Try case-insensitive match
                    matchedGroup = proxmoxGroups.find(g => g.groupid.toLowerCase() === ownerName.toLowerCase());
                }

                if (!matchedGroup) {
                    // Try with envRealm suffix
                    const envRealm = process.env.PROXMOX_USER_REALM;
                    if (envRealm) {
                        matchedGroup = proxmoxGroups.find(g => g.groupid.toLowerCase() === `${ownerName.toLowerCase()}-${envRealm.toLowerCase()}`);
                    }
                }

                if (!matchedGroup) {
                    // Try with -SDC suffix as a reliable fallback for AD environments
                    matchedGroup = proxmoxGroups.find(g => g.groupid.toLowerCase() === `${ownerName.toLowerCase()}-sdc`);
                }

                if (!matchedGroup) {
                    return NextResponse.json({
                        error: `The group '${ownerName}' does not exist in Proxmox. Please ask an administrator to create this group in the Proxmox Datacenter -> Groups settings.`
                    }, { status: 400 });
                }

                // If we found a fuzzy match, update the proxmoxOwnerName to the actual Proxmox group ID
                // ensuring the ACL assignment works correctly, but KEEP ownerName as-is for the pool ID prefix
                proxmoxOwnerName = matchedGroup.groupid;
                if (matchedGroup.groupid !== ownerName) {
                    logger.info(`Mapped App group '${ownerName}' to Proxmox group '${matchedGroup.groupid}' for ACLs`);
                }

            } catch (error: any) {
                logger.error(`Failed to validate group existence for ${ownerName}`, { error });
                // We choose to fail safe here to avoid creating pools with broken permissions
                return NextResponse.json({
                    error: "Failed to validate group existence in Proxmox. Please try again later."
                }, { status: 500 });
            }
        } else {
            // For user ownership, resolve the full Proxmox username
            if (!proxmoxOwnerName.includes('@')) {
                const envRealm = process.env.PROXMOX_USER_REALM;
                if (envRealm) {
                    proxmoxOwnerName = `${ownerName}@${envRealm}`;
                } else {
                    const domains = await proxmox.getDomains();
                    const preferredRealm = domains.find(d => d.type === 'ad' || d.type === 'ldap');
                    if (preferredRealm) {
                        proxmoxOwnerName = `${ownerName}@${preferredRealm.realm}`;
                    } else if (domains.length > 0) {
                        proxmoxOwnerName = `${ownerName}@${domains[0].realm}`;
                    } else {
                        proxmoxOwnerName = `${ownerName}@pam`;
                    }
                }
            }
        }

        // Fetch existing pools to determine the next number
        const pools = await proxmox.getPools();

        // Pattern: DEV_ownerName_number
        // Sanitize ownerName (the base name) for ID usage
        const sanitizedOwnerName = ownerName.replace(/[^a-zA-Z0-9\-_]/g, '_');
        const prefix = `DEV_${sanitizedOwnerName}_`;
        let maxNumber = 0;

        pools.forEach(pool => {
            if (pool.poolid.startsWith(prefix)) {
                const parts = pool.poolid.split('_');
                const numStr = parts[parts.length - 1];
                const num = parseInt(numStr, 10);
                if (!isNaN(num) && num > maxNumber) {
                    maxNumber = num;
                }
            }
        });

        const nextNumber = maxNumber + 1;
        const poolid = `${prefix}${nextNumber}`;

        // Append ownership info to comment - show both for transparency
        const finalComment = comment
            ? `${comment} [Owner: ${isGroupOwned ? 'group' : 'user'}:${proxmoxOwnerName}]`
            : `[Owner: ${isGroupOwned ? 'group' : 'user'}:${proxmoxOwnerName}]`;


        await proxmox.createPool(poolid, finalComment);

        // --- Assign Permissions ---
        try {
            const path = `/pool/${poolid}`;

            if (isGroupOwned) {
                // Assign Group Permission using the technical Proxmox ID
                await proxmox.addSimpleACL(path, 'Administrator', undefined, proxmoxOwnerName);

                await logAudit({
                    username: username,
                    action: "POOL_ACL_UPDATE",
                    resource: `pool:${poolid}`,
                    details: { action: 'add', role: 'Administrator', target_group: proxmoxOwnerName, auto_assigned: true },
                    status: "SUCCESS"
                });
            } else {
                // Assign User Permission using the technical Proxmox ID
                await proxmox.addSimpleACL(path, 'Administrator', proxmoxOwnerName);

                await logAudit({
                    username: username,
                    action: "POOL_ACL_UPDATE",
                    resource: `pool:${poolid}`,
                    details: { action: 'add', role: 'Administrator', target_user: proxmoxOwnerName, auto_assigned: true },
                    status: "SUCCESS"
                });
            }

        } catch (aclError: any) {
            logger.error("Failed to assign creator permissions, but pool was created", { error: aclError });
            // Don't fail the request, just log it. 
        }

        // Log the action for audit
        await logAudit({
            username: username,
            action: "POOL_CREATE",
            resource: `pool:${poolid}`,
            details: { comment: finalComment, owner: proxmoxOwnerName, type: isGroupOwned ? 'group' : 'user' },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true, poolid });
    } catch (error: any) {
        // Log failure for audit trail
        await logAudit({
            username: session.user?.username || 'unknown',
            action: "POOL_CREATE",
            resource: "cluster:pools",
            details: { error: error.message },
            status: "FAILURE"
        }).catch(() => { });

        logger.error("Error creating pool", error);
        return NextResponse.json({ error: "Failed to create pool" }, { status: 500 });
    }
}
