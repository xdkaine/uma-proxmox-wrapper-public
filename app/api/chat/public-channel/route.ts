import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { validateCSRFToken } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

const PUBLIC_CHANNEL_NAME = "General";

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session?.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "CHAT_PUBLIC_CHANNEL_VIEW",
            resource: "chat:public-channel",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `chat-public-channel:${session.user.username}:${getRateLimitIdentifier(request)}`;
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

        const channel = await prisma.group.findFirst({
            where: { name: PUBLIC_CHANNEL_NAME },
            select: { id: true },
        });

        if (!channel) {
            return NextResponse.json({ error: "Public channel not initialized" }, { status: 404 });
        }

        await logAudit({
            username: session.user.username,
            action: "CHAT_PUBLIC_CHANNEL_VIEW",
            resource: `group:${channel.id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { channelName: PUBLIC_CHANNEL_NAME },
        });

        return NextResponse.json({ channelId: channel.id });
    } catch (error) {
        console.error("Error fetching public channel:", error);
        await logAudit({
            username: session.user?.username || "unknown",
            action: "CHAT_PUBLIC_CHANNEL_VIEW",
            resource: "chat:public-channel",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session?.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "CHAT_PUBLIC_CHANNEL_JOIN",
            resource: "chat:public-channel",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    try {
        const currentUser = await prisma.user.findUnique({
            where: { username: session.user.username },
            select: { id: true },
        });

        if (!currentUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        let channel = await prisma.group.findFirst({
            where: { name: PUBLIC_CHANNEL_NAME },
            include: {
                members: { select: { id: true } },
            },
        });

        if (!channel) {
            channel = await prisma.group.create({
                data: {
                    name: PUBLIC_CHANNEL_NAME,
                    admins: { connect: { id: currentUser.id } },
                    members: { connect: { id: currentUser.id } },
                },
                include: {
                    members: { select: { id: true } },
                },
            });
        } else if (!channel.members.some((m: { id: string }) => m.id === currentUser.id)) {
            await prisma.group.update({
                where: { id: channel.id },
                data: { members: { connect: { id: currentUser.id } } },
            });
        }

        await logAudit({
            username: session.user.username,
            action: "CHAT_PUBLIC_CHANNEL_JOIN",
            resource: `group:${channel.id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { channelName: PUBLIC_CHANNEL_NAME },
        });

        return NextResponse.json({ channelId: channel.id });
    } catch (error) {
        console.error("Error joining public channel:", error);
        await logAudit({
            username: session.user?.username || "unknown",
            action: "CHAT_PUBLIC_CHANNEL_JOIN",
            resource: "chat:public-channel",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
