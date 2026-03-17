import { NextRequest, NextResponse } from "next/server";
import { proxmox } from "@/lib/proxmox-api";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { checkPoolAccess, checkVMAccess } from "@/lib/acl";
import { checkPoolLimits } from "@/lib/limits";
import { getClientContext, logAudit } from "@/lib/audit";
import { validateCSRFToken } from "@/lib/csrf";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "VM_CREATE",
            resource: "vm:clone",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(request, session.csrfToken)) {
        await logAudit({
            username: session.user.username,
            action: "VM_CREATE",
            resource: "vm:clone",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "invalid_csrf" },
        });
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `vm_clone:${getRateLimitIdentifier(request)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_CLONE);
    if (!rl.allowed) {
        await logAudit({
            username: session.user.username,
            action: "VM_CREATE",
            resource: "vm:clone",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "rate_limited", retryAfter: rl.retryAfter },
        });
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    try {
        const body = await request.json();
        let { sourceVmId, newVmId, name, poolId, fullClone, storage, target } = body;

        if (!sourceVmId || !poolId || !target) {
            await logAudit({
                username: session.user.username,
                action: "VM_CREATE",
                resource: "vm:clone",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "missing_required_fields", sourceVmId, poolId, target },
            });
            return NextResponse.json({ error: "Missing required fields (Source, Pool, Target Node)" }, { status: 400 });
        }

        // Auto-assign New VMID if not provided
        if (!newVmId) {
            newVmId = await proxmox.getNextId();
        }

        // --- Security Checks ---

        // 1. Target Pool Access Check
        // User must have 'allowManage' on the target pool to create new VMs there.
        const poolAccess = await checkPoolAccess(session.user.username, session.user.groups || [], poolId);
        if (!poolAccess.allowManage) {
            await logAudit({
                username: session.user.username,
                action: "VM_CREATE",
                resource: `pool:${poolId}`,
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "pool_manage_denied", poolId },
            });
            return NextResponse.json({ error: "permission_denied - Cannot create VMs in this pool" }, { status: 403 });
        }

        // 2. Source VM Access Check
        // User must have read access to the source VM OR it must be a public Template.
        // We defer to the specific template check logic below for standard templates,
        // but generally we should check ACLs first.

        // Check if user has access to the source ID directly
        const canAccessSource = await checkVMAccess(session.user.username, session.user.groups || [], sourceVmId, session.user.isAdmin);

        // Note: The original code had a specific check for ID 4000-4099. We should preserve that whitelist 
        // as "public templates" if that's the business rule, OR rely on checkVMAccess returning true 
        // if those templates are properly shared via ACLs. 
        // Assuming we rely on checkVMAccess primarily, but for "Templates" pool we might need special handling 
        // if they are globally readable without explicit ACLs.
        // Let's rely on isValidTemplate logic + checkVMAccess.
        // Actually, if it's a valid template, maybe we allow it even if no explicit ACL? 
        // Let's enforce checkVMAccess for now. If public templates need access, they should have a group ACL.

        // HOWEVER, the previous code had:
        // const isValidTemplate = sourceVm.pool === "Templates" || (vmid >= 4000 && vmid <= 4099);
        // We should allow access if it IS a valid template (whitelisted) OR if they have explicit access.

        // Let's do the resource lookup first to confirm it exists, then check permissions.

        // 1. Find the node for the source VM
        const resources = await proxmox.getResources('vm');
        const sourceVm = resources.find((r: any) => r.vmid.toString() === sourceVmId.toString());

        if (!sourceVm) {
            await logAudit({
                username: session.user.username,
                action: "VM_CREATE",
                resource: "vm:clone",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "source_vm_not_found", sourceVmId },
            });
            return NextResponse.json({ error: "Source VM not found" }, { status: 404 });
        }

        // 3. Validate Source (Existence & Permission Details)
        const vmid = parseInt(sourceVm.vmid, 10);
        const isPublicTemplate = sourceVm.pool === "Templates" || (vmid >= 4000 && vmid <= 4099);

        // Access Rule:
        // 1. Public templates (in "Templates" pool or VMID 4000-4099) → any user can clone
        // 2. User owns/has access to the source VM → allowed to clone
        // 3. Otherwise → deny
        if (!isPublicTemplate && !canAccessSource) {
            await logAudit({
                username: session.user.username,
                action: "VM_CREATE",
                resource: `vm:${sourceVmId}`,
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "source_access_denied", sourceVmId },
            });
            return NextResponse.json({ error: "permission_denied - Cannot access source VM" }, { status: 403 });
        }

        const node = sourceVm.node;

        // 4. Check Pool Cap (global cap applied per pool)
        await checkPoolLimits(poolId, 'qemu');

        // 2. Clone the VM
        // Proxmox API returns the UPID (Task ID) string for async actions
        const upid = await proxmox.cloneVM(node, sourceVmId, newVmId, name, poolId, fullClone, storage, target);

        await logAudit({
            username: session.user.username,
            action: "VM_CREATE",
            resource: `vm:${newVmId}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { sourceVmId, name, poolId, fullClone, targetNode: target, upid },
            status: "SUCCESS"
        });

        return NextResponse.json({ success: true, upid });

    } catch (error: any) {
        console.error("Clone VM Error:", error);
        await logAudit({
            username: session.user?.username || "unknown",
            action: "VM_CREATE",
            resource: "vm:clone",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error?.message || "unknown_error" },
        });
        return NextResponse.json({ error: "Failed to clone VM" }, { status: 500 });
    }
}
