import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { PrismaClient } from "@prisma/client";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    const { searchParams } = new URL(request.url);
    const targetUsername = searchParams.get("username");
    const requestedLimit = parseInt(searchParams.get("limit") || "200", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 200;

    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session || !session.user || !session.user.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "CHAT_HISTORY_VIEW",
            resource: "chat:direct",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!targetUsername) {
        return NextResponse.json({ error: "Username query parameter is required" }, { status: 400 });
    }

    const rlKey = `chat-history:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const currentUser = await prisma.user.findUnique({
            where: { username: session.user.username }
        });

        const targetUser = await prisma.user.findUnique({
            where: { username: targetUsername }
        });

        if (!currentUser || !targetUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    {
                        senderId: currentUser.id,
                        receiverId: targetUser.id
                    },
                    {
                        senderId: targetUser.id,
                        receiverId: currentUser.id
                    }
                ]
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: limit,
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        displayName: true,
                        avatar: true
                    }
                },
                receiver: {
                    select: {
                        id: true,
                        username: true,
                        displayName: true,
                        avatar: true
                    }
                }
            }
        });

        await logAudit({
            username: session.user.username,
            action: "CHAT_HISTORY_VIEW",
            resource: `chat:direct:${targetUsername}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { limit, messageCount: messages.length },
        });

        return NextResponse.json(messages.reverse());

    } catch (error) {
        console.error("Error fetching chat history:", error);
        await logAudit({
            username: session.user?.username || "unknown",
            action: "CHAT_HISTORY_VIEW",
            resource: "chat:direct",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { targetUsername, error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
