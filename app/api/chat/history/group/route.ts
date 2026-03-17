import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const requestedLimit = parseInt(searchParams.get("limit") || "200", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 200;

    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session?.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "CHAT_GROUP_HISTORY_VIEW",
            resource: "chat:group",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!groupId) {
        return NextResponse.json({ error: "groupId query parameter is required" }, { status: 400 });
    }

    const rlKey = `chat-history-group:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const currentUser = await prisma.user.findUnique({
            where: { username: session.user.username },
        });

        if (!currentUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Verify user is a member of the group
        const group = await prisma.group.findFirst({
            where: {
                id: groupId,
                members: { some: { id: currentUser.id } },
            },
        });

        if (!group) {
            return NextResponse.json({ error: "Group not found or access denied" }, { status: 403 });
        }

        const messages = await prisma.message.findMany({
            where: { groupId },
            orderBy: { createdAt: "desc" },
            take: limit,
            include: {
                sender: {
                    select: { id: true, username: true, displayName: true, avatar: true },
                },
                reactions: true,
            },
        });

        await logAudit({
            username: session.user.username,
            action: "CHAT_GROUP_HISTORY_VIEW",
            resource: `group:${groupId}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { limit, messageCount: messages.length },
        });

        return NextResponse.json(messages.reverse());
    } catch (error) {
        console.error("Error fetching group chat history:", error);
        await logAudit({
            username: session.user?.username || "unknown",
            action: "CHAT_GROUP_HISTORY_VIEW",
            resource: `group:${groupId || "unknown"}`,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
