import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientContext, logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.username) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Rate limiting
        const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
        const rateLimit = await checkRateLimitAsync(`acl-read:${identifier}`, { windowMs: 60 * 1000, maxAttempts: 10 });

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: `Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
            );
        }

        const username = session.user.username;
        const userGroups = session.user.groups || [];

        // Fetch all ACLs
        const acls = await proxmox.getACLs();

        // Check if user is an Administrator or PVEAdmin
        // We consider an Admin if they have the role on the root '/' path
        const isAdmin = session.user.isAdmin || acls.some(acl =>
            acl.path === '/' &&
            ['Administrator', 'PVEAdmin'].includes(acl.roleid) &&
            (
                (acl.type === 'user' && (acl.ugid === username || acl.ugid.startsWith(`${username}@`))) ||
                (acl.type === 'group' && userGroups.includes(acl.ugid)) ||
                (acl.type === 'token' && acl.ugid.startsWith(username))
            )
        );

        if (isAdmin) {
            // Admins see everything
            return NextResponse.json({ acls });
        }

        // Regular users only see ACLs that apply to them
        const filteredAcls = acls.filter(acl => {
            if (acl.type === 'user') {
                const [aclUser] = acl.ugid.split('@');
                return aclUser === username || acl.ugid === username;
            }
            if (acl.type === 'group') {
                return userGroups.includes(acl.ugid);
            }
            if (acl.type === 'token') {
                return acl.ugid.startsWith(username);
            }
            return false;
        });

        return NextResponse.json({ acls: filteredAcls });

    } catch (error: any) {
        console.error("Error fetching ACLs:", error);
        return NextResponse.json({ error: "Failed to fetch ACLs" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const client = getClientContext(request);
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    if (!session.user?.isLoggedIn || !session.user.username) {
        await logAudit({
            username: session.user?.username || "anonymous",
            action: "ACL_UPDATE",
            resource: "access:acl",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin-only -- this endpoint is used exclusively from admin dashboards.
    // Non-admin pool ACL changes go through POST /api/proxmox/pools/acl instead.
    if (!session.user.isAdmin) {
        await logAudit({
            username: session.user.username,
            action: "ACL_UPDATE",
            resource: "access:acl",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "forbidden_non_admin" },
        });
        return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    // CSRF Protection
    const { validateCSRFToken } = await import("@/lib/csrf");
    if (!validateCSRFToken(request, session.csrfToken)) {
        await logAudit({
            username: session.user.username,
            action: "ACL_UPDATE",
            resource: "access:acl",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "invalid_csrf" },
        });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Rate limiting
    const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
    const rateLimit = await checkRateLimitAsync(`acl-write:${identifier}`, RATE_LIMITS.ACL_MODIFY);
    if (!rateLimit.allowed) {
        await logAudit({
            username: session.user.username,
            action: "ACL_UPDATE",
            resource: "access:acl",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "rate_limited", retryAfter: rateLimit.retryAfter },
        });
        return NextResponse.json(
            { error: `Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.` },
            { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
        );
    }

    const body = await request.json();
    const { path, roles, users, groups, remove } = body;
    const username = session.user.username;

    // Validation
    if (!path || !roles) {
        return NextResponse.json({ error: "Path and Roles are required" }, { status: 400 });
    }

    // Validate path format
    const ALLOWED_PATH_PATTERNS = /^\/(pool|vms|storage|sdn)\/[a-zA-Z0-9_\-\.]+$/;
    if (path !== '/' && !ALLOWED_PATH_PATTERNS.test(path)) {
        return NextResponse.json({ error: "Invalid ACL path" }, { status: 400 });
    }

    // Validate roles
    const ALLOWED_ROLES = ['Administrator', 'PVEAdmin', 'PVEPoolAdmin', 'PVEPoolUser', 'PVEVMUser', 'PVEVMAdmin', 'PVEAuditor'];
    const roleList = typeof roles === 'string' ? roles.split(',').map((r: string) => r.trim()) : [roles];
    for (const role of roleList) {
        if (!ALLOWED_ROLES.includes(role)) {
            return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
        }
    }

    try {
        if (remove) {
            await proxmox.removeSimpleACL(path, roles, users, groups);
        } else {
            await proxmox.addSimpleACL(path, roles, users, groups);
        }

        await logAudit({
            username: username,
            action: "ACL_UPDATE",
            resource: path,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { path, roles, users, groups, remove },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        await logAudit({
            username: username,
            action: "ACL_UPDATE",
            resource: typeof path === 'string' ? path : "access:acl",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error?.message || "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to update permissions" },
            { status: 500 }
        );
    }
}
