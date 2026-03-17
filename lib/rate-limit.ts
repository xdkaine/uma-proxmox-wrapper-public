import { NextRequest } from 'next/server';
import { getRedisClient, isRedisAvailable } from './redis';
import { logger } from './logger';

/**
 * Rate Limiting with Redis Support
 * 
 * HIGH-2: Persistent rate limiting across restarts and multiple instances
 * 
 * Features:
 * - Redis-based rate limiting (persistent)
 * - Automatic fallback to in-memory if Redis unavailable
 * - Cleanup of expired in-memory entries
 */

interface RateLimitStore {
    [key: string]: {
        count: number;
        resetTime: number;
        lastAttempt: number;
    };
}

const store: RateLimitStore = {};

// Cleanup old entries every 5 minutes (for in-memory fallback)
setInterval(() => {
    const now = Date.now();
    Object.keys(store).forEach(key => {
        if (store[key].resetTime < now) {
            delete store[key];
        }
    });
}, 5 * 60 * 1000);

export interface RateLimitConfig {
    windowMs: number;
    maxAttempts: number;
    blockDurationMs?: number;
}

// Rate limit presets for different operations
export const RATE_LIMITS = {
    LOGIN: { windowMs: 15 * 60 * 1000, maxAttempts: 5 }, // 5 attempts per 15 minutes (HIGH-1: Reduced from 25)
    POOL_CREATE: { windowMs: 60 * 60 * 1000, maxAttempts: 30 }, // 30 pools per hour
    ACL_MODIFY: { windowMs: 60 * 1000, maxAttempts: 50 }, // 50 ACL changes per minute
    VNET_CREATE: { windowMs: 60 * 60 * 1000, maxAttempts: 50 }, // 50 VNETs per hour
    SEARCH: { windowMs: 60 * 1000, maxAttempts: 60 }, // 60 searches per minute
    VM_CREATE: { windowMs: 60 * 60 * 1000, maxAttempts: 20 }, // 20 VM creates per hour
    VM_DELETE: { windowMs: 60 * 60 * 1000, maxAttempts: 20 }, // 20 VM deletes per hour
    VM_POWER: { windowMs: 60 * 1000, maxAttempts: 30 }, // 30 power actions per minute
    VM_CLONE: { windowMs: 60 * 60 * 1000, maxAttempts: 10 }, // 10 clones per hour
    VM_CONFIG: { windowMs: 60 * 1000, maxAttempts: 30 }, // 30 config changes per minute
    VM_SNAPSHOT: { windowMs: 60 * 1000, maxAttempts: 10 }, // 10 snapshot ops per minute
    UPLOAD: { windowMs: 60 * 60 * 1000, maxAttempts: 50 }, // 50 uploads per hour
};

/**
 * Check rate limit using Redis (with fallback to in-memory)
 * HIGH-2: Redis provides persistence across restarts
 */
export async function checkRateLimitAsync(
    identifier: string,
    config: RateLimitConfig = { windowMs: 15 * 60 * 1000, maxAttempts: 5 }
): Promise<{ allowed: boolean; retryAfter?: number }> {
    // Try Redis first
    if (isRedisAvailable()) {
        try {
            const redis = getRedisClient();
            if (redis) {
                const key = `ratelimit:${identifier}`;

                // Get current count
                const count = await redis.incr(key);

                // Set expiration on first attempt
                if (count === 1) {
                    await redis.pexpire(key, config.windowMs);
                }

                if (count > config.maxAttempts) {
                    const ttl = await redis.pttl(key);
                    const retryAfter = Math.ceil(ttl / 1000);
                    return { allowed: false, retryAfter };
                }

                return { allowed: true };
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'unknown_error';
            logger.error(`[RateLimit] Redis error: ${message}, falling back to in-memory`);
            // Fall through to in-memory
        }
    }

    // Fallback to in-memory
    return checkRateLimitMemory(identifier, config);
}

/**
 * In-memory rate limiting (fallback)
 */
function checkRateLimitMemory(
    identifier: string,
    config: RateLimitConfig
): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const record = store[identifier];

    if (!record || record.resetTime < now) {
        // New window
        store[identifier] = {
            count: 1,
            resetTime: now + config.windowMs,
            lastAttempt: now
        };
        return { allowed: true };
    }

    // Increment attempt count
    record.count++;
    record.lastAttempt = now;

    if (record.count > config.maxAttempts) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        return { allowed: false, retryAfter };
    }

    return { allowed: true };
}

/**
 * Synchronous rate limit check (uses in-memory only)
 * Use checkRateLimitAsync for Redis support
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = { windowMs: 15 * 60 * 1000, maxAttempts: 5 }
): { allowed: boolean; retryAfter?: number } {
    return checkRateLimitMemory(identifier, config);
}

function getRemoteIp(request: NextRequest): string | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = ((request as any).ip as string | undefined)?.trim();
    if (!raw) {
        return null;
    }

    const bracketed = raw.match(/^\[(.+)\](?::\d+)?$/);
    if (bracketed) {
        return bracketed[1] || null;
    }

    if (raw.includes('.') && /:\d+$/.test(raw)) {
        return raw.replace(/:\d+$/, '');
    }

    return raw;
}

function normalizeForwardedToken(value: string): string {
    return value.trim().replace(/^for=/i, '').replace(/^"|"$/g, '').replace(/^\[|\]$/g, '');
}

function isValidIpToken(value: string): boolean {
    if (!value) return false;
    const token = value.trim();

    const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^[0-9a-f:]+$/i;

    if (ipv4Regex.test(token)) {
        return token.split('.').every((part) => {
            const n = Number(part);
            return Number.isInteger(n) && n >= 0 && n <= 255;
        });
    }

    return ipv6Regex.test(token) && token.includes(':');
}

function getForwardedClientIp(request: NextRequest): string | null {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        const first = normalizeForwardedToken(forwardedFor.split(',')[0]);
        if (isValidIpToken(first)) {
            return first;
        }
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        const normalized = normalizeForwardedToken(realIp);
        if (isValidIpToken(normalized)) {
            return normalized;
        }
    }

    return null;
}

export function getRateLimitIdentifier(request: NextRequest): string {
    const trustProxy = process.env.RATE_LIMIT_TRUST_PROXY === 'true';
    const remoteIp = getRemoteIp(request);

    if (trustProxy) {
        const trustedProxyList = (process.env.RATE_LIMIT_TRUSTED_PROXIES || '127.0.0.1,::1')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        const remoteIsTrustedProxy = !!remoteIp && trustedProxyList.includes(remoteIp);

        if (remoteIsTrustedProxy) {
            const forwardedClientIp = getForwardedClientIp(request);
            if (forwardedClientIp) {
                return forwardedClientIp;
            }
        } else {
            logger.warn('[RateLimit] RATE_LIMIT_TRUST_PROXY enabled but request source is not trusted; ignoring forwarded IP headers.');
        }
    }

    return remoteIp || 'unknown';
}
