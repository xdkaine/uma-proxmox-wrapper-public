import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { logger } from "@/lib/logger";
import { getClientContext, logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";

/**
 * Logout API Route
 * 
 * Flow:
 * 1. Load session
 * 2. Log the logout action
 * 3. Destroy session
 * 4. Return success (client handles redirect)
 * 
 * Uses POST to prevent CSRF-based forced logout via <img> tags
 */
export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    try {
        // 1. Load session using cookies()
        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!validateCSRFToken(request, session.csrfToken)) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "LOGOUT",
                resource: "auth:session",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "invalid_csrf" },
            });
            return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
        }

        const username = session.user?.username || 'unknown';

        // 2. Destroy session
        session.destroy();
        await session.save(); // Persist the destruction

        // logger.audit('user.logout', username, 'application', 'success');
        await logAudit({
            username: username,
            action: "LOGOUT",
            resource: "auth:session",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {},
            status: "SUCCESS"
        });

        // 3. Redirect to login using relative path
        // Use 303 See Other to ensure GET request after redirect
        return new NextResponse(null, {
            status: 303,
            headers: {
                'Location': '/login'
            }
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`[Logout] Error during logout: ${message}`);
        await logAudit({
            username: "unknown",
            action: "LOGOUT",
            resource: "auth:session",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: message },
        });
        // Fallback redirect using relative path
        return new NextResponse(null, {
            status: 303,
            headers: {
                'Location': '/login'
            }
        });
    }
}
