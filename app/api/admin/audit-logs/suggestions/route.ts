import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    try {
        const session = await getIronSession<SessionData>(request, new NextResponse(), sessionOptions);

        if (!session.user?.isLoggedIn || !session.user?.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "VIEW_AUDIT_SUGGESTIONS",
                resource: "admin:audit-logs:suggestions",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const rlKey = `admin-audit-suggestions:${session.user.username}:${getRateLimitIdentifier(request)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type"); // "users" | "actions"
        const query = (searchParams.get("q") || "").trim().slice(0, 64);

        await logAudit({
            username: session.user.username,
            action: "VIEW_AUDIT_SUGGESTIONS",
            resource: "admin:audit-logs:suggestions",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { type: type || "all", query },
        });

        if (type === "users") {
            // Get unique usernames with optional search
            const users = await prisma.auditLog.groupBy({
                by: ["username"],
                where: query
                    ? { username: { contains: query } }
                    : undefined,
                orderBy: { _count: { username: "desc" } },
                take: 20,
            });

            return NextResponse.json({
                suggestions: users.map((u: { username: string }) => u.username),
            });
        }

        if (type === "actions") {
            // Get unique actions with counts
            const actions = await prisma.auditLog.groupBy({
                by: ["action"],
                where: query
                    ? { action: { contains: query } }
                    : undefined,
                _count: { action: true },
                orderBy: { _count: { action: "desc" } },
                take: 30,
            });

            return NextResponse.json({
                suggestions: actions.map((a: { action: string; _count: { action: number } }) => ({
                    action: a.action,
                    count: a._count.action,
                })),
            });
        }

        // Return both if no type specified
        const [users, actions] = await Promise.all([
            prisma.auditLog.groupBy({
                by: ["username"],
                orderBy: { _count: { username: "desc" } },
                take: 20,
            }),
            prisma.auditLog.groupBy({
                by: ["action"],
                _count: { action: true },
                orderBy: { _count: { action: "desc" } },
                take: 30,
            }),
        ]);

        return NextResponse.json({
            users: users.map((u: { username: string }) => u.username),
            actions: actions.map((a: { action: string; _count: { action: number } }) => ({
                action: a.action,
                count: a._count.action,
            })),
        });

    } catch (error) {
        logger.error("[API] Failed to fetch suggestions:", error);
        await logAudit({
            username: "unknown",
            action: "VIEW_AUDIT_SUGGESTIONS",
            resource: "admin:audit-logs:suggestions",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
