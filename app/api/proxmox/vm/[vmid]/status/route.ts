import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(req);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_VM", resource: "vm:unknown", details: { reason: "unauthorized", view: "status" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vmid } = await params;
    const rlKey = `vm-status:${session.user.username}:${vmid}:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, reason: "rate_limit", retryAfter: rl.retryAfter || 60, view: "status" }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const searchParams = req.nextUrl.searchParams;
        const node = searchParams.get("node");
        const type = searchParams.get("type") || "qemu"; // qemu or lxc

        if (!node) {
            await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, reason: "validation_failed", error: "missing_node", view: "status" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "Node parameter is required" }, { status: 400 });
        }

        // Check Access
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin);
        if (!hasAccess) {
            await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, node, reason: "permission_denied", view: "status" }, status: "FAILURE", ...client });
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // Get VM status which includes real-time metrics
        let status;
        if (type === "lxc") {
            status = await proxmox.getLXCStatus(node, vmid);
        } else {
            status = await proxmox.getVMStatus(node, vmid);
        }

        await logAudit({
            username: session.user.username,
            action: "VIEW_VM",
            resource: `vm:${vmid}`,
            details: { node, type, view: "status" },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json(status);
    } catch (error: unknown) {
        console.error("Error fetching VM status:", error);
        await logAudit({ username: session.user.username, action: "VIEW_VM", resource: `vm:${vmid}`, details: { vmid, reason: "exception", error: error instanceof Error ? error.message : "unknown_error", view: "status" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch VM status" }, { status: 500 });
    }
}
