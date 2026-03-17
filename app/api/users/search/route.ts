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
    const query = searchParams.get("q");

    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session || !session.user || !session.user.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "VIEW_USERS",
            resource: "users:search",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!query || query.trim().length < 2) {
        return NextResponse.json([]);
    }

    const rlKey = `users-search:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const users = await prisma.user.findMany({
            where: {
                AND: [
                    {
                        username: {
                            not: session.user.username // Exclude self
                        }
                    },
                    {
                        OR: [
                            { username: { contains: query } }, // removed mode: 'insensitive' for mysql compatibility/default behavior
                            { displayName: { contains: query } }
                        ]
                    }
                ]
            },
            take: 10,
            select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
            }
        });

        await logAudit({
            username: session.user.username,
            action: "VIEW_USERS",
            resource: "users:search",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { queryLength: query.length, resultCount: users.length },
        });

        return NextResponse.json(users);

    } catch (error) {
        console.error("Error searching users:", error);
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VIEW_USERS",
            resource: "users:search",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
