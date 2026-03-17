import { prisma } from "@/lib/prisma";

export interface AccessConfig {
    adminGroups: string[];
    allowedGroups: string[];
}

export interface ResourceLimitsConfig {
    maxVnetsPerUser: number;
}

const CONFIG_KEY = 'access_control';
const RESOURCE_LIMITS_KEY = 'resource_limits';

// Initial default config, merging with ENV 
function getDefaultConfig(): AccessConfig {
    const envAdminGroups = process.env.ADMIN_GROUPS
        ? process.env.ADMIN_GROUPS.split(',').map(g => g.trim())
        : [];

    return {
        adminGroups: envAdminGroups,
        allowedGroups: []
    };
}

function getDefaultResourceLimitsConfig(): ResourceLimitsConfig {
    const maxVnetsPerUser = Number.parseInt(process.env.MAX_VNETS_PER_USER || '0', 10);

    return {
        maxVnetsPerUser: Number.isFinite(maxVnetsPerUser) ? Math.max(0, maxVnetsPerUser) : 0
    };
}

export async function getAccessConfig(): Promise<AccessConfig> {
    try {
        const configRecord = await prisma.appConfig.findUnique({
            where: { key: CONFIG_KEY }
        });

        if (configRecord) {
            // HIGH-5: Prisma automatically handles Json type - no JSON.parse needed
            // Use type assertion through unknown for safety
            return configRecord.value as unknown as AccessConfig;
        }

        // If not found, return default (bootstrap from ENV)
        return getDefaultConfig();
    } catch (error) {
        console.error("Failed to load access config from DB:", error);
        // Fallback to defaults if DB fails (e.g. during startup or connection issue)
        return getDefaultConfig();
    }
}

export async function updateAccessConfig(newConfig: AccessConfig): Promise<void> {
    try {
        // HIGH-5: Prisma handles Json type serialization automatically
        await prisma.appConfig.upsert({
            where: { key: CONFIG_KEY },
            update: {
                value: newConfig as any, // Prisma will serialize to JSON
            },
            create: {
                key: CONFIG_KEY,
                value: newConfig as any, // Prisma will serialize to JSON
            }
        });
    } catch (error) {
        console.error("Failed to update access config in DB:", error);
        throw error;
    }
}

export async function getResourceLimitsConfig(): Promise<ResourceLimitsConfig> {
    try {
        const configRecord = await prisma.appConfig.findUnique({
            where: { key: RESOURCE_LIMITS_KEY }
        });

        if (configRecord) {
            return configRecord.value as unknown as ResourceLimitsConfig;
        }

        return getDefaultResourceLimitsConfig();
    } catch (error) {
        console.error("Failed to load resource limits config from DB:", error);
        return getDefaultResourceLimitsConfig();
    }
}

export async function updateResourceLimitsConfig(newConfig: ResourceLimitsConfig): Promise<void> {
    try {
        await prisma.appConfig.upsert({
            where: { key: RESOURCE_LIMITS_KEY },
            update: {
                value: newConfig as any,
            },
            create: {
                key: RESOURCE_LIMITS_KEY,
                value: newConfig as any,
            }
        });
    } catch (error) {
        console.error("Failed to update resource limits config in DB:", error);
        throw error;
    }
}
