/**
 * Structured logging utility that respects environment settings
 * and prevents sensitive data exposure in production
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
    /**
     * Development-only informational logging
     * Suppressed in production to prevent sensitive data exposure
     */
    info: (message: string, meta?: Record<string, any>) => {
        // INFO logs should be visible in production for access logging
        console.info(`[INFO] ${message}`, meta || '');
    },

    /**
     * Debug-level logging for troubleshooting
     * Suppressed in production
     */
    debug: (message: string, meta?: Record<string, any>) => {
        if (isDevelopment) {
            console.debug(`[DEBUG] ${message}`, meta || '');
        }
    },

    /**
     * Warning-level logging for recoverable errors
     * Shown in all environments
     */
    warn: (message: string, meta?: Record<string, any>) => {
        console.warn(`[WARN] ${message}`, meta || '');
    },

    /**
     * Error-level logging for unrecoverable errors
     * Always shown with details
     */
    error: (message: string, error?: any) => {
        console.error(`[ERROR] ${message}`, error || '');
    },

    /**
     * Security audit logging for compliance and forensics
     * Always logged regardless of environment
     */
    audit: (event: string, actor: string, target: string, result: 'success' | 'failure', details?: any) => {
        const timestamp = new Date().toISOString();
        const auditEntry = {
            timestamp,
            event,
            actor,
            target,
            result,
            details: details || '',
        };

        // Log to console for Docker capture
        console.log(`[AUDIT] ${JSON.stringify(auditEntry)}`);
    },
};
