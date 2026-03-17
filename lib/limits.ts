import { prisma } from "@/lib/prisma";
import { proxmox } from "@/lib/proxmox-api";

export class PoolLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PoolLimitError';
    }
}

/**
 * Checks if the global system resource limits have been reached.
 * Throws PoolLimitError if limit is reached.
 * 
 * @param type The type of resource ('qemu' | 'lxc')
 */
export async function checkGlobalLimits(type: 'qemu' | 'lxc'): Promise<void> {
    // 1. Get Global Limits (stored with poolId = 'global')
    const limits = await prisma.poolLimit.findUnique({
        where: { poolId: 'global' }
    });

    if (!limits) return;

    // 2. Check specific limit based on type
    const maxLimit = type === 'qemu' ? limits.maxVMs : limits.maxLXCs;

    // If limit is 0, it means unlimited
    if (maxLimit <= 0) return;

    // 3. Get total system usage
    try {
        const allResources = await proxmox.getResources();

        // Filter by type and exclude templates
        const currentCount = allResources.filter((m: any) => m.type === type && !m.template).length;

        if (currentCount >= maxLimit) {
            const resourceName = type === 'qemu' ? 'VMs' : 'LXCs';
            throw new PoolLimitError(`Global limit reached: Max ${maxLimit} ${resourceName} allowed in the system.`);
        }
    } catch (error: any) {
        if (error instanceof PoolLimitError) {
            throw error;
        }

        console.error("Failed to check global limits:", error);
        // Fail open logic as before
    }
}

/**
 * Checks if the per-pool cap has been reached.
 * The cap is defined by the global limits row and applied to each pool.
 * Throws PoolLimitError if limit is reached.
 *
 * @param poolId The ID of the pool
 * @param type The type of resource ('qemu' | 'lxc')
 */
export async function checkPoolLimits(poolId: string, type: 'qemu' | 'lxc'): Promise<void> {
    // 1. Get Global Cap (stored with poolId = 'global')
    const limits = await prisma.poolLimit.findUnique({
        where: { poolId: 'global' }
    });

    if (!limits) return;

    // 2. Check specific limit based on type
    const maxLimit = type === 'qemu' ? limits.maxVMs : limits.maxLXCs;

    // If limit is 0, it means unlimited
    if (maxLimit <= 0) return;

    // 3. Get pool usage
    try {
        const allResources = await proxmox.getResources();

        // Filter by pool, type and exclude templates
        const currentCount = allResources.filter((m: any) =>
            m.pool === poolId &&
            m.type === type &&
            !m.template
        ).length;

        if (currentCount >= maxLimit) {
            const resourceName = type === 'qemu' ? 'VMs' : 'LXCs';
            throw new PoolLimitError(`Pool cap reached: Max ${maxLimit} ${resourceName} allowed in pool '${poolId}'.`);
        }
    } catch (error: any) {
        if (error instanceof PoolLimitError) {
            throw error;
        }
        console.error(`Failed to check limits for pool ${poolId}:`, error);
    }
}
