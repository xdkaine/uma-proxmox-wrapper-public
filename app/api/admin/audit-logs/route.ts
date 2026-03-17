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
                action: "VIEW_AUDIT_LOGS",
                resource: "admin:audit-logs",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const requestedPage = parseInt(searchParams.get("page") || "1", 10);
        const requestedLimit = parseInt(searchParams.get("limit") || "50", 10);
        const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1;
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;
        const userId = searchParams.get("userId");
        const action = searchParams.get("action");
        const resource = searchParams.get("resource");
        const status = searchParams.get("status");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        const rlKey = `admin-audit-logs:${session.user.username}:${getRateLimitIdentifier(request)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {};

        // userId param searches by username (more intuitive for users)
        if (userId) where.username = { contains: userId };
        if (action) where.action = action;
        if (resource) where.resource = { contains: resource };
        if (status) where.status = status;
        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate),
            };
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip,
            }),
            prisma.auditLog.count({ where }),
        ]);

        await logAudit({
            userId: session.user.username,
            username: session.user.username,
            action: "VIEW_AUDIT_LOGS",
            resource: "admin:audit-logs",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                page,
                limit,
                filters: { userId, action, resource, status, startDate, endDate },
                resultCount: logs.length,
                total,
            },
        });

        return NextResponse.json({
            logs,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                currentPage: page,
                limit,
            },
        });

    } catch (error) {
        logger.error("[API] Failed to fetch audit logs:", error);
        await logAudit({
            username: "unknown",
            action: "VIEW_AUDIT_LOGS",
            resource: "admin:audit-logs",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
