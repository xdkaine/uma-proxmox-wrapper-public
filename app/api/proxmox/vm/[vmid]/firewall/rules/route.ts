
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { checkVMAccess } from "@/lib/acl";
import { logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

type FirewallRuleRecord = Record<string, unknown>;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ vmid: string }> }
) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vmid } = await params;
    const { searchParams } = new URL(request.url);
    const node = searchParams.get("node");

    if (!node) {
        return NextResponse.json({ error: "Node parameter is required" }, { status: 400 });
    }

    const rlKey = `vm-firewall:${session.user.username}:${vmid}:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    // Check Access
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        const rules = await proxmox.getFirewallRules(node, vmid);
        return NextResponse.json(rules);
    } catch {
        return NextResponse.json(
            { error: "Failed to fetch firewall rules" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ vmid: string }> }
) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { vmid } = await params;
    const body = await request.json();
    const { node, ...rawRule } = body;

    if (!node) {
        return NextResponse.json({ error: "Node is required" }, { status: 400 });
    }

    // Allowlist firewall rule fields to prevent mass assignment
    const ALLOWED_RULE_KEYS = new Set([
        'type', 'action', 'enable', 'comment', 'source', 'dest',
        'sport', 'dport', 'proto', 'macro', 'iface', 'log', 'pos',
    ]);
    const rule: FirewallRuleRecord = {};
    for (const key of Object.keys(rawRule)) {
        if (ALLOWED_RULE_KEYS.has(key)) {
            rule[key] = rawRule[key];
        }
    }

    // Check Access
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        await proxmox.addFirewallRule(node, vmid, rule);

        await logAudit({
            username: session.user.username,
            action: "VM_FIREWALL_UPDATE",
            resource: `vm:${vmid}`,
            details: { action: 'add', node, rule },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_FIREWALL_UPDATE",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { action: 'add', error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to add firewall rule" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ vmid: string }> }
) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { vmid } = await params;
    const { searchParams } = new URL(request.url);
    const node = searchParams.get("node");
    const pos = searchParams.get("pos");

    if (!node || !pos) {
        return NextResponse.json({ error: "Node and Rule Position are required" }, { status: 400 });
    }

    // Check Access
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        await proxmox.deleteFirewallRule(node, vmid, parseInt(pos));

        await logAudit({
            username: session.user.username,
            action: "VM_FIREWALL_UPDATE",
            resource: `vm:${vmid}`,
            details: { action: 'delete', node, pos },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_FIREWALL_UPDATE",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { action: 'delete', error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to delete firewall rule" },
            { status: 500 }
        );
    }
}
