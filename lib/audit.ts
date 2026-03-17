import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type AuditAction =
    | "ACL_UPDATE"
    | "BACKUP_CREATE"
    | "CHAT_GROUP_HISTORY_VIEW"
    | "CHAT_HISTORY_VIEW"
    | "CHAT_PUBLIC_CHANNEL_JOIN"
    | "CHAT_PUBLIC_CHANNEL_VIEW"
    | "CHAT_RECENT_VIEW"
    | "CREATE_NOTIFICATION"
    | "DELETE_NOTIFICATION"
    | "DOC_ADMIN_LIST"
    | "DOC_CREATE"
    | "DOC_DELETE"
    | "DOC_PUBLIC_LIST"
    | "DOC_PUBLIC_VIEW"
    | "DOC_UPDATE"
    | "DOC_VIEW"
    | "GROUP_CREATE"
    | "GROUP_UPDATE"
    | "GROUP_VIEW"
    | "HW_TEMPLATE_CREATE"
    | "HW_TEMPLATE_DELETE"
    | "HW_TEMPLATE_LIST"
    | "HW_TEMPLATE_UPDATE"
    | "HW_TEMPLATE_VIEW"
    | "LIST_ISOS"
    | "LOGIN"
    | "LOGOUT"
    | "METADATA_FETCH"
    | "POOL_ACL_UPDATE"
    | "POOL_CREATE"
    | "POOL_DELETE"
    | "POOL_LIMITS_VIEW"
    | "REPLICATION_CREATE"
    | "REPLICATION_DELETE"
    | "SETTINGS_ACCESS_UPDATE"
    | "SETTINGS_LIMITS_UPDATE"
    | "NOTIFICATION_UPDATE"
    | "POOL_LIMITS_UPDATE"
    | "UPDATE_SETTINGS"
    | "UPLOAD_FILE"
    | "VIEW_AUDIT_LOGS"
    | "VIEW_AUDIT_STATS"
    | "VIEW_AUDIT_SUGGESTIONS"
    | "VIEW_GROUPS"
    | "VIEW_NEXT_ID"
    | "VIEW_NEXT_TAG"
    | "VIEW_NODE"
    | "VIEW_POOLS"
    | "VIEW_PROFILE"
    | "VIEW_REPLICATION"
    | "VIEW_RESOURCES"
    | "VIEW_ROLES"
    | "VIEW_SNAPSHOTS"
    | "VIEW_VM"
    | "VIEW_STORAGE"
    | "VIEW_TASK_STATUS"
    | "VIEW_TASKS"
    | "VIEW_TEMPLATES"
    | "VIEW_NOTIFICATIONS"
    | "VIEW_USERS"
    | "VIEW_VNETS"
    | "VIEW_ZONES"
    | "VM_CONSOLE_OPEN"
    | "VM_CREATE"
    | "VM_DELETE"
    | "VM_FIREWALL_UPDATE"
    | "VM_REBOOT"
    | "VM_RESIZE"
    | "VM_SHUTDOWN"
    | "VM_SNAPSHOT_CREATE"
    | "VM_SNAPSHOT_DELETE"
    | "VM_SNAPSHOT_ROLLBACK"
    | "VM_START"
    | "VM_STOP"
    | "VM_UPDATE"
    | "VNET_CREATE"
    | "VNET_DELETE"
    | "WHITEBOARD_CLEAR"
    | "WHITEBOARD_SAVE"
    | "WHITEBOARD_VIEW"
    | "ZONE_CREATE"
    | "SDN_APPLY"
    | "SYSTEM_ACTION";

export const AuditResource = {
    SYSTEM: "system",
    AUTH: "auth",
    SETTINGS: "settings"
}

/**
 * Extracts client context (IP address and user agent) from HTTP request.
 * Used to enhance audit logs with client information for security analysis.
 */
export function getClientContext(request: any) {
    // Extract IP address with fallback chain
    const ipAddress =
        request.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers?.get?.('x-real-ip') ||
        request.ip ||
        'unknown';

    const userAgent = request.headers?.get?.('user-agent') || 'unknown';

    return { ipAddress, userAgent };
}

export type AuditLogData = {
    userId?: string | null;
    username: string;
    action: AuditAction;
    resource: string;
    details: any;
    ipAddress?: string;
    userAgent?: string;
    status?: "SUCCESS" | "FAILURE" | "WARNING";
};

/**
 * Creates an audit log entry in the database.
 * This function is fire-and-forget; it effectively swallows errors to prevent
 * audit logging failures from blocking critical user actions, but logs errors to the system logger.
 */
export async function logAudit(data: AuditLogData) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: data.userId,
                username: data.username,
                action: data.action,
                resource: data.resource,
                details: data.details,
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
                status: data.status || "SUCCESS",
            },
        });

        // Log to console via logger.audit to ensure visibility in Docker logs
        const result = data.status === 'FAILURE' ? 'failure' : 'success';
        logger.audit(data.action, data.username, data.resource, result, data.details);
    } catch (error) {
        logger.error(`[Audit] Failed to create audit log for ${data.action}:`, error);
        // We do NOT throw here to avoid failing the main request
    }
}
