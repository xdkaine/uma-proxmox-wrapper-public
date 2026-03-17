import { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * Redis Client for Rate Limiting
 * 
 * HIGH-2: Persistent rate limiting across restarts and multiple instances
 * 
 * Features:
 * - Connection pooling
 * - Automatic reconnection
 * - Graceful fallback if Redis unavailable
 */

let redis: Redis | null = null;
let redisAvailable = false;

function createRedisClient(): Redis | null {
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

    // Skip Redis if explicitly disabled or in development without Redis
    if (process.env.DISABLE_REDIS === 'true') {
        logger.warn('[Redis] Redis disabled via environment variable');
        return null;
    }

    try {
        const client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            lazyConnect: true, // Don't connect immediately
        });

        client.on('error', (error) => {
            logger.error(`[Redis] Connection error: ${error.message}`);
            redisAvailable = false;
        });

        client.on('connect', () => {
            logger.info('[Redis] Connected successfully');
            redisAvailable = true;
        });

        client.on('ready', () => {
            logger.info('[Redis] Client ready');
            redisAvailable = true;
        });

        client.on('close', () => {
            logger.warn('[Redis] Connection closed');
            redisAvailable = false;
        });

        // Attempt connection
        client.connect().catch((error) => {
            logger.warn(`[Redis] Failed to connect: ${error.message}. Rate limiting will use in-memory store.`);
            redisAvailable = false;
        });

        return client;
    } catch (error: any) {
        logger.error(`[Redis] Failed to create client: ${error.message}`);
        return null;
    }
}

// Initialize Redis client
redis = createRedisClient();

/**
 * Check if Redis is available and connected
 */
export function isRedisAvailable(): boolean {
    return redisAvailable && redis !== null && redis.status === 'ready';
}

/**
 * Get or create Redis client
 */
export function getRedisClient(): Redis | null {
    if (!redis) {
        redis = createRedisClient();
    }
    return redis;
}

/**
 * Graceful shutdown
 */
export async function disconnectRedis(): Promise<void> {
    if (redis) {
        try {
            await redis.quit();
            logger.info('[Redis] Disconnected gracefully');
        } catch (error: any) {
            logger.error(`[Redis] Error during disconnect: ${error.message}`);
        }
    }
}

// Handle process termination
if (typeof process !== 'undefined') {
    process.on('SIGTERM', disconnectRedis);
    process.on('SIGINT', disconnectRedis);
}

export { redis };
