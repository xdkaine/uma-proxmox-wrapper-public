import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { validateCSRFToken } from '@/lib/csrf';
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import DOMPurify from 'isomorphic-dompurify';
import { getClientContext, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

// GET /api/notifications - Fetch all active notifications
export async function GET(request: NextRequest) {
    const client = getClientContext(request);
    try {
        // Notifications are shown to authenticated users only
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
        if (!session.user?.isLoggedIn) {
            await logAudit({
                username: "anonymous",
                action: "VIEW_NOTIFICATIONS",
                resource: "notifications:active",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const requestedLimit = parseInt(searchParams.get('limit') || '50', 10);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;

        const rlKey = `notifications-list:${session.user.username}:${getRateLimitIdentifier(request)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
            );
        }

        const notifications = await prisma.notification.findMany({
            where: { isActive: true },
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'desc' }
            ],
            take: limit,
        });

        await logAudit({
            username: session.user.username,
            action: "VIEW_NOTIFICATIONS",
            resource: "notifications:active",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { limit, count: notifications.length },
            status: "SUCCESS",
        });

        return NextResponse.json({ notifications }, { status: 200 });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        await logAudit({
            username: "unknown",
            action: "VIEW_NOTIFICATIONS",
            resource: "notifications:active",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : 'unknown_error' },
        });
        return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }
}

// POST /api/notifications - Create new notification (admin only)
export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    try {
        // Check admin authentication
        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user?.isLoggedIn || !session.user.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "CREATE_NOTIFICATION",
                resource: "notifications:active",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // CRITICAL-2: CSRF Protection
        if (!validateCSRFToken(request, session.csrfToken)) {
            logger.warn('CSRF token validation failed for notification creation');
            await logAudit({
                username: session.user.username,
                action: "CREATE_NOTIFICATION",
                resource: "notifications:active",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "invalid_csrf" },
            });
            return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
        }

        // MEDIUM-1: Rate Limiting
        const identifier = getRateLimitIdentifier(request);
        const rateLimit = await checkRateLimitAsync(`notifications:${identifier}`, {
            windowMs: 60 * 1000,
            maxAttempts: 10
        });

        if (!rateLimit.allowed) {
            logger.warn(`Rate limit exceeded for notification creation: ${identifier}`);
            await logAudit({
                username: session.user.username,
                action: "CREATE_NOTIFICATION",
                resource: "notifications:active",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "rate_limited", retryAfter: rateLimit.retryAfter },
            });
            return NextResponse.json(
                { error: `Rate limit exceeded. Try again in ${rateLimit.retryAfter} seconds.` },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
            );
        }

        const body = await request.json();
        const { message, type = 'info', priority = 0, isActive = true } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Validate type
        const validTypes = ['info', 'warning', 'error', 'success'];
        if (!validTypes.includes(type)) {
            return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
        }

        // CRITICAL-3: XSS Prevention - Sanitize HTML
        // HIGH-FIX: Remove 'a' tag to prevent phishing
        const sanitizedMessage = DOMPurify.sanitize(message, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br'],
            ALLOWED_ATTR: [],
            ALLOW_DATA_ATTR: false
        });

        const notification = await prisma.notification.create({
            data: {
                message: sanitizedMessage,
                type,
                priority: parseInt(priority),
                isActive
            }
        });

        await logAudit({
            username: session.user.username,
            action: "CREATE_NOTIFICATION",
            resource: `notification:${notification.id}`,
            details: { id: notification.id, type, priority },
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            status: "SUCCESS"
        });


        return NextResponse.json({ notification }, { status: 201 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        logger.error(`Error creating notification: ${message}`);
        await logAudit({
            username: "unknown",
            action: "CREATE_NOTIFICATION",
            resource: "notifications:active",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: message },
        });
        return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
    }
}
