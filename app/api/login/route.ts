import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { ldapService } from "@/lib/ldap";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getAccessConfig } from "@/lib/config";
import { generateCSRFToken } from "@/lib/csrf";

/**
 * Login API Route - Simplified and Reliable
 * 
 * Flow:
 * 1. Validate input
 * 2. Rate limit check
 * 3. Authenticate via LDAP
 * 4. Check group-based authorization
 * 5. Create session
 * 6. Generate CSRF token
 * 7. Return success
 */

const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
    // CRITICAL: Create response first for iron-session cookie handling
    const response = NextResponse.json({ success: false });

    try {
        // 1. Rate limiting
        const identifier = getRateLimitIdentifier(request);
        const rateLimit = await checkRateLimitAsync(`login:${identifier}`, RATE_LIMITS.LOGIN);

        if (!rateLimit.allowed) {
            logger.warn(`[Login] Rate limit exceeded for ${identifier}`);
            return NextResponse.json(
                { error: `Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
            );
        }

        // 2. Validate input
        const body = await request.json();
        const result = loginSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                { error: "Invalid input", details: result.error.flatten() },
                { status: 400 }
            );
        }

        const { username, password } = result.data;

        // 3. Authenticate via LDAP
        logger.debug(`[Login] Attempting authentication for: ${username}`);
        const authResult = await ldapService.authenticate(username, password);

        if (!authResult.success || !authResult.user) {
            // Anti-timing attack delay
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
            logger.warn(`[Login] Failed authentication for: ${username}`);

            await logAudit({
                username: username,
                action: "LOGIN",
                resource: "auth:session",
                details: { reason: "invalid_credentials" },
                ipAddress: identifier,
                userAgent: request.headers.get("user-agent") || undefined,
                status: "FAILURE"
            });

            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        const ldapUser = authResult.user;
        logger.debug(`[Login] LDAP authentication successful for: ${username}`);

        // 4. Process groups (extract CN from DN format)
        const rawGroups = ldapUser.groups || [];

        const userGroups: string[] = rawGroups.map((groupDn: string) => {
            // Extract CN from "CN=GroupName,OU=..." format
            const match = groupDn.match(/(?:^|,)CN=([^,]+)/i);
            return match ? match[1] : groupDn;
        });

        // HIGH-4: Log only non-sensitive metrics, not actual group names
        logger.debug(`[Login] Processed ${userGroups.length} group memberships`);

        // 5. Authorization - Check group membership
        const accessConfig = await getAccessConfig();
        const envAdminGroups = (process.env.ADMIN_GROUPS || "").split(",").map(g => g.trim()).filter(Boolean);
        const allAdminGroups = [...new Set([...envAdminGroups, ...accessConfig.adminGroups])];

        // Check if user is admin
        const isAdmin = allAdminGroups.some(adminGroup =>
            userGroups.some(userGroup => userGroup.toLowerCase() === adminGroup.toLowerCase())
        );

        // Check if access is restricted and user is allowed
        if (accessConfig.allowedGroups && accessConfig.allowedGroups.length > 0) {
            const isAllowed = accessConfig.allowedGroups.some(allowedGroup =>
                userGroups.some(userGroup => userGroup.toLowerCase() === allowedGroup.toLowerCase())
            );

            if (!isAllowed && !isAdmin) {
                logger.warn(`[Login] Access denied for ${username} - not in allowed groups`);
                return NextResponse.json(
                    { error: "Access denied. You do not have permission to use this application." },
                    { status: 403 }
                );
            }
        }

        logger.debug(`[Login] Authorization successful - Admin: ${isAdmin}`);

        // 6. Create session
        // CRITICAL: Pass both request AND response for cookie handling
        const session = await getIronSession<SessionData>(request, response, sessionOptions);

        session.user = {
            username: ldapUser.username,
            displayName: ldapUser.displayName,
            isLoggedIn: true,
            dn: ldapUser.dn,
            groups: userGroups,
            isAdmin: isAdmin,
        };

        // Generate CSRF token
        session.csrfToken = generateCSRFToken();

        // Save session (adds Set-Cookie header to response)
        await session.save();

        // Log audit entry
        await logAudit({
            userId: undefined, // No user ID in LDAP mode yet, or could be session.user.id if avail
            username: session.user.username,
            action: "LOGIN",
            resource: "auth:session",
            details: {
                method: "LDAP",
                groups: userGroups,
                isAdmin: isAdmin
            },
            ipAddress: identifier, // Captured from rate limit logic
            userAgent: request.headers.get("user-agent") || undefined,
            status: "SUCCESS"
        });

        // 7. Return success response
        // IMPORTANT: Create new response with same headers to preserve Set-Cookie
        const successData = {
            success: true,
            user: {
                username: session.user.username,
                isAdmin: session.user.isAdmin,
            }
        };

        return new Response(JSON.stringify(successData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...Object.fromEntries(response.headers.entries()),
            }
        }) as NextResponse;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        logger.error(`[Login] Unexpected error: ${message}`);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
