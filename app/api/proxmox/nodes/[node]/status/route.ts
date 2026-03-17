
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ node: string }> }) {
    const response = new NextResponse();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_NODE", resource: "node:unknown", details: { reason: "unauthorized", type: "status" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { node } = await params;
    const rlKey = `node-status:${session.user.username}:${node}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_NODE", resource: `node:${node}`, details: { node, type: "status", reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        // --- Access Control ---
        // Only Admins or PVEAdmins should arguably see deep hardware stats.
        // However, standard users might need to see basics if they have VMs on it?
        // For now, let's restrict to Admins or if we can verify user has SOME access.
        // But "Detailed Node Overview" is an admin feature.

        const username = session.user.username;
        const userGroups = session.user.groups || [];
        const acls = await proxmox.getACLs();

        const isAdmin = session.user.isAdmin || acls.some(acl =>
            acl.path === '/' &&
            ['Administrator', 'PVEAdmin'].includes(acl.roleid) &&
            (
                (acl.type === 'user' && (acl.ugid === username || acl.ugid.startsWith(`${username}@`))) ||
                (acl.type === 'group' && userGroups.includes(acl.ugid))
            )
        );

        if (!isAdmin) {
            await logAudit({ username: session.user.username, action: "VIEW_NODE", resource: `node:${node}`, details: { node, type: "status", reason: "permission_denied" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const status = await proxmox.getNodeStatus(node);

        await logAudit({
            username: session.user.username,
            action: "VIEW_NODE",
            resource: `node:${node}`,
            details: { node, type: "status" },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json({ status });

    } catch (error: unknown) {
        console.error("Error fetching node status:", error);
        await logAudit({ username: session.user?.username || "unknown", action: "VIEW_NODE", resource: `node:${node}`, details: { node, type: "status", reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch node status" }, { status: 500 });
    }
}
