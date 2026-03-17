import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { validateCSRFToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import DOMPurify from 'isomorphic-dompurify';
import { getClientContext, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

// PATCH /api/notifications/[id] - Update notification (admin only)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const client = getClientContext(request);
    try {
        // Check admin authentication
        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user?.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "NOTIFICATION_UPDATE",
                resource: "notifications:active",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // MEDIUM-2: CSRF Protection
        if (!validateCSRFToken(request, session.csrfToken)) {
            logger.warn('CSRF token validation failed for notification update');
            await logAudit({
                username: session.user.username,
                action: "NOTIFICATION_UPDATE",
                resource: "notifications:active",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "invalid_csrf" },
            });
            return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const { message, type, priority, isActive } = body;
        const before = await prisma.notification.findUnique({ where: { id } });

        // Validate type if provided
        if (type) {
            const validTypes = ['info', 'warning', 'error', 'success'];
            if (!validTypes.includes(type)) {
                return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
            }
        }

        const updateData: any = {};

        // CRITICAL-3: Sanitize message if provided (consistent with POST handler)
        if (message !== undefined) {
            updateData.message = DOMPurify.sanitize(message, {
                ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br'],
                ALLOWED_ATTR: [],
                ALLOW_DATA_ATTR: false
            });
        }
        if (type !== undefined) updateData.type = type;
        if (priority !== undefined) updateData.priority = parseInt(priority);
        if (isActive !== undefined) updateData.isActive = isActive;

        const notification = await prisma.notification.update({
            where: { id },
            data: updateData
        });

        await logAudit({
            username: session.user.username,
            action: "NOTIFICATION_UPDATE",
            resource: `notification:${id}`,
            details: {
                id,
                before,
                after: notification,
                changedFields: Object.keys(updateData),
            },
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            status: "SUCCESS"
        });
        return NextResponse.json({ notification }, { status: 200 });
    } catch (error: any) {
        logger.error(`Error updating notification: ${error.message}`);
        await logAudit({
            username: "unknown",
            action: "NOTIFICATION_UPDATE",
            resource: "notifications:active",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error?.message || "unknown_error" },
        });
        return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
    }
}

// DELETE /api/notifications/[id] - Delete notification (admin only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const client = getClientContext(request);
    try {
        // Check admin authentication
        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        if (!session.user?.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "DELETE_NOTIFICATION",
                resource: "notifications:active",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // MEDIUM-2: CSRF Protection
        if (!validateCSRFToken(request, session.csrfToken)) {
            logger.warn('CSRF token validation failed for notification deletion');
            await logAudit({
                username: session.user.username,
                action: "DELETE_NOTIFICATION",
                resource: "notifications:active",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "invalid_csrf" },
            });
            return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
        }

        const { id } = await params;
        const before = await prisma.notification.findUnique({ where: { id } });

        await prisma.notification.delete({
            where: { id }
        });

        await logAudit({
            username: session.user.username,
            action: "DELETE_NOTIFICATION",
            resource: `notification:${id}`,
            details: { id, before },
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            status: "SUCCESS"
        });
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        logger.error(`Error deleting notification: ${error.message}`);
        await logAudit({
            username: "unknown",
            action: "DELETE_NOTIFICATION",
            resource: "notifications:active",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error?.message || "unknown_error" },
        });
        return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
    }
}
