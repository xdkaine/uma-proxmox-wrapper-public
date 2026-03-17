import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_NEXT_ID", resource: "cluster:next-id", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `next-id:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_NEXT_ID", resource: "cluster:next-id", details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const nextId = await proxmox.getNextId();

        // Log the next ID for debugging
        console.log(`[Next ID] Suggesting next ID: ${nextId}`);

        await logAudit({
            username: session.user!.username,
            action: "VIEW_NEXT_ID",
            resource: "cluster:next-id",
            details: { nextId },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json({ nextId });

    } catch (error: any) {
        console.error("Fetch Next ID Error:", error);
        await logAudit({ username: session.user!.username, action: "VIEW_NEXT_ID", resource: "cluster:next-id", details: { reason: "exception", message: error?.message || "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch next ID" }, { status: 500 });
    }
}
