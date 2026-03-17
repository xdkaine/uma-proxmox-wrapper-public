
import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ storage: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(req);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_STORAGE", resource: "storage:unknown", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storage } = await params;
    const rlKey = `storage-content:${session.user.username}:${storage}:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_STORAGE", resource: `storage:${storage}`, details: { storage, reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    if (!session.user.isAdmin) {
        await logAudit({ username: session.user.username, action: "VIEW_STORAGE", resource: `storage:${storage}`, details: { storage, reason: "permission_denied" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        const searchParams = req.nextUrl.searchParams;
        const node = searchParams.get("node");
        const content = searchParams.get("content"); // e.g. 'iso'

        if (!node) {
            await logAudit({ username: session.user.username, action: "VIEW_STORAGE", resource: `storage:${storage}`, details: { storage, reason: "validation_failed", error: "missing_node" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Node parameter is required" }, { status: 400 });
        }

        const data = await proxmox.getStorageContent(node, storage, content || undefined);

        await logAudit({
            username: session.user.username,
            action: "VIEW_STORAGE",
            resource: `storage:${storage}`,
            details: { node, storage, content },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("Error fetching storage content:", error);
        await logAudit({ username: session.user.username, action: "VIEW_STORAGE", resource: `storage:${storage}`, details: { storage, reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch storage content" }, { status: 500 });
    }
}
