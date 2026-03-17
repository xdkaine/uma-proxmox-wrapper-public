import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Parse vmid from a Proxmox UPID string.
 * UPID format: UPID:{node}:{pid}:{pstart}:{starttime}:{type}:{id}:{user}@{realm}:
 * The {id} field often contains the vmid for VM-related tasks.
 */
function parseVmidFromUpid(upid: string): string | null {
    try {
        const parts = upid.split(':');
        // parts[6] is the ID field which contains vmid for VM operations
        if (parts.length >= 7 && parts[6]) {
            const id = parts[6];
            // Check if it looks like a numeric vmid
            if (/^\d+$/.test(id)) {
                return id;
            }
        }
    } catch {
        // Failed to parse
    }
    return null;
}

type TaskLogLine = {
    n?: number;
    t?: string;
};

export async function GET(request: NextRequest) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_TASK_STATUS", resource: "task:unknown", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `task-status:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_TASK_STATUS", resource: "task:status", details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    const { searchParams } = new URL(request.url);
    const node = searchParams.get('node');
    const upid = searchParams.get('upid');

    if (!node || !upid) {
        await logAudit({ username: session.user.username, action: "VIEW_TASK_STATUS", resource: `task:${upid || "unknown"}`, details: { node, upid, reason: "validation_failed", error: "missing_node_or_upid" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Missing node or upid" }, { status: 400 });
    }

    // Access check: parse vmid from UPID and verify access
    if (!session.user.isAdmin) {
        const vmid = parseVmidFromUpid(upid);
        if (vmid) {
            const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, false);
            if (!hasAccess) {
                await logAudit({ username: session.user.username, action: "VIEW_TASK_STATUS", resource: `task:${upid}`, details: { node, upid, vmid, reason: "permission_denied" }, status: "FAILURE", ...client });
                return NextResponse.json({ error: "permission_denied" }, { status: 403 });
            }
        } else {
            // Allow access to non-VM tasks (like SDN apply) for logged-in users
            // We assume that system-level tasks that don't map to a VMID are generally safe to view status for
            // if the user has a valid UPID (which implies they triggered it or were given it).
        }
    }

    try {
        const includeLogs = searchParams.get('logs') === 'true';

        // Get status
        const statusData = await proxmox.getTaskStatus(node, upid);

        let logs: TaskLogLine[] = [];
        let progress = 0;

        // Determine if we should fetch logs (for progress parsing or explicit request)
        if (includeLogs || statusData.status === 'running' || statusData.status === 'stopped') {
            try {
                // logs is array of { n: number, t: string }
                logs = await proxmox.getTaskLog(node, upid);
            } catch (logError) {
                console.warn("Failed to fetch task logs", logError);
            }
        }

        // Calculate progress from logs if running
        if (statusData.status === 'running') {
            for (let i = logs.length - 1; i >= 0; i--) {
                const line = logs[i].t;
                const match = line?.match(/\((\d+)%\)/);
                if (match) {
                    progress = parseInt(match[1], 10);
                    break;
                }
            }
        } else if (statusData.exitstatus === 'OK') {
            progress = 100;
        }

        // Fire-and-forget audit log (non-blocking)
        logAudit({
            username: session.user!.username,
            action: "VIEW_TASK_STATUS",
            resource: `task:${upid}`,
            details: { node, upid, status: statusData.status },
            status: "SUCCESS",
            ...client,
        }).catch(err => console.error("Audit Log Error:", err));

        return NextResponse.json({
            ...statusData,
            progress,
            logs: includeLogs ? logs : undefined // Only return full logs if requested to save bandwidth
        });
    } catch (error: unknown) {
        console.error("Task Status Error:", error);
        await logAudit({ username: session.user.username, action: "VIEW_TASK_STATUS", resource: `task:${upid || "unknown"}`, details: { node, upid, reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch task status" }, { status: 500 });
    }
}
