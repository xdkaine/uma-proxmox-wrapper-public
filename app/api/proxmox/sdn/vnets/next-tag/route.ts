import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

// Input validation schema
const querySchema = z.object({
    zone: z.string()
        .min(1, 'Zone is required')
        .max(50, 'Zone name too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Zone name contains invalid characters'),
});

export async function GET(request: NextRequest) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_NEXT_TAG", resource: "sdn:vnets", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `vnet-next-tag:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_NEXT_TAG", resource: "sdn:vnets", details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const zone = searchParams.get('zone');

        // Validate input
        const validationResult = querySchema.safeParse({ zone });
        if (!validationResult.success) {
            await logAudit({ username: session.user.username, action: "VIEW_NEXT_TAG", resource: "sdn:vnets", details: { zone, reason: "validation_failed", errors: validationResult.error.flatten().fieldErrors }, status: "FAILURE", ...client });
            return NextResponse.json({
                error: "Invalid input",
                details: validationResult.error.flatten().fieldErrors
            }, { status: 400 });
        }

        const zoneName = validationResult.data.zone;
        const username = session.user.username;

        // Fetch all VNETs (server-side only - not exposed to client)
        const allVnets = await proxmox.getVnets();

        // Calculate next available tag for this zone
        const zoneVnets = allVnets.filter(v => v.zone === zoneName);

        let nextTag: number;

        if (zoneName.toLowerCase().includes('userlab')) {
            // Userlabs specific logic: range 1001-1255
            const usedTags = new Set(zoneVnets.map(v => v.tag).filter((t): t is number => t !== undefined));

            // Find first available tag in range
            let foundTag = -1;
            for (let i = 1001; i <= 1255; i++) {
                if (!usedTags.has(i)) {
                    foundTag = i;
                    break;
                }
            }

            if (foundTag === -1) {
                await logAudit({ username: session.user.username, action: "VIEW_NEXT_TAG", resource: "sdn:vnets", details: { zone: zoneName, reason: "capacity_exhausted" }, status: "FAILURE", ...client });
                return NextResponse.json({
                    error: "No available VNET IDs in Userlabs range (1001-1255)"
                }, { status: 400 });
            }

            nextTag = foundTag;
        } else {
            // Default logic: max + 1
            const maxTag = zoneVnets.reduce((max, v) => (v.tag ? Math.max(max, v.tag) : max), 0);
            nextTag = maxTag + 1;
        }

        // Calculate suggested VNET name (same logic as client-side was using)
        const existingVnetNames = new Set(allVnets.map(v => v.vnet.toLowerCase()));
        const userPart = username.slice(0, 4);
        const base7 = `DEV${userPart}`;

        let suggestedName = `${base7}1`;
        let counter = 1;

        while (counter <= 99) {
            let proposedName: string;

            if (counter < 10) {
                proposedName = `${base7}${counter}`;
            } else {
                const base6 = `DEV${username.slice(0, 3)}`;
                proposedName = `${base6}${counter}`;
            }

            if (!existingVnetNames.has(proposedName.toLowerCase())) {
                suggestedName = proposedName;
                break;
            }

            counter++;
        }



        logAudit({
            username: session.user.username,
            action: "VIEW_NEXT_TAG",
            resource: "sdn:vnets",
            details: { zone: zoneName, nextTag, suggestedName },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json({
            nextTag,
            suggestedName
        });

    } catch (error: any) {
        logger.error("Error calculating next VNET tag", error);
        await logAudit({ username: session.user?.username || "unknown", action: "VIEW_NEXT_TAG", resource: "sdn:vnets", details: { reason: "exception", message: error?.message || "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to calculate next tag" }, { status: 500 });
    }
}
