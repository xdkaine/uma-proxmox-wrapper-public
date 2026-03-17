import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { getClientContext } from "@/lib/audit";
import { getResourceLimitsConfig, updateResourceLimitsConfig } from "@/lib/config";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

const updateConfigSchema = z.object({
    maxVnetsPerUser: z.number().int().min(0)
});

/**
 * GET /api/settings/limits
 *
 * Get resource limits configuration
 * Admin-only endpoint
 */
export async function GET(request: NextRequest) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        logger.warn(`[API] Unauthorized access attempt to GET /api/settings/limits`);
        return response;
    }

    const rlKey = `settings-limits:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const config = await getResourceLimitsConfig();
        logger.debug(`[API] Resource limits config retrieved by ${session.user.username}`);
        return NextResponse.json(config);
    } catch (error: any) {
        logger.error(`[API] Failed to fetch resource limits config: ${error.message}`);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * POST /api/settings/limits
 *
 * Update resource limits configuration
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        logger.warn(`[API] Unauthorized access attempt to POST /api/settings/limits`);
        await logAudit({
            username: session.user?.username || "anonymous",
            action: "SETTINGS_LIMITS_UPDATE",
            resource: "settings:limits",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return response;
    }

    // CRITICAL-1: CSRF Protection
    if (!validateCSRFToken(request, session.csrfToken)) {
        logger.warn('[API] CSRF token validation failed for limits settings update');
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

        await updateResourceLimitsConfig(result.data);

        await logAudit({
            username: session.user.username,
            action: "SETTINGS_LIMITS_UPDATE",
            resource: "settings:limits",
            details: result.data,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true, config: result.data });
    } catch (error: any) {
        logger.error(`[API] Failed to update resource limits config: ${error.message}`);
        await logAudit({
            username: session.user.username,
            action: "SETTINGS_LIMITS_UPDATE",
            resource: "settings:limits",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error?.message || "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
