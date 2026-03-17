import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientContext, logAudit } from "@/lib/audit";

const MAX_WHITEBOARD_STATE_BYTES = 1024 * 1024;
const WHITEBOARD_RESOURCE = "whiteboard:default";

type WhiteboardPoint = { x?: unknown; y?: unknown };
type WhiteboardStroke = { points?: WhiteboardPoint[]; color?: unknown; width?: unknown };

function toFiniteNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
}

function summarizeStrokes(strokes: unknown): {
    strokeCount: number;
    pointCount: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
    sample: Array<{ index: number; pointCount: number; color: string | null; width: number | null; start: { x: number; y: number } | null; end: { x: number; y: number } | null }>;
} {
    if (!Array.isArray(strokes)) {
        return { strokeCount: 0, pointCount: 0, bounds: null, sample: [] };
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let pointCount = 0;

    const sample = strokes.slice(0, 25).map((stroke: WhiteboardStroke, index) => {
        const points = Array.isArray(stroke?.points) ? stroke.points : [];
        const normalizedPoints = points
            .map((point) => ({ x: toFiniteNumber(point?.x), y: toFiniteNumber(point?.y) }))
            .filter((point): point is { x: number; y: number } => point.x !== null && point.y !== null);

        pointCount += normalizedPoints.length;
        for (const point of normalizedPoints) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        const start = normalizedPoints.length > 0 ? normalizedPoints[0] : null;
        const end = normalizedPoints.length > 0 ? normalizedPoints[normalizedPoints.length - 1] : null;

        return {
            index,
            pointCount: normalizedPoints.length,
            color: typeof stroke?.color === "string" ? stroke.color : null,
            width: toFiniteNumber(stroke?.width),
            start,
            end,
        };
    });

    const bounds = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
        ? { minX, minY, maxX, maxY }
        : null;

    return {
        strokeCount: strokes.length,
        pointCount,
        bounds,
        sample,
    };
}

export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "WHITEBOARD_VIEW",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `whiteboard-read:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_VIEW",
            resource: WHITEBOARD_RESOURCE,
            status: "WARNING",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                reason: "rate_limited",
                retryAfter: rl.retryAfter || 60,
            },
        });
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    try {
        const state = await prisma.whiteboardState.findUnique({
            where: { id: "default" },
        });

        if (!state) {
            await logAudit({
                username: session.user.username,
                action: "WHITEBOARD_VIEW",
                resource: WHITEBOARD_RESOURCE,
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { strokeCount: 0, pointCount: 0, bounds: null },
            });
            return NextResponse.json({ strokes: [] });
        }

        const summary = summarizeStrokes(state.elements);
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_VIEW",
            resource: WHITEBOARD_RESOURCE,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                ...summary,
                payloadBytes: Buffer.byteLength(JSON.stringify(state.elements ?? []), "utf8"),
            },
        });

        return NextResponse.json({
            strokes: state.elements,
        });
    } catch (error) {
        console.error("Error fetching whiteboard state:", error);
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_VIEW",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to fetch whiteboard" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "WHITEBOARD_SAVE",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.isAdmin) {
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_SAVE",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "forbidden_non_admin" },
        });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_SAVE",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "csrf_invalid" },
        });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `whiteboard-save:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.UPLOAD);
    if (!rl.allowed) {
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_SAVE",
            resource: WHITEBOARD_RESOURCE,
            status: "WARNING",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                reason: "rate_limited",
                retryAfter: rl.retryAfter || 60,
            },
        });
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    try {
        const { strokes } = await request.json();

        if (strokes !== undefined && !Array.isArray(strokes)) {
            await logAudit({
                username: session.user.username,
                action: "WHITEBOARD_SAVE",
                resource: WHITEBOARD_RESOURCE,
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "invalid_payload", strokesType: typeof strokes },
            });
            return NextResponse.json({ error: "Invalid whiteboard payload" }, { status: 400 });
        }

        const payloadSize = Buffer.byteLength(JSON.stringify(strokes ?? []), "utf8");
        if (payloadSize > MAX_WHITEBOARD_STATE_BYTES) {
            await logAudit({
                username: session.user.username,
                action: "WHITEBOARD_SAVE",
                resource: WHITEBOARD_RESOURCE,
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: {
                    reason: "payload_too_large",
                    payloadSize,
                    maxPayloadSize: MAX_WHITEBOARD_STATE_BYTES,
                },
            });
            return NextResponse.json({ error: "Whiteboard payload too large" }, { status: 413 });
        }

        const summary = summarizeStrokes(strokes ?? []);

        const state = await prisma.whiteboardState.upsert({
            where: { id: "default" },
            update: {
                elements: strokes ?? [],
            },
            create: {
                id: "default",
                elements: strokes ?? [],
            },
        });

        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_SAVE",
            resource: WHITEBOARD_RESOURCE,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                ...summary,
                payloadSize,
            },
        });

        return NextResponse.json({ success: true, updatedAt: state.updatedAt });
    } catch (error) {
        console.error("Error saving whiteboard state:", error);
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_SAVE",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to save whiteboard" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "WHITEBOARD_CLEAR",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.isAdmin) {
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_CLEAR",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "forbidden_non_admin" },
        });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_CLEAR",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "csrf_invalid" },
        });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `whiteboard-clear:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.UPLOAD);
    if (!rl.allowed) {
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_CLEAR",
            resource: WHITEBOARD_RESOURCE,
            status: "WARNING",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                reason: "rate_limited",
                retryAfter: rl.retryAfter || 60,
            },
        });
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter || 60) } });
    }

    try {
        await prisma.whiteboardState.upsert({
            where: { id: "default" },
            update: { elements: [] },
            create: { id: "default", elements: [] },
        });

        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_CLEAR",
            resource: WHITEBOARD_RESOURCE,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { strokeCount: 0, pointCount: 0, bounds: null },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error clearing whiteboard:", error);
        await logAudit({
            username: session.user.username,
            action: "WHITEBOARD_CLEAR",
            resource: WHITEBOARD_RESOURCE,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to clear whiteboard" }, { status: 500 });
    }
}
