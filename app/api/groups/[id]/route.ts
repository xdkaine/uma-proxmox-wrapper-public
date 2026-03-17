import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { validateCSRFToken } from "@/lib/csrf";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

const prisma = new PrismaClient();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const client = getClientContext(req);
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.user || !session.user.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "GROUP_VIEW",
            resource: "groups",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const rlKey = `group-detail:${session.user.username}:${id}:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
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
        const group = await prisma.group.findUnique({
            where: { id },
            include: {
                members: {
                    select: { id: true, username: true, displayName: true, avatar: true }
                },
                admins: {
                    select: { id: true }
                }
            }
        });

        if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

        // Verify membership
        if (!group.members.some((m: { id: string }) => m.id === userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await logAudit({
            username: session.user.username,
            action: "GROUP_VIEW",
            resource: `group:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { memberCount: group.members.length, adminCount: group.admins.length },
        });

        return NextResponse.json({
            ...group,
            isAdmin: group.admins.some((a: { id: string }) => a.id === userId)
        });

    } catch (error) {
        console.error("Error fetching group:", error);
        await logAudit({
            username: session.user.username,
            action: "GROUP_VIEW",
            resource: "groups",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { groupId: id, error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to fetch group" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const client = getClientContext(req);
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.user || !session.user.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "GROUP_UPDATE",
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

    const { id } = await params;

    const currentUser = await prisma.user.findUnique({
        where: { username: session.user.username },
        select: { id: true }
    });

    if (!currentUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userId = currentUser.id;

    try {
        const { name, addMemberIds } = await req.json();

        // Check Admin Status
        const group = await prisma.group.findUnique({
            where: { id },
            include: { admins: true }
        });

        if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

        const isAdmin = group.admins.some((a: { id: string }) => a.id === userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Only admins can modify group" }, { status: 403 });
        }

        if (addMemberIds && !session.user.isAdmin) {
            return NextResponse.json({ error: "Only system admins can add members" }, { status: 403 });
        }

        const updateData: {
            name?: string;
            members?: { connect: Array<{ id: string }> };
        } = {};
        if (name) updateData.name = name;
        if (addMemberIds && Array.isArray(addMemberIds)) {
            const validMemberIds = addMemberIds.filter((mid: unknown) => typeof mid === "string");
            updateData.members = {
                connect: validMemberIds.map((mid: string) => ({ id: mid }))
            };
        }

        const updatedGroup = await prisma.group.update({
            where: { id },
            data: updateData,
            include: {
                members: {
                    select: { id: true, username: true, displayName: true, avatar: true }
                }
            }
        });

        await logAudit({
            username: session.user.username,
            action: "GROUP_UPDATE",
            resource: `group:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                before: { name: group.name },
                after: { name: updatedGroup.name, memberCount: updatedGroup.members.length },
                changedFields: Object.keys(updateData),
            },
        });

        return NextResponse.json(updatedGroup);

    } catch (error) {
        console.error("Error updating group:", error);
        await logAudit({
            username: session.user.username,
            action: "GROUP_UPDATE",
            resource: "groups",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { groupId: id, error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
    }
}
