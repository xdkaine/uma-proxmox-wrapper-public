
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateCSRFToken } from "@/lib/csrf";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

const updateDocSchema = z.object({
    title: z.string().min(1, "Title is required").optional(),
    subtitle: z.string().optional(),
    author: z.string().min(1, "Author is required").optional(),
    content: z.string().min(1, "Content is required").optional(),
    coverImage: z.string().optional(),
    published: z.boolean().optional(),
    pinned: z.boolean().optional(),
});

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const client = getClientContext(req);
    try {
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
        if (!session.user?.isLoggedIn || !session.user.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "DOC_VIEW",
                resource: "docs:admin",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = (await params).id;
        const rlKey = `admin-doc-detail:${session.user.username}:${id}:${getRateLimitIdentifier(req)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        const doc = await prisma.doc.findUnique({
            where: { id },
        });

        if (!doc) {
            return NextResponse.json(
                { error: "Doc not found" },
                { status: 404 }
            );
        }

        await logAudit({
            username: session.user.username,
            action: "DOC_VIEW",
            resource: `doc:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { published: doc.published, pinned: doc.pinned },
        });

        return NextResponse.json(doc);
    } catch (error) {
        console.error("Error fetching doc:", error);
        await logAudit({
            username: "unknown",
            action: "DOC_VIEW",
            resource: "docs:admin",
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

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const client = getClientContext(req);
    try {
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
        if (!session.user?.isLoggedIn || !session.user.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "DOC_UPDATE",
                resource: "docs:admin",
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

        const id = (await params).id;
        const json = await req.json();
        const body = updateDocSchema.parse(json);

        const before = await prisma.doc.findUnique({
            where: { id },
            select: { id: true, title: true, subtitle: true, author: true, published: true, pinned: true },
        });

        const doc = await prisma.doc.update({
            where: { id },
            data: body,
        });

        await logAudit({
            username: session.user.username,
            action: "DOC_UPDATE",
            resource: `doc:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                before,
                after: {
                    id: doc.id,
                    title: doc.title,
                    subtitle: doc.subtitle,
                    author: doc.author,
                    published: doc.published,
                    pinned: doc.pinned,
                },
                changedFields: Object.keys(body),
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
        console.error("Error updating doc:", error);
        await logAudit({
            username: "unknown",
            action: "DOC_UPDATE",
            resource: "docs:admin",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to update doc" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const client = getClientContext(req);
    try {
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
        if (!session.user?.isLoggedIn || !session.user.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "DOC_DELETE",
                resource: "docs:admin",
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

        const id = (await params).id;
        const before = await prisma.doc.findUnique({
            where: { id },
            select: { id: true, title: true, subtitle: true, author: true, published: true, pinned: true },
        });
        await prisma.doc.delete({
            where: { id },
        });

        await logAudit({
            username: session.user.username,
            action: "DOC_DELETE",
            resource: `doc:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { before },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting doc:", error);
        await logAudit({
            username: "unknown",
            action: "DOC_DELETE",
            resource: "docs:admin",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to delete doc" },
            { status: 500 }
        );
    }
}
