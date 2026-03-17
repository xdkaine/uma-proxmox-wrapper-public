import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

type ProxmoxStorageResource = {
    id?: string;
    storage?: string;
    content?: string;
    type?: string;
    free?: number;
    total?: number;
    enable?: number;
    status?: string;
    node?: string;
    shared?: number;
};

export async function GET(request: NextRequest) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(request);

    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "VIEW_STORAGE", resource: "storage:list", details: { reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `proxmox-storage:${session.user.username}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "VIEW_STORAGE", resource: "storage:list", details: { reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const targetNode = searchParams.get('node');

        const resources = await proxmox.getResources('storage');

        const validStorage = [];

        for (const s of resources as ProxmoxStorageResource[]) {
            // 1. Must support 'images' 
            if (!s.content || !s.content.includes('images')) continue;

            // 2. Filter out 'local'
            if (s.storage === 'local') continue;

            validStorage.push(s);
        }

        const storageList = validStorage.map((s) => ({
            id: s.id,
            storage: s.storage,
            content: s.content,
            type: s.type,
            free: ((s as any).maxdisk && (s as any).disk) ? ((s as any).maxdisk - (s as any).disk) : (s.free || 0),
            total: (s as any).maxdisk || s.total || 0,
            enable: s.enable,
            status: s.status,
            node: s.node,
            shared: s.shared
        }));

        const responsePayload = storageList;

        logAudit({
            username: session.user.username,
            action: "VIEW_STORAGE",
            resource: "storage:list",
            details: { targetNode, storageCount: responsePayload.length },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json(responsePayload);

    } catch (error: unknown) {
        console.error("Fetch Storage Error:", error);
        await logAudit({ username: session.user.username, action: "VIEW_STORAGE", resource: "storage:list", details: { reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch storage" }, { status: 500 });
    }
}
