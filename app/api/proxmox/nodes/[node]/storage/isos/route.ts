import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getClientContext, logAudit } from "@/lib/audit";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

type NodeStorage = {
    storage?: string;
    content?: string;
};

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ node: string }> }
) {
    const params = await props.params;
    const { node } = params;

    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    const client = getClientContext(request);
    if (!session.user?.isLoggedIn) {
        await logAudit({ username: "anonymous", action: "LIST_ISOS", resource: `node:${node}`, details: { node, reason: "unauthorized" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rlKey = `node-isos:${session.user.username}:${node}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        await logAudit({ username: session.user.username, action: "LIST_ISOS", resource: `node:${node}`, details: { node, reason: "rate_limit", retryAfter: rl.retryAfter || 60 }, status: "FAILURE", ...client });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }



    if (!node) {
        await logAudit({ username: session.user.username, action: "LIST_ISOS", resource: "node:unknown", details: { reason: "validation_failed", error: "missing_node" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Node is required" }, { status: 400 });
    }

    try {
        // 1. Get all storage available on this node
        const nodeStorage = await proxmox.getNodeStorage(node);

        // 2. Filter for storages that support 'iso' content
        const isoStorages = (nodeStorage as NodeStorage[]).filter(
            (s): s is { storage: string; content: string } =>
                typeof s.storage === "string" && typeof s.content === "string" && s.content.includes('iso')
        );

        // 3. For each storage, fetch the actual ISO content
        const results = await Promise.all(isoStorages.map(async (s) => {
            try {
                const isos = await proxmox.getStorageContent(node, s.storage, 'iso');
                return {
                    storage: s.storage,
                    isos: isos || []
                };
            } catch (err) {
                console.warn(`Failed to fetch ISOs for storage ${s.storage}:`, err);
                return {
                    storage: s.storage,
                    isos: [],
                    error: "Failed to fetch content"
                };
            }
        }));

        await logAudit({
            username: session.user.username,
            action: "LIST_ISOS",
            resource: `node:${node}`,
            details: { node },
            status: "SUCCESS",
            ...client,
        });

        return NextResponse.json({ data: results });

    } catch (error: unknown) {
        console.error("Fetch ISOs Error:", error);
        await logAudit({ username: session.user.username, action: "LIST_ISOS", resource: `node:${node}`, details: { node, reason: "exception", error: error instanceof Error ? error.message : "unknown_error" }, status: "FAILURE", ...client });
        return NextResponse.json({ error: "Failed to fetch ISOs" }, { status: 500 });
    }
}
