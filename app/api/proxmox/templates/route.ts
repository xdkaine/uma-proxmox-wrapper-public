import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { getClientContext, logAudit } from "@/lib/audit";
import { cookies } from "next/headers";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

type ProxmoxTemplateResource = {
    vmid?: string | number;
    name?: string;
    node?: string;
    pool?: string;
    status?: string;
};

export async function GET(request: NextRequest) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_TEMPLATES", resource: "cluster:templates", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `proxmox-templates:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_TEMPLATES", resource: "cluster:templates", details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const resources = await proxmox.getResources('vm');

        const templates = (resources as ProxmoxTemplateResource[]).filter((vm) => {
            const vmid = parseInt(String(vm.vmid), 10);

            // Allow if in "Templates" pool
            if (vm.pool === "Templates") return true;

            // Allow if ID is between 4000 and 4099
            if (vmid >= 4000 && vmid <= 4099) return true;

            return false;
        }).map((vm) => ({
            vmid: vm.vmid,
            name: vm.name,
            node: vm.node,
            pool: vm.pool,
            status: vm.status
        }));

        logAudit({
            username: session.user!.username,
            action: "VIEW_TEMPLATES",
            resource: "cluster:templates",
            details: {},
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json(templates);

    } catch (error: unknown) {
        console.error("Fetch Templates Error:", error);
        await logAudit({ username: session.user!.username, action: "VIEW_TEMPLATES", resource: "cluster:templates", details: { reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
    }
}
