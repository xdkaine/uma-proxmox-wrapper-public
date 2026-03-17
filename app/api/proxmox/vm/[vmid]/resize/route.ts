import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkVMAccess } from "@/lib/acl";
import { logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ vmid: string }> }) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    try {
        const { vmid } = await params;
        const body = await req.json();
        const { node, disk, size } = body;

        if (!node || !disk || !size) {
            return NextResponse.json({ error: "Missing required parameters (node, disk, size)" }, { status: 400 });
        }

        // Check Access
        const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin, true);
        if (!hasAccess) {
            return NextResponse.json({ error: "permission_denied" }, { status: 403 });
        }

        // Fetch current config to find old size
        let oldSize = "unknown";
        try {
            const config = await proxmox.getVMConfig(node, vmid);
            if (config && config[disk]) {
                // Format example: "local-lvm:vm-100-disk-0,size=32G"
                // Extract size parameter
                const match = config[disk].match(/size=([^,]+)/);
                if (match) {
                    oldSize = match[1];
                }
            }
        } catch (e) {
            console.warn("Failed to fetch pre-resize config for audit diff", e);
        }

        await proxmox.resizeVMDisk(node, vmid, disk, size);

        await logAudit({
            username: session.user.username,
            action: "VM_RESIZE",
            resource: `vm:${vmid}`,
            details: {
                node,
                disk,
                diff: {
                    size: {
                        old: oldSize,
                        new: size // This handles both absolute ("40G") and incremental ("+4G")
                    }
                }
            },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("Error resizing disk:", error);
        const { vmid } = await params;
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_RESIZE",
            resource: `vm:${vmid}`,
            status: "FAILURE",
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to resize disk" }, { status: 500 });
    }
}
