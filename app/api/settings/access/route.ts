import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { getClientContext } from "@/lib/audit";
import { getAccessConfig, updateAccessConfig, AccessConfig } from "@/lib/config";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

const updateConfigSchema = z.object({
    adminGroups: z.array(z.string()),
    allowedGroups: z.array(z.string())
});

/**
 * GET /api/settings/access
 * 
 * Get current access control configuration
 * Admin-only endpoint
 */
export async function GET(request: NextRequest) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        logger.warn(`[API] Unauthorized access attempt to GET /api/settings/access`);
        return response;
    }

    const rlKey = `settings-access:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const config = await getAccessConfig();
        logger.debug(`[API] Access config retrieved by ${session.user.username}`);
        return NextResponse.json(config);
    } catch (error: any) {
        logger.error(`[API] Failed to fetch access config: ${error.message}`);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * POST /api/settings/access
 * 
 * Update access control configuration
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        logger.warn(`[API] Unauthorized access attempt to POST /api/settings/access`);
        await logAudit({
            username: session.user?.username || "anonymous",
            action: "SETTINGS_ACCESS_UPDATE",
            resource: "settings:access",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return response;
    }

    // CRITICAL-1: CSRF Protection
    if (!validateCSRFToken(request, session.csrfToken)) {
        logger.warn('[API] CSRF token validation failed for access settings update');
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const result = updateConfigSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                { error: "Invalid input", details: result.error.flatten() },
                { status: 400 }
            );
        }

        await updateAccessConfig(result.data);

        await logAudit({
            username: session.user.username,
            action: "SETTINGS_ACCESS_UPDATE",
            resource: "settings:access",
            details: {
                adminGroups: result.data.adminGroups,
                allowedGroups: result.data.allowedGroups
            },
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true, config: result.data });

    } catch (error: any) {
        logger.error(`[API] Failed to update access config: ${error.message}`);
        await logAudit({
            username: session.user.username,
            action: "SETTINGS_ACCESS_UPDATE",
            resource: "settings:access",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error?.message || "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
