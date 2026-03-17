import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { ldapService } from "@/lib/ldap";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logAudit, getClientContext } from "@/lib/audit";

const extractGroupName = (group: string): string => {
    const match = group.match(/^CN=([^,]+)/i);
    return match ? match[1] : group;
};

/**
 * GET /api/auth/groups
 * 
 * Search for LDAP groups (for admin settings)
 * Query parameter: q (search query)
 */
export async function GET(request: NextRequest) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    const client = getClientContext(request);

    // Authentication check
    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "VIEW_GROUPS",
            resource: "groups",
            details: { reason: "unauthorized" },
            status: "FAILURE",
            ...client,
        });
        return response;
    }

    const isAdmin = !!session.user.isAdmin;

    // Rate limiting
    const identifier = getRateLimitIdentifier(request);
    const rateLimit = await checkRateLimitAsync(`group-search:${identifier}`, RATE_LIMITS.SEARCH);

    if (!rateLimit.allowed) {
        await logAudit({
            username: session.user.username,
            action: "VIEW_GROUPS",
            resource: "groups",
            details: { queryScope: "search", reason: "rate_limit", retryAfter: rateLimit.retryAfter },
            status: "FAILURE",
            ...client,
        });
        return NextResponse.json(
            { error: `Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.` },
            {
                status: 429,
                headers: { 'Retry-After': String(rateLimit.retryAfter) }
            }
        );
    }

    // Get search query
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
        return NextResponse.json({ groups: [] });
    }

    try {
        if (isAdmin) {
            logger.debug(`[API] Searching LDAP groups for: ${query}`);
            const groups = await ldapService.searchGroups(query);

            logAudit({
                username: session.user.username,
                action: "VIEW_GROUPS",
                resource: "groups",
                details: { query, scope: "ldap" },
                status: "SUCCESS",
                ...client,
            });

            return NextResponse.json({ groups });
        }

        const sessionGroups = session.user.groups || [];
        const normalizedQuery = query.toLowerCase();
        const groups = sessionGroups
            .map((group) => extractGroupName(group).trim())
            .filter((group) => group && group.toLowerCase().includes(normalizedQuery))
            .map((group) => ({ cn: group }));

        logAudit({
            username: session.user.username,
            action: "VIEW_GROUPS",
            resource: "groups",
            details: { query, scope: "session" },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json({ groups });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        logger.error(`[API] Group search error: ${message}`);
        await logAudit({
            username: session.user.username,
            action: "VIEW_GROUPS",
            resource: "groups",
            details: { query, reason: "exception", message },
            status: "FAILURE",
            ...client,
        });
        return NextResponse.json({ error: "Failed to search groups" }, { status: 500 });
    }
}
