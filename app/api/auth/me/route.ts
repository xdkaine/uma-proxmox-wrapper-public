import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { logAudit, getClientContext } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/auth/me
 * 
 * Returns the current authenticated user's session data
 */
export async function GET(request: NextRequest) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    const client = getClientContext(request);

    const identifier = getRateLimitIdentifier(request);
    const username = session.user?.username || "anonymous";
    const rl = await checkRateLimitAsync(`auth-me:${username}:${identifier}`, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({
            username,
            action: "VIEW_PROFILE",
            resource: "auth:session",
            details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 },
            status: "FAILURE",
            ...client,
        });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    if (!session.user?.isLoggedIn) {
        await logAudit({
            username,
            action: "VIEW_PROFILE",
            resource: "auth:session",
            details: { reason: "unauthorized" },
            status: "FAILURE",
            ...client,
        });
        return response;
    }

    logAudit({
        username: session.user.username,
        action: "VIEW_PROFILE",
        resource: "auth:session",
        details: {},
        status: "SUCCESS",
        ...client,
    });

    return NextResponse.json({
        user: {
            username: session.user.username,
            isAdmin: session.user.isAdmin,
            groups: session.user.groups,
        }
    });
}
