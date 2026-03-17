import { NextRequest } from 'next/server';

/**
 * Generate a cryptographically secure CSRF token
 * @returns A 64-character hex string
 */
export function generateCSRFToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate CSRF token from request against session token
 * @param request The Next.js request object
 * @param sessionToken The CSRF token stored in the session
 * @returns True if the token is valid, false otherwise
 */
export function validateCSRFToken(request: NextRequest, sessionToken: string | undefined): boolean {
    if (!sessionToken) {
        return false;
    }

    const headerToken = request.headers.get('X-CSRF-Token');

    if (!headerToken) {
        return false;
    }

    // Use constant-time comparison to prevent timing attacks
    // Adapted for Edge Runtime (no crypto.timingSafeEqual)
    const a = headerToken;
    const b = sessionToken;

    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}
