
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

export async function GET(
    request: Request,
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

    // Check Access
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        const snapshots = await proxmox.getSnapshots(node, vmid);

        await logAudit({
            username: session.user.username,
            action: "VIEW_SNAPSHOTS",
            resource: `vm:${vmid}`,
            details: { node },
            status: "SUCCESS"
        });

        return NextResponse.json(snapshots);
    } catch (error: unknown) {
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VIEW_SNAPSHOTS",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { node, error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to fetch snapshots" },
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

    const rlKey = `vm_snapshot:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_SNAPSHOT);
    if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    const { vmid } = await params;
    const body = await request.json();
    const { node, snapname, description, vmstate } = body;

    if (!node || !snapname) {
        return NextResponse.json({ error: "Node and Snapshot Name are required" }, { status: 400 });
    }

    // Check Access
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        await proxmox.createSnapshot(node, vmid, snapname, description, vmstate);

        await logAudit({
            username: session.user.username,
            action: "VM_SNAPSHOT_CREATE",
            resource: `vm:${vmid}`,
            details: { node, snapname, description, vmstate },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_SNAPSHOT_CREATE",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { node, snapname, error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to create snapshot" },
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

    const rlKey = `vm_snapshot:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_SNAPSHOT);
    if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    const { vmid } = await params;
    const { searchParams } = new URL(request.url);
    const node = searchParams.get("node");
    const snapname = searchParams.get("snapname");

    if (!node || !snapname) {
        return NextResponse.json({ error: "Node and Snapshot Name are required" }, { status: 400 });
    }

    // Check Access
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
    if (!hasAccess) {
        return NextResponse.json({ error: "permission_denied" }, { status: 403 });
    }

    try {
        await proxmox.deleteSnapshot(node, vmid, snapname);

        await logAudit({
            username: session.user.username,
            action: "VM_SNAPSHOT_DELETE",
            resource: `vm:${vmid}`,
            details: { node, snapname },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_SNAPSHOT_DELETE",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { node, snapname, error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json(
            { error: "Failed to delete snapshot" },
            { status: 500 }
        );
    }
}
