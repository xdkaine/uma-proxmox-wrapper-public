import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { proxmox } from "@/lib/proxmox-api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkPoolAccess } from "@/lib/acl";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ poolId: string }> }) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const isAdmin = !!session.user.isAdmin;

    const { poolId } = await params;
    const rlKey = `pool-limits:${session.user.username}:${poolId}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    // Access check: global limits are readable by authenticated users for UI validation,
    // specific pools still require pool access.
    if (poolId === 'global') {
        // allow read-only access for any authenticated user
    } else {
        const poolAccess = await checkPoolAccess(
            session.user.username,
            session.user.groups || [],
            poolId,
            session.user.isAdmin
        );
        if (!poolAccess.hasAccess) {
            await logAudit({
                username: session.user.username,
                action: "POOL_LIMITS_VIEW",
                resource: `pool:${poolId}`,
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "forbidden" },
            });
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }

    try {
        const globalLimits = await prisma.poolLimit.findUnique({
            where: { poolId: 'global' }
        });

        let usage = { vms: 0, lxcs: 0 };

        // If global, fetch actual usage
        if (poolId === 'global' && isAdmin) {
            try {
                const resources = await proxmox.getResources();
                // Filter by type and exclude templates
                usage.vms = resources.filter((r: any) => r.type === 'qemu' && !r.template).length;
                usage.lxcs = resources.filter((r: any) => r.type === 'lxc' && !r.template).length;
            } catch (e) {
                logger.error("Failed to fetch current global usage", e);
            }
        } else {
            // Fetch usage for specific pool
            try {
                const resources = await proxmox.getResources();
                usage.vms = resources.filter((r: any) => r.pool === poolId && r.type === 'qemu' && !r.template).length;
                usage.lxcs = resources.filter((r: any) => r.pool === poolId && r.type === 'lxc' && !r.template).length;
            } catch (e) {
                logger.error(`Failed to fetch usage for pool ${poolId}`, e);
            }
        }

        const limits = {
            poolId,
            maxVMs: globalLimits?.maxVMs || 0,
            maxLXCs: globalLimits?.maxLXCs || 0,
            maxVnets: globalLimits?.maxVnets || 0,
            maxCpu: globalLimits?.maxCpu || 0,
            maxMemory: globalLimits?.maxMemory || 0,
            maxDisk: globalLimits?.maxDisk || 0
        };

        if (poolId === 'global' && !isAdmin) {
            await logAudit({
                username: session.user.username,
                action: "POOL_LIMITS_VIEW",
                resource: "pool:global",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { limitedResponse: true, maxVMs: limits.maxVMs },
            });
            return NextResponse.json({
                poolId,
                maxVMs: limits.maxVMs
            });
        }

        await logAudit({
            username: session.user.username,
            action: "POOL_LIMITS_VIEW",
            resource: `pool:${poolId}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { limits, usage },
        });

        // Return limits + usage
        return NextResponse.json({
            ...limits,
            usage // Add usage to response
        });
    } catch (error) {
        await logAudit({
            username: session.user.username,
            action: "POOL_LIMITS_VIEW",
            resource: `pool:${poolId}`,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to fetch limits" }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ poolId: string }> }) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { poolId } = await params;
    if (poolId !== 'global') {
        return NextResponse.json({ error: "Per-pool limits are managed globally." }, { status: 400 });
    }
    const body = await request.json();

    try {
        const before = await prisma.poolLimit.findUnique({ where: { poolId } });
        const limits = await prisma.poolLimit.upsert({
            where: { poolId },
            update: {
                maxVMs: parseInt(body.maxVMs || 0),
                maxLXCs: parseInt(body.maxLXCs || 0),
                maxVnets: parseInt(body.maxVnets || 0),
                maxCpu: parseInt(body.maxCpu || 0),
                maxMemory: parseInt(body.maxMemory || 0),
                maxDisk: parseInt(body.maxDisk || 0),
            },
            create: {
                poolId,
                maxVMs: parseInt(body.maxVMs || 0),
                maxLXCs: parseInt(body.maxLXCs || 0),
                maxVnets: parseInt(body.maxVnets || 0),
                maxCpu: parseInt(body.maxCpu || 0),
                maxMemory: parseInt(body.maxMemory || 0),
                maxDisk: parseInt(body.maxDisk || 0),
            }
        });

        await logAudit({
            username: session.user.username,
            action: "POOL_LIMITS_UPDATE",
            resource: `pool-limits:${poolId}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                before,
                after: limits,
            },
        });

        return NextResponse.json(limits);
    } catch (error) {
        logger.error("Failed to update pool limits", error);
        await logAudit({
            username: session.user.username,
            action: "POOL_LIMITS_UPDATE",
            resource: `pool-limits:${poolId}`,
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to update limits" }, { status: 500 });
    }
}
