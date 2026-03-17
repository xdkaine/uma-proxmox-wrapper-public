import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { PrismaClient } from "@prisma/client";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

const prisma = new PrismaClient();

type RecentChatUser = {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
};

type RecentChatMessage = {
    createdAt: Date;
} & Record<string, unknown>;

type RecentChatEntry = {
    user: RecentChatUser;
    lastMessage: RecentChatMessage;
};

type SentMessageWithReceiver = {
    receiverId: string | null;
    receiver: RecentChatUser | null;
    createdAt: Date;
} & Record<string, unknown>;

type ReceivedMessageWithSender = {
    senderId: string | null;
    sender: RecentChatUser | null;
    createdAt: Date;
} & Record<string, unknown>;

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session || !session.user || !session.user.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "CHAT_RECENT_VIEW",
            resource: "chat:recent",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `chat-recent:${session.user.username}:${getRateLimitIdentifier(request)}`;
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
            include: {
                sentMessages: {
                    orderBy: { createdAt: 'desc' },
                    distinct: ['receiverId'],
                    include: {
                        receiver: true
                    }
                },
                receivedMessages: {
                    orderBy: { createdAt: 'desc' },
                    distinct: ['senderId'],
                    include: {
                        sender: true
                    }
                }
            }
        });

        if (!currentUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Combine and dedup users
        const recentUsersMap = new Map<string, RecentChatEntry>();

        currentUser.sentMessages.forEach((msg: SentMessageWithReceiver) => {
            if (!msg.receiverId) return;
            if (!msg.receiver) return;
            if (!recentUsersMap.has(msg.receiverId)) {
                recentUsersMap.set(msg.receiverId, {
                    user: {
                        id: msg.receiver.id,
                        username: msg.receiver.username,
                        displayName: msg.receiver.displayName,
                        avatar: msg.receiver.avatar,
                    },
                    lastMessage: msg as unknown as RecentChatMessage,
                });
            } else {
                // If we already have this user, check if this message is newer
                const existing = recentUsersMap.get(msg.receiverId);
                if (existing && new Date(msg.createdAt) > new Date(existing.lastMessage.createdAt)) {
                    recentUsersMap.set(msg.receiverId, { ...existing, lastMessage: msg as unknown as RecentChatMessage });
                }
            }
        });

        currentUser.receivedMessages.forEach((msg: ReceivedMessageWithSender) => {
            if (!msg.senderId) return;
            if (!msg.sender) return;
            if (!recentUsersMap.has(msg.senderId)) {
                recentUsersMap.set(msg.senderId, {
                    user: {
                        id: msg.sender.id,
                        username: msg.sender.username,
                        displayName: msg.sender.displayName,
                        avatar: msg.sender.avatar,
                    },
                    lastMessage: msg as unknown as RecentChatMessage,
                });
            } else {
                const existing = recentUsersMap.get(msg.senderId);
                if (existing && new Date(msg.createdAt) > new Date(existing.lastMessage.createdAt)) {
                    recentUsersMap.set(msg.senderId, { ...existing, lastMessage: msg as unknown as RecentChatMessage });
                }
            }
        });

        // Convert to array and sort by last message time
        const recentChats = Array.from(recentUsersMap.values())
            .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

        // Fetch unread counts for each user
        const chatsWithUnread = await Promise.all(recentChats.map(async (chat: RecentChatEntry) => {
            const unreadCount = await prisma.message.count({
                where: {
                    senderId: chat.user.id,
                    receiverId: currentUser.id,
                    read: false
                }
            });
            return {
                ...chat.user,
                lastMessage: chat.lastMessage,
                unreadCount
            };
        }));

        await logAudit({
            username: session.user.username,
            action: "CHAT_RECENT_VIEW",
            resource: "chat:recent",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { chatCount: chatsWithUnread.length },
        });

        return NextResponse.json(chatsWithUnread);

    } catch (error) {
        console.error("Error fetching recent chats:", error);
        await logAudit({
            username: session.user?.username || "unknown",
            action: "CHAT_RECENT_VIEW",
            resource: "chat:recent",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
