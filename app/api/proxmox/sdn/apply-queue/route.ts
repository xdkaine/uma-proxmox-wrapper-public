import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { logger } from "@/lib/logger";
import { logAudit, getClientContext } from "@/lib/audit";
import { getRedisClient, isRedisAvailable } from "@/lib/redis";

const COOLDOWN_SECONDS = 300; // 5 minutes
const COOLDOWN_KEY = "sdn-apply-global-cooldown";

// ─── GET: Check global cooldown status ───────────────────────────────────────
export async function GET(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedisClient();
    let remainingSeconds = 0;
    let appliedBy: string | null = null;

    if (redis && isRedisAvailable()) {
        const ttl = await redis.ttl(COOLDOWN_KEY);
        remainingSeconds = ttl > 0 ? ttl : 0;

        if (remainingSeconds > 0) {
            appliedBy = await redis.get(`${COOLDOWN_KEY}:user`);
        }
    }

    return NextResponse.json({ remainingSeconds, appliedBy });
}

// ─── POST: Apply SDN with global cooldown ────────────────────────────────────
export async function POST(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const username = session.user.username;
    const redis = getRedisClient();

    // ── Check global cooldown ──
    if (redis && isRedisAvailable()) {
        const ttl = await redis.ttl(COOLDOWN_KEY);
        if (ttl > 0) {
            const appliedBy = await redis.get(`${COOLDOWN_KEY}:user`);
            return NextResponse.json(
                {
                    error: "A network configuration change is being applied. Please wait.",
                    remainingSeconds: ttl,
                    appliedBy,
                },
                { status: 429 }
            );
        }
    }

    try {
        // ── Set global cooldown BEFORE applying (lock immediately) ──
        if (redis && isRedisAvailable()) {
            await redis.setex(COOLDOWN_KEY, COOLDOWN_SECONDS, "1");
            await redis.setex(`${COOLDOWN_KEY}:user`, COOLDOWN_SECONDS, username);
        }

        // ── Apply SDN ──
        const result = await proxmox.applySDN();

        // ── Audit log ──
        const { ipAddress, userAgent } = getClientContext(request);
        await logAudit({
            username,
            action: "SDN_APPLY",
            resource: "sdn:cluster",
            details: { result: typeof result === "string" ? result : JSON.stringify(result) },
            ipAddress,
            userAgent,
            status: "SUCCESS",
        });

        return NextResponse.json({
            success: true,
            cooldownSeconds: COOLDOWN_SECONDS,
        });
    } catch (error: any) {
        logger.error("[SDN Apply] Error applying SDN", error);

        const { ipAddress, userAgent } = getClientContext(request);
        await logAudit({
            username,
            action: "SDN_APPLY",
            resource: "sdn:cluster",
            details: { error: error.message },
            ipAddress,
            userAgent,
            status: "FAILURE",
        }).catch(() => { });

        return NextResponse.json(
            { error: `SDN Apply failed: ${error.message}` },
            { status: 500 }
        );
    }
}
