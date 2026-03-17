
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateCSRFToken } from "@/lib/csrf";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

const createDocSchema = z.object({
    title: z.string().min(1, "Title is required"),
    subtitle: z.string().optional(),
    author: z.string().min(1, "Author is required"),
    content: z.string().min(1, "Content is required"),
    coverImage: z.string().optional(),
    published: z.boolean().optional(),
    pinned: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    try {
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
        if (!session.user?.isLoggedIn || !session.user.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "DOC_ADMIN_LIST",
                resource: "docs:admin",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const requestedLimit = parseInt(searchParams.get("limit") || "100", 10);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 300) : 100;

        const rlKey = `admin-docs-list:${session.user.username}:${getRateLimitIdentifier(request)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
        }

        const docs = await prisma.doc.findMany({
            orderBy: [
                { pinned: "desc" },
                { createdAt: "desc" },
            ],
            take: limit,
        });

        await logAudit({
            username: session.user.username,
            action: "DOC_ADMIN_LIST",
            resource: "docs:admin",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { limit, resultCount: docs.length },
        });
        return NextResponse.json(docs);
    } catch (error) {
        console.error("Error fetching docs:", error);
        await logAudit({
            username: "unknown",
            action: "DOC_ADMIN_LIST",
            resource: "docs:admin",
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

export async function POST(req: NextRequest) {
    const client = getClientContext(req);
    try {
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

        if (!session.user?.isLoggedIn || !session.user.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "DOC_CREATE",
                resource: "docs:admin",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        if (!validateCSRFToken(req, session.csrfToken)) {
            return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
        }

        const rlKey = `admin-docs:${getRateLimitIdentifier(req)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.UPLOAD);
        if (!rl.allowed) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
        }

        const json = await req.json();

        // Override author with session data
        const authorName = session.user.displayName || session.user.username;

        // We need to validate manually or adjust schema, 
        // but for now let's just inject the author into the body before parsing
        // or create a partial schema.
        // Simplest is to inject it:
        const payload = {
            ...json,
            author: authorName
        };

        const body = createDocSchema.parse(payload);

        const doc = await prisma.doc.create({
            data: {
                title: body.title,
                subtitle: body.subtitle,
                author: body.author, // This is now guaranteed to be from session
                content: body.content,
                coverImage: body.coverImage,
                published: body.published ?? true,
                pinned: body.pinned ?? false,
            },
        });

        await logAudit({
            username: session.user.username,
            action: "DOC_CREATE",
            resource: `doc:${doc.id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                after: {
                    id: doc.id,
                    title: doc.title,
                    published: doc.published,
                    pinned: doc.pinned,
                },
            },
        });

        return NextResponse.json(doc);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.issues },
                { status: 400 }
            );
        }
        console.error("Error creating doc:", error);
        await logAudit({
            username: "unknown",
            action: "DOC_CREATE",
            resource: "docs:admin",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to create doc" },
            { status: 500 }
        );
    }
}
