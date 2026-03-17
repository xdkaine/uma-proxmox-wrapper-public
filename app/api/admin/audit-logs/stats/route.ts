"use server";

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

type HourlyActivityRow = {
    hour: string;
    count: bigint | number;
};

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    try {
        const session = await getIronSession<SessionData>(request, new NextResponse(), sessionOptions);

        if (!session.user?.isLoggedIn || !session.user?.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "VIEW_AUDIT_STATS",
                resource: "admin:audit-logs:stats",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const rlKey = `admin-audit-stats:${session.user.username}:${getRateLimitIdentifier(request)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Parallel queries for analytics data
        const [
            totalCount,
            successCount,
            failureCount,
            warningCount,
            failuresToday,
            uniqueUsers,
            actionBreakdown,
            recentAlerts,
            hourlyActivity,
        ] = await Promise.all([
            // Total logs
            prisma.auditLog.count(),
            // Status counts
            prisma.auditLog.count({ where: { status: "SUCCESS" } }),
            prisma.auditLog.count({ where: { status: "FAILURE" } }),
            prisma.auditLog.count({ where: { status: "WARNING" } }),
            // Failures today
            prisma.auditLog.count({
                where: {
                    status: "FAILURE",
                    createdAt: { gte: today },
                },
            }),
            // Unique users (last 7 days)
            prisma.auditLog.groupBy({
                by: ["username"],
                where: { createdAt: { gte: last7d } },
            }),
            // Top actions (all time, top 10)
            prisma.auditLog.groupBy({
                by: ["action"],
                _count: { action: true },
                orderBy: { _count: { action: "desc" } },
                take: 10,
            }),
            // Recent alerts (failures/warnings in last 24h)
            prisma.auditLog.findMany({
                where: {
                    status: { in: ["FAILURE", "WARNING"] },
                    createdAt: { gte: last24h },
                },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: {
                    id: true,
                    action: true,
                    username: true,
                    resource: true,
                    status: true,
                    createdAt: true,
                },
            }),
            // Hourly activity (last 24 hours)
            prisma.$queryRaw`
                SELECT 
                    DATE_FORMAT(createdAt, '%Y-%m-%d %H:00:00') as hour,
                    COUNT(*) as count
                FROM AuditLog
                WHERE createdAt >= ${last24h}
                GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d %H:00:00')
                ORDER BY hour ASC
            `,
        ]);

        // Calculate success rate
        const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : "100";

        // Format action breakdown with percentages
        const formattedActions = (actionBreakdown as Array<{ action: string; _count: { action: number } }>).map((item) => ({
            action: item.action,
            count: item._count.action,
            percentage: totalCount > 0 ? ((item._count.action / totalCount) * 100).toFixed(1) : "0",
        }));

        // Format hourly activity for chart
        const formattedHourly = (hourlyActivity as HourlyActivityRow[]).map((item) => ({
            hour: item.hour,
            count: Number(item.count),
        }));

        await logAudit({
            username: session.user.username,
            action: "VIEW_AUDIT_STATS",
            resource: "admin:audit-logs:stats",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                totalEvents: totalCount,
                failuresToday,
                uniqueUsers: uniqueUsers.length,
            },
        });

        return NextResponse.json({
            summary: {
                totalEvents: totalCount,
                successRate: parseFloat(successRate),
                successCount,
                failureCount,
                warningCount,
                failuresToday,
                uniqueUsers: uniqueUsers.length,
            },
            actionBreakdown: formattedActions,
            recentAlerts,
            hourlyActivity: formattedHourly,
        });

    } catch (error) {
        logger.error("[API] Failed to fetch audit stats:", error);
        await logAudit({
            username: "unknown",
            action: "VIEW_AUDIT_STATS",
            resource: "admin:audit-logs:stats",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
