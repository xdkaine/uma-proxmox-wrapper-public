import { NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

type ProxmoxNode = {
    node?: string;
    status?: string;
    cpu?: number;
    maxcpu?: number;
    mem?: number;
    maxmem?: number;
    uptime?: number;
    disk?: number;
    maxdisk?: number;
};

export async function GET(request: NextRequest) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_NODE", resource: "cluster:nodes", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `proxmox-nodes:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_NODE", resource: "cluster:nodes", details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const nodes = await proxmox.getNodes();

        // Map to simpler format
        const nodeList = (nodes as ProxmoxNode[]).map((n) => ({
            node: n.node,
            status: n.status,
            cpu: n.cpu,
            maxcpu: n.maxcpu,
            mem: n.mem,
            maxmem: n.maxmem,
            uptime: n.uptime,
            disk: n.disk,
            maxdisk: n.maxdisk
        }));

        await logAudit({
            username: session.user!.username,
            action: "VIEW_NODE",
            resource: "cluster:nodes",
            details: {},
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json(nodeList);

    } catch (error: unknown) {
        console.error("Fetch Nodes Error:", error);
        await logAudit({ username: session.user!.username, action: "VIEW_NODE", resource: "cluster:nodes", details: { reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch nodes" }, { status: 500 });
    }
}
