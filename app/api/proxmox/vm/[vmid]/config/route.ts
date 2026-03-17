
import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

type VMConfigRecord = Record<string, unknown>;

export async function GET(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { vmid } = await params;
        const searchParams = req.nextUrl.searchParams;
        const node = searchParams.get("node");

        if (!node) {
            return NextResponse.json({ error: "Node parameter is required" }, { status: 400 });
        }

        // Check Access
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
        if (!hasAccess) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }



        const config = await proxmox.getVMConfig(node, vmid);

        await logAudit({
            username: session.user.username,
            action: "VIEW_VM",
            resource: `vm:${vmid}`,
            details: { node, view: "config" },
            status: "SUCCESS"
        });

        return NextResponse.json(config);
    } catch (error: unknown) {
        console.error("Error fetching VM config:", error);
        return NextResponse.json({ error: "Failed to fetch VM config" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `vm_config:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_CONFIG);
    if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    // TODO: Add refined permission check here to ensure user can edit this VM
    // For now assuming existing session validation + RBAC at method level is sufficient foundation

    try {
        const { vmid } = await params;
        const body = await req.json();
        const { node, ...rawOptions } = body;

        if (!node) {
            return NextResponse.json({ error: "Node is required in body" }, { status: 400 });
        }

        // Check Access
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
        if (!hasAccess) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // Allowlist of safe VM config keys to prevent mass assignment
        const ALLOWED_CONFIG_KEYS = new Set([
            'name', 'description', 'tags', 'onboot', 'protection',
            'cores', 'sockets', 'vcpus', 'cpu', 'cpulimit', 'cpuunits',
            'memory', 'balloon', 'shares',
            'boot', 'bootdisk',
            'net0', 'net1', 'net2', 'net3',
            'scsi0', 'scsi1', 'scsi2', 'scsi3',
            'virtio0', 'virtio1', 'virtio2', 'virtio3',
            'ide0', 'ide1', 'ide2', 'ide3',
            'sata0', 'sata1', 'sata2', 'sata3',
            'cdrom', 'ostype', 'agent', 'vga',
            'serial0', 'serial1',
            'tablet', 'hotplug',
        ]);

        const options: VMConfigRecord = {};
        for (const key of Object.keys(rawOptions)) {
            if (ALLOWED_CONFIG_KEYS.has(key)) {
                options[key] = rawOptions[key];
            }
        }

        if (Object.keys(options).length === 0) {
            return NextResponse.json({ error: "No valid configuration keys provided" }, { status: 400 });
        }

        // Fetch current config for diffing
        let currentConfig: VMConfigRecord = {};
        try {
            currentConfig = await proxmox.getVMConfig(node, vmid);
        } catch {
            console.warn("Failed to fetch pre-update config for audit diff");
        }

        await proxmox.updateVMConfig(node, vmid, options);

        // Calculate Diff
        const diff: Record<string, { old: unknown, new: unknown }> = {};
        for (const key of Object.keys(options)) {
            // Only add to diff if value changed
            // Note: Proxmox returns strings usually, ensure loose comparison logic if needed
            // Use abstract equality to handle number/string mismatches (e.g. 2048 vs "2048")
            if (currentConfig[key] != options[key]) {
                diff[key] = {
                    old: currentConfig[key],
                    new: options[key]
                };
            }
        }

        await logAudit({
            username: session.user.username,
            action: "VM_UPDATE",
            resource: `vm:${vmid}`,
            details: { node, updates: options, diff },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("Error updating VM config:", error);
        const { vmid } = await params;
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_UPDATE",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to update VM config" }, { status: 500 });
    }
}
