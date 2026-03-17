
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { checkVMAccess } from "@/lib/acl";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ node: string }> }
) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(request);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_TASKS", resource: "node:unknown:tasks", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { node } = await params;
    const { searchParams } = new URL(request.url);
    const vmid = searchParams.get("vmid") || undefined;
    const requestedLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;

    const rlKey = `node-tasks:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_TASKS", resource: `node:${node}:tasks`, details: { node, vmid, limit, reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    // Access check: if vmid provided, check VM access; otherwise admin-only
    if (vmid) {
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin);
        if (!hasAccess) {
            await logAudit({ username: session.user.username, action: "VIEW_TASKS", resource: `node:${node}:tasks`, details: { node, vmid, reason: "permission_denied" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }
    } else {
        if (!session.user.isAdmin) {
            await logAudit({ username: session.user.username, action: "VIEW_TASKS", resource: `node:${node}:tasks`, details: { node, reason: "permission_denied" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }
    }

    try {
        const tasks = await proxmox.getNodeTasks(node, vmid, limit);

        logAudit({
            username: session.user!.username,
            action: "VIEW_TASKS",
            resource: `node:${node}:tasks`,
            details: { node, vmid, limit },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json(tasks);
    } catch (error: unknown) {
        console.error("Error fetching tasks:", error);
        await logAudit({ username: session.user!.username, action: "VIEW_TASKS", resource: `node:${node}:tasks`, details: { node, vmid, limit, reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Failed to fetch tasks" },
            { status: 500 }
        );
    }
}
