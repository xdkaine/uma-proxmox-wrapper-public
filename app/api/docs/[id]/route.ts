import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const client = getClientContext(req);
    try {
        const id = (await params).id;
        const rlKey = `public-doc-detail:${id}:${getRateLimitIdentifier(req)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        const doc = await prisma.doc.findUnique({
            where: { id, published: true },
        });

        if (!doc) {
            return NextResponse.json(
                { error: "Doc not found" },
                { status: 404 }
            );
        }

        await logAudit({
            username: "anonymous",
            action: "DOC_PUBLIC_VIEW",
            resource: `doc:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { published: doc.published },
        });

        return NextResponse.json(doc);
    } catch (error) {
        console.error("Error fetching doc:", error);
        await logAudit({
            username: "anonymous",
            action: "DOC_PUBLIC_VIEW",
            resource: "docs:public",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to fetch doc" },
            { status: 500 }
        );
    }
}
