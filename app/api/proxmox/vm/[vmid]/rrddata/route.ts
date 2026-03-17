import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(req);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_VM", resource: "vm:unknown", details: { reason: "unauthorized", dataType: "rrd" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vmid } = await params;
    const rlKey = `vm-rrd:${session.user.username}:${vmid}:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, reason: "rate_limit", retryAfter: rl.retryAfter || 60, dataType: "rrd" }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const searchParams = req.nextUrl.searchParams;
        const node = searchParams.get("node");
        const type = searchParams.get("type") || "qemu";
        const timeframe = searchParams.get("timeframe") || "hour"; // hour, day, week, month, year
        const cf = searchParams.get("cf") || "AVERAGE"; // AVERAGE or MAX

        if (!node) {
            await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, reason: "validation_failed", error: "missing_node", dataType: "rrd" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Node parameter is required" }, { status: 400 });
        }

        // Check Access
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin);
        if (!hasAccess) {
            await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, node, reason: "permission_denied", dataType: "rrd" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // Validate timeframe
        const validTimeframes = ['hour', 'day', 'week', 'month', 'year'];
        if (!validTimeframes.includes(timeframe)) {
            await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, timeframe, reason: "validation_failed", error: "invalid_timeframe", dataType: "rrd" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
        }

        // Validate cf
        const validCf = ['AVERAGE', 'MAX'];
        if (!validCf.includes(cf)) {
            await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, cf, reason: "validation_failed", error: "invalid_cf", dataType: "rrd" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Invalid cf parameter" }, { status: 400 });
        }

        // Get RRD data for performance graphs
        let rrdData;
        try {
            if (type === "lxc") {
                rrdData = await proxmox.getLXCRRDData(node, vmid, timeframe, cf);
            } else {
                rrdData = await proxmox.getVMRRDData(node, vmid, timeframe, cf);
            }
        } catch {
            await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, node, timeframe, cf, reason: "data_unavailable", dataType: "rrd" }, status: "FAILURE", ...client });
            // console.warn(`[RRD] Failed to fetch data for ${vmid} (${timeframe}): ${e.message}`);
            // Return empty array to prevent client error, assuming data unavailable
            return NextResponse.json([]);
        }

        logAudit({
            username: session.user!.username,
            action: "VIEW_VM",
            resource: `vm:${vmid}`,
            details: { node, timeframe, cf, dataType: "rrd" },
            status: "SUCCESS",
            ...client,
        }).catch(() => { }); // Fire-and-forget to avoid latency

        return NextResponse.json(rrdData);
    } catch (error: unknown) {
        console.error("Error processing RRD request:", error);
        await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, reason: "exception", error: error instanceof Error ? error.message : "unknown_error", dataType: "rrd" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
