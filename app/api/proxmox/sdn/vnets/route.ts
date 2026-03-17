import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { z } from "zod";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { getResourceLimitsConfig } from "@/lib/config";

const getAllowedVnetPrefixes = (username: string): string[] => {
    const normalized = (username || '').trim();
    if (!normalized) return [];

    const variants = new Set<string>([
        `DEV${normalized}`,
        `DEV${normalized.slice(0, 4)}`,
        `DEV${normalized.slice(0, 3)}`,
    ]);

    return Array.from(variants)
        .filter(prefix => prefix.length > 3)
        .map(prefix => prefix.toLowerCase());
};

export async function GET(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const username = session.user.username;
        const userGroups = session.user.groups || [];

        // Get query parameter to control filtering mode
        const url = new URL(request.url);
        const includeAll = url.searchParams.get('includeAll') === 'true';

        const allVnets = await proxmox.getVnets();
        console.log("DEBUG: allVnets structure:", JSON.stringify(allVnets[0] || {}, null, 2));
        const acls = await proxmox.getACLs();

        // Check if user is admin
        const isAdmin = session.user.isAdmin || acls.some(acl =>
            acl.path === '/' &&
            ['Administrator', 'PVEAdmin'].includes(acl.roleid) &&
            (
                (acl.type === 'user' && (acl.ugid === username || acl.ugid.startsWith(`${username}@`))) ||
                (acl.type === 'group' && userGroups.includes(acl.ugid))
            )
        );

        // Admins see all VNETs on dashboard, but hardware bridge selection is restricted to userlabs/altzone/allzone for everyone
        let vnets = allVnets;
        if (isAdmin) {
            // Even admins only see userlabs/altzone/allzone when selecting bridges for VM hardware
            if (includeAll) {
                vnets = allVnets.filter(v => {
                    if (!v.zone) return false;
                    const zoneLower = v.zone.toLowerCase();
                    return zoneLower.includes('userlab') || zoneLower.includes('altzone') || zoneLower.includes('allzone');
                });
            }
        } else {
            vnets = allVnets.filter(v => {
                // Filter by zone (Userlabs/Altzone/AllZone only)
                if (!v.zone) return false;
                const zoneLower = v.zone.toLowerCase();
                const inDesignatedZone = zoneLower.includes('userlab') || zoneLower.includes('altzone') || zoneLower.includes('allzone');

                if (!inDesignatedZone) return false;

                // If includeAll=true (for network device selection), only filter by zone
                if (includeAll) return true;

                // Otherwise (for dashboard), filter by username too
                if (!v.alias) return false;
                const aliasLower = v.alias.toLowerCase();
                const usernameLower = username.toLowerCase();
                return aliasLower.endsWith(`_${usernameLower}`) || aliasLower === usernameLower;
            });
        }

        logAudit({
            username: session.user.username,
            action: "VIEW_VNETS",
            resource: "sdn:vnets",
            details: { isAdmin, vnetCount: vnets.length, includeAll }
        });

        return NextResponse.json({ vnets });
    } catch (error: unknown) {
        logger.error("Error fetching vnets", error);
        return NextResponse.json({ error: "Failed to fetch vnets" }, { status: 500 });
    }
}


// Input validation schema (CRITICAL-2)
const createVnetSchema = z.object({
    vnet: z.string()
        .min(1, 'VNET name is required')
        .max(15, 'VNET name must be 15 characters or less')
        .regex(/^[a-zA-Z0-9_-]+$/, 'VNET name can only contain letters, numbers, underscores, and hyphens'),
    zone: z.string()
        .min(1, 'Zone is required')
        .max(50, 'Zone name too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Zone name contains invalid characters'),
    tag: z.number()
        .int('Tag must be an integer')
        .min(1, 'Tag must be at least 1')
        .max(4094, 'Tag must not exceed 4094')
        .optional(),
    alias: z.string()
        .max(255, 'Alias too long')
        .regex(/^[a-zA-Z0-9_-]*$/, 'Alias can only contain letters, numbers, underscores, and hyphens')
        .optional(),
    vlanaware: z.boolean().optional(),
    poolId: z.string().optional() // New field
});

export async function POST(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF Protection (CRITICAL-1)
    if (!validateCSRFToken(request, session.csrfToken)) {
        logger.warn('CSRF token validation failed for VNET creation', { user: session.user.username });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Rate limiting (CRITICAL-3)
    const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
    const rateLimit = await checkRateLimitAsync(`vnet-create:${identifier}`, RATE_LIMITS.VNET_CREATE);

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

        // Input validation (CRITICAL-2)
        const validationResult = createVnetSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({
                error: "Invalid input",
                details: validationResult.error.flatten().fieldErrors
            }, { status: 400 });
        }

        const { vnet, zone, tag, alias: providedAlias, vlanaware, poolId } = validationResult.data;

        // --- Userlabs Logic Check ---
        if (zone.toLowerCase().includes('userlab')) {
            if (!tag || tag < 1001 || tag > 1255) {
                return NextResponse.json({
                    error: "Invalid Tag",
                    message: "Vnets in Userlabs must have a tag between 1001 and 1255."
                }, { status: 400 });
            }
        }

        const username = session.user.username;
        const userGroups = session.user.groups || [];
        const acls = await proxmox.getACLs();

        const isAdmin = session.user.isAdmin || acls.some(acl =>
            acl.path === '/' &&
            ['Administrator', 'PVEAdmin'].includes(acl.roleid) &&
            (
                (acl.type === 'user' && (acl.ugid === username || acl.ugid.startsWith(`${username}@`))) ||
                (acl.type === 'group' && userGroups.includes(acl.ugid))
            )
        );

        // --- DASHBOARD VNET LIMIT CHECK ---
        let finalAlias = providedAlias || `${tag || '0'}_DEV_${username}`;

        const resourceLimits = await getResourceLimitsConfig();
        const maxVnetsPerUser = resourceLimits.maxVnetsPerUser || 0;

        if (!poolId && !isAdmin && maxVnetsPerUser > 0) {
            const allVnets = await proxmox.getVnets();
            const usernameLower = username.toLowerCase();

            const userVnets = allVnets.filter(v => {
                if (!v.zone) return false;
                const zoneLower = v.zone.toLowerCase();
                const inDesignatedZone = zoneLower.includes('userlab') || zoneLower.includes('altzone') || zoneLower.includes('allzone');
                if (!inDesignatedZone) return false;
                if (!v.alias) return false;
                const aliasLower = v.alias.toLowerCase();
                return aliasLower.endsWith(`_${usernameLower}`) || aliasLower === usernameLower;
            });

            if (userVnets.length >= maxVnetsPerUser) {
                return NextResponse.json({
                    error: `Dashboard limit reached: Max ${maxVnetsPerUser} VNETs allowed.`
                }, { status: 400 });
            }
        }

        // --- POOL LIMIT CHECK ---
        if (poolId) {
            // 1. Verify access to pool
            const canAccessPool = isAdmin || acls.some(acl =>
                acl.path === `/pool/${poolId}` &&
                ['PVEVMAdmin', 'PVEAdmin', 'Administrator'].includes(acl.roleid) &&
                (
                    (acl.type === 'user' && (acl.ugid === username || acl.ugid.startsWith(`${username}@`))) ||
                    (acl.type === 'group' && userGroups.includes(acl.ugid))
                )
            );

            if (!canAccessPool) {
                return NextResponse.json({ error: "Access to pool denied" }, { status: 403 });
            }

            // 4. Force Alias Format for tracking
            // Format: PoolId_Tag_DEV_Username (or similar)
            // Existing convention seems to be: 100_DEV_username.
            // We will prefix with PoolId: pool1_100_DEV_username
            finalAlias = `${poolId}_${tag || '0'}_DEV_${username}`;
        }

        if (!isAdmin) {
            const allowedPrefixes = getAllowedVnetPrefixes(username);
            const normalizedVnet = vnet.toLowerCase();
            const isValidName = allowedPrefixes.some((prefix) => normalizedVnet.startsWith(prefix));

            if (!isValidName) {
                return NextResponse.json({
                    error: "Permission Denied",
                    message: `You can only create VNETs starting with one of: ${allowedPrefixes.join(', ')}. Contact an administrator for other names.`
                }, { status: 403 });
            }
        }

        await proxmox.createVnet({ vnet, zone, tag, alias: finalAlias, vlanaware });

        await logAudit({
            username: session.user.username,
            action: "VNET_CREATE",
            resource: `vnet:${vnet}`,
            details: { zone, tag, alias: finalAlias, vlanaware, poolId },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await logAudit({
            username: session.user?.username || 'unknown',
            action: "VNET_CREATE",
            resource: "sdn:vnets",
            details: { error: errorMessage },
            status: "FAILURE"
        }).catch(() => { });

        logger.error("Error creating vnet", error);
        return NextResponse.json({ error: "Failed to create vnet" }, { status: 500 });
    }
}

// Input validation schema for DELETE
const deleteVnetSchema = z.object({
    vnet: z.string()
        .min(1, 'VNET name is required')
        .max(15, 'VNET name must be 15 characters or less')
        .regex(/^[a-zA-Z0-9_-]+$/, 'VNET name can only contain letters, numbers, underscores, and hyphens'),
});

export async function DELETE(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CSRF Protection
    if (!validateCSRFToken(request, session.csrfToken)) {
        logger.warn('CSRF token validation failed for VNET deletion', { user: session.user.username });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Rate limiting
    const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
    const rateLimit = await checkRateLimitAsync(`vnet-delete:${identifier}`, RATE_LIMITS.VNET_CREATE);

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

        // Input validation
        const validationResult = deleteVnetSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({
                error: "Invalid input",
                details: validationResult.error.flatten().fieldErrors
            }, { status: 400 });
        }

        const { vnet } = validationResult.data;

        // --- Security Check: Can only delete own VNETs or admin ---
        const username = session.user.username;
        const userGroups = session.user.groups || [];
        const acls = await proxmox.getACLs();

        const isAdmin = session.user.isAdmin || acls.some(acl =>
            acl.path === '/' &&
            ['Administrator', 'PVEAdmin'].includes(acl.roleid) &&
            (
                (acl.type === 'user' && (acl.ugid === username || acl.ugid.startsWith(`${username}@`))) ||
                (acl.type === 'group' && userGroups.includes(acl.ugid))
            )
        );

        if (!isAdmin) {
            const allVnets = await proxmox.getVnets();
            const targetVnet = allVnets.find(existing => existing.vnet === vnet);

            const alias = targetVnet?.alias?.toLowerCase() || '';
            const usernameLower = username.toLowerCase();
            const isOwnVnet = alias.endsWith(`_dev_${usernameLower}`) || alias.endsWith(`_${usernameLower}`) || alias === usernameLower;

            if (!isOwnVnet) {
                return NextResponse.json({
                    error: "Permission Denied",
                    message: "You can only delete VNETs that you created."
                }, { status: 403 });
            }
        }

        await proxmox.deleteVnet(vnet);

        // logger.audit('vnet.delete', session.user.username, `vnet:${vnet}`, 'success');
        await logAudit({
            username: session.user.username,
            action: "VNET_DELETE",
            resource: `vnet:${vnet}`,
            details: {},
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        logger.error("Error deleting vnet", error);
        return NextResponse.json({ error: "Failed to delete vnet" }, { status: 500 });
    }
}
