import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const username = session.user.username;
        const userGroups = session.user.groups || [];

        const allZones = await proxmox.getZones();
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

        // Admins see all zones, regular users only see Userlabs and Altzone
        let zones = allZones;
        if (!isAdmin) {
            zones = allZones.filter(z => {
                const name = z.zone.toLowerCase();
                return name.includes('userlab') || name.includes('altzone');
            });
        }

        logAudit({
            username: session.user.username,
            action: "VIEW_ZONES",
            resource: "sdn:zones",
            details: { isAdmin, zoneCount: zones.length }
        });

        return NextResponse.json({ zones });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to fetch zones" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // CSRF Protection
        if (!validateCSRFToken(request, session.csrfToken)) {
            return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
        }

        // Rate limiting
        const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
        // Reuse POOL_CREATE limit or define new one. Let's use POOL_CREATE for now as it's similar admin action
        const rateLimit = await checkRateLimitAsync(`zone-create:${identifier}`, RATE_LIMITS.POOL_CREATE);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: `Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
            );
        }

        const body = await request.json();
        const { zone, type, mtu } = body;

        if (!zone || !type) {
            return NextResponse.json({ error: "Zone ID and Type are required" }, { status: 400 });
        }

        // --- RBAC Check: Only Admins can create Zones ---
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
            return NextResponse.json({ error: "Forbidden: Only administrators can create SDN Zones." }, { status: 403 });
        }

        await proxmox.createZone({ zone, type, mtu });

        logAudit({
            username: session.user.username,
            action: "ZONE_CREATE",
            resource: "sdn:zones",
            details: { zone, type, mtu }
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Error creating zone:", error);
        await logAudit({
            username: session.user?.username || "unknown",
            action: "ZONE_CREATE",
            resource: "sdn:zones",
            status: "FAILURE",
            details: { error: error?.message || "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to create zone" }, { status: 500 });
    }
}
