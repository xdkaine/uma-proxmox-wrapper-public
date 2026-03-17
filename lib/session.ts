import { SessionOptions } from "iron-session";

/**
 * Session Data Structure
 */
export interface SessionData {
    user?: User;
    csrfToken?: string;
}

export interface User {
    username: string;
    displayName?: string;
    isLoggedIn: boolean;
    dn?: string;
    groups?: string[];
    isAdmin?: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

// 1. Secret Validation
const cookiePassword = process.env.SECRET_COOKIE_PASSWORD;

// CRITICAL FIX: Enforce strong password in ALL environments. Do not use defaults.
if (!cookiePassword) {
    throw new Error('[Session] PROXMOX-WRAPPER SECURITY ERROR: SECRET_COOKIE_PASSWORD environment variable is missing. The application will not start without it.');
}

if (cookiePassword.length < 32) {
    throw new Error('[Session] SECRET_COOKIE_PASSWORD must be at least 32 characters.');
}

// 2. TTL Configuration (default: 8 hours)
const rawTTL = process.env.SESSION_TTL;
const sessionTTL = rawTTL ? parseInt(rawTTL, 10) : 28800; // 8 hours in seconds

// HIGH-6: Allow 0 for no expiration, but prevent negative values
if (isNaN(sessionTTL) || sessionTTL < 0) {
    throw new Error('[Session] SESSION_TTL must be 0 (no expiration) or a positive number');
}

if (process.env.NODE_ENV === 'production') {
    if (sessionTTL === 0) {
        throw new Error('[Session] SESSION_TTL cannot be 0 in production. Use a bounded value (for example 28800).');
    }

    const maxProductionTTL = 43200; // 12 hours
    if (sessionTTL > maxProductionTTL) {
        throw new Error(`[Session] SESSION_TTL is too high for production. Maximum allowed is ${maxProductionTTL} seconds.`);
    }
}

// 3. Cookie Security Settings
// HIGH-1 FIX: Respect environment variable for secure cookies
// Default to true if not specified, but allow 'false' for local dev
const useSecureCookie = process.env.USE_SECURE_COOKIE === 'false' ? false : true;
if (process.env.NODE_ENV === 'production' && !useSecureCookie) {
    throw new Error('[Session] PROXMOX-WRAPPER SECURITY ERROR: USE_SECURE_COOKIE cannot be false in production.');
}

// 4. Cookie Domain Configuration
// For Docker/reverse proxy setups, you may need to explicitly set the domain
// Leave undefined for automatic domain detection (default)
// Set to empty string '' to make cookie work across all subdomains
const cookieDomain = process.env.COOKIE_DOMAIN !== undefined
    ? (process.env.COOKIE_DOMAIN === '' ? undefined : process.env.COOKIE_DOMAIN)
    : undefined;

// console.log(`[Session] Configured - TTL: ${sessionTTL}s, Secure: ${useSecureCookie}, SameSite: lax, Domain: ${cookieDomain || 'auto'}`);

// ============================================================================
// Session Options
// ============================================================================

export const sessionOptions: SessionOptions = {
    password: cookiePassword,
    cookieName: "proxmox-wrapper-session",
    ttl: sessionTTL,
    cookieOptions: {
        secure: useSecureCookie,
        httpOnly: true,        // Prevent XSS access to cookie
        sameSite: "lax",       // Allows navigation from external sites
        path: "/",             // Cookie available across entire app
        domain: cookieDomain,  // Explicit domain (or undefined for auto-detect)
    },
};

// ============================================================================
// Type Augmentation for iron-session
// ============================================================================

declare module "iron-session" {
    interface IronSessionData extends SessionData { }
}

// ============================================================================
// Session Debugging Utilities
// ============================================================================

/**
 * Helper to log session state for debugging
 */
export function debugSession(context: string, session: SessionData): void {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Session Debug] ${context}`, {
            isLoggedIn: session.user?.isLoggedIn || false,
            username: session.user?.username || 'NONE',
            hasCSRF: !!session.csrfToken,
            isAdmin: session.user?.isAdmin || false,
        });
    }
}

/**
 * Validate session data structure
 */
export function validateSessionData(session: SessionData): boolean {
    if (!session.user) {
        return false;
    }

    if (!session.user.username || typeof session.user.username !== 'string') {
        return false;
    }

    if (typeof session.user.isLoggedIn !== 'boolean') {
        return false;
    }

    return true;
}
