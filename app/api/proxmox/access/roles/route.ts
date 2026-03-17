
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { getClientContext, logAudit } from "@/lib/audit";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { checkPoolAccess } from "@/lib/acl";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

const ALLOWED_ROLES = ['PVEPoolAdmin', 'PVEPoolUser', 'PVEAdmin', 'PVEVMUser', 'PVEVMAdmin'];

export async function GET(request: NextRequest) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(request);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_ROLES", resource: "access:roles", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `proxmox-roles:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_ROLES", resource: "access:roles", details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    // Gate: admin or user with allowManage on at least one pool
    if (!session.user.isAdmin) {
        const pools = await proxmox.getPools();
        let hasManageAccess = false;

        for (const pool of pools) {
            const access = await checkPoolAccess(
                session.user.username,
                session.user.groups || [],
                pool.poolid,
                false
            );
            if (access.allowManage) {
                hasManageAccess = true;
                break;
            }
        }

        if (!hasManageAccess) {
            await logAudit({ username: session.user.username, action: "VIEW_ROLES", resource: "access:roles", details: { reason: "permission_denied" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }
    }

    try {
        const roles = await proxmox.getRoles();

        // Filter roles to the allowlist for non-admin users
        const filteredRoles = session.user.isAdmin
            ? roles
            : roles.filter((role: any) => ALLOWED_ROLES.includes(role.roleid));

        await logAudit({
            username: session.user.username,
            action: "VIEW_ROLES",
            resource: "access:roles",
            details: {},
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json(filteredRoles);
    } catch (error: any) {
        await logAudit({ username: session.user.username, action: "VIEW_ROLES", resource: "access:roles", details: { reason: "exception", message: error?.message || "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Failed to fetch roles" },
            { status: 500 }
        );
    }
}
