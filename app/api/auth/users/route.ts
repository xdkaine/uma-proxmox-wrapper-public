import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { ldapService } from "@/lib/ldap";

import { checkRateLimitAsync, getRateLimitIdentifier } from "@/lib/rate-limit";
import { getClientContext, logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "VIEW_USERS",
            resource: "auth:users",
            details: { reason: "unauthorized" },
            status: "FAILURE",
            ...client,
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
        return NextResponse.json({ users: [] });
    }

    // Rate limiting: Limit user searches to prevents scraping/DoS
    const identifier = `${getRateLimitIdentifier(request)}:${session.user.username}`;
    const rateLimit = await checkRateLimitAsync(`user-search:${identifier}`, { windowMs: 60 * 1000, maxAttempts: 30 }); // 30 requests per minute

    if (!rateLimit.allowed) {
        await logAudit({
            username: session.user.username,
            action: "VIEW_USERS",
            resource: "auth:users",
            details: { query, reason: "rate_limit", retryAfter: rateLimit.retryAfter },
            status: "FAILURE",
            ...client,
        });
        return NextResponse.json(
            { error: `Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.` },
            { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
        );
    }

    try {
        const users = await ldapService.searchUsers(query);

        await logAudit({
            username: session.user.username,
            action: "VIEW_USERS",
            resource: "auth:users",
            details: { query },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json({ users });
    } catch (error: unknown) {
        console.error("User search error:", error);
        await logAudit({
            username: session.user.username,
            action: "VIEW_USERS",
            resource: "auth:users",
            details: { query, reason: "exception", error: error instanceof Error ? error.message : "unknown_error" },
            status: "FAILURE",
            ...client,
        });
        return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
    }
}
