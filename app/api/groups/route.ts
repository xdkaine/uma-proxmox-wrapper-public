import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { validateCSRFToken } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
    const client = getClientContext(req);
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.user || !session.user.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "GROUP_CREATE",
            resource: "groups",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Fetch user to get ID since session only has username
    const currentUser = await prisma.user.findUnique({
        where: { username: session.user.username },
        select: { id: true }
    });

    if (!currentUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userId = currentUser.id;

    try {
        const { name, memberIds } = await req.json();

        if (!name) {
            return NextResponse.json({ error: "Group name is required" }, { status: 400 });
        }

        const requestedMemberIds = Array.isArray(memberIds) ? memberIds.filter((id: unknown) => typeof id === "string") : [];

        // Non-system-admin users can only create a group with themselves as initial member.
        const allowedMemberIds = session.user.isAdmin ? requestedMemberIds : [];
        const allMemberIds = Array.from(new Set([userId, ...allowedMemberIds]));

        const group = await prisma.group.create({
            data: {
                name,
                admins: {
                    connect: { id: userId }
                },
                members: {
                    connect: allMemberIds.map((id: string) => ({ id }))
                }
            },
            include: {
                members: {
                    select: { id: true, username: true, displayName: true, avatar: true }
                },
                admins: {
                    select: { id: true }
                }
            }
        });

        await logAudit({
            username: session.user.username,
            action: "GROUP_CREATE",
            resource: `group:${group.id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                after: { id: group.id, name: group.name },
                memberCount: group.members.length,
                requestedMemberCount: requestedMemberIds.length,
            },
        });

        return NextResponse.json(group);

    } catch (error) {
        console.error("Error creating group:", error);
        await logAudit({
            username: session.user.username,
            action: "GROUP_CREATE",
            resource: "groups",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const client = getClientContext(req);
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.user || !session.user.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "VIEW_GROUPS",
            resource: "groups",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user to get ID since session only has username
    const currentUser = await prisma.user.findUnique({
        where: { username: session.user.username },
        select: { id: true }
    });

    if (!currentUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userId = currentUser.id;

    try {
        const { searchParams } = new URL(req.url);
        const requestedLimit = parseInt(searchParams.get("limit") || "50", 10);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;

        const rlKey = `groups-list:${session.user.username}:${getRateLimitIdentifier(req)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        // Fetch groups where user is a member
        const groups = await prisma.group.findMany({
            where: {
                members: {
                    some: {
                        id: userId
                    }
                }
            },
            include: {
                members: {
                    select: { id: true, username: true, displayName: true, avatar: true }
                },
                admins: {
                    select: { id: true }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { username: true } }
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: limit,
        });

        // Format for frontend
        const formattedGroups = groups.map((g: {
            id: string;
            name: string;
            avatar: string | null;
            members: Array<{ id: string; username: string; displayName: string | null; avatar: string | null }>;
            admins: Array<{ id: string }>;
            messages: Array<unknown>;
        }) => ({
            id: g.id,
            name: g.name,
            avatar: g.avatar,
            type: 'group',
            members: g.members,
            lastMessage: g.messages[0],
            isAdmin: g.admins.some((a) => a.id === userId)
        }));

        await logAudit({
            username: session.user.username,
            action: "VIEW_GROUPS",
            resource: "groups",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { limit, resultCount: formattedGroups.length },
        });

        return NextResponse.json(formattedGroups);

    } catch (error) {
        console.error("Error fetching groups:", error);
        await logAudit({
            username: session.user.username,
            action: "VIEW_GROUPS",
            resource: "groups",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
    }
}
