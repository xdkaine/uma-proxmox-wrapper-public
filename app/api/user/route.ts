import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    const identifier = getRateLimitIdentifier(request);
    const username = session.user?.username || "anonymous";
    const rl = await checkRateLimitAsync(`user-session:${username}:${identifier}`, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    if (session.user && session.user.isLoggedIn) {
        await logAudit({
            username: session.user.username,
            action: "VIEW_PROFILE",
            resource: "user:session",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { isAdmin: !!session.user.isAdmin },
        });

        return NextResponse.json({
            isLoggedIn: true,
            user: {
                username: session.user.username,
                displayName: session.user.displayName,
                isAdmin: session.user.isAdmin,
            },
        });
    }

    await logAudit({
        username: "anonymous",
        action: "VIEW_PROFILE",
        resource: "user:session",
        status: "FAILURE",
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        details: { reason: "not_logged_in" },
    });

    return NextResponse.json({
        isLoggedIn: false,
        user: null,
    });
}
