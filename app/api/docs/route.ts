import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    try {
        const { searchParams } = new URL(request.url);
        const requestedLimit = parseInt(searchParams.get("limit") || "50", 10);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;

        const rlKey = `public-docs:${getRateLimitIdentifier(request)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        const docs = await prisma.doc.findMany({
            where: { published: true },
            orderBy: [
                { pinned: "desc" },
                { createdAt: "desc" },
            ],
            take: limit,
        });

        await logAudit({
            username: "anonymous",
            action: "DOC_PUBLIC_LIST",
            resource: "docs:public",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { limit, resultCount: docs.length },
        });
        return NextResponse.json(docs);
    } catch (error) {
        console.error("Error fetching public docs:", error);
        await logAudit({
            username: "anonymous",
            action: "DOC_PUBLIC_LIST",
            resource: "docs:public",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to fetch docs" },
            { status: 500 }
        );
    }
}
