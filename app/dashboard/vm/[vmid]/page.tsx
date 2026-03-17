
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { proxmox } from "@/lib/proxmox-api";
import { checkVMAccess } from "@/lib/acl";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VMDetailsView } from "@/components/vm/vm-details-view";

interface PageProps {
    params: Promise<{ vmid: string }>;
}

export default async function VMDetailsPage({ params }: PageProps) {
    const { vmid } = await params;
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.user?.isLoggedIn) {
        redirect("/login");
    }

    // --- ACL Check ---
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid);
    if (!hasAccess) {
        return (
            <div className="p-8 max-w-7xl mx-auto text-center">
                <div className="mb-4">
                    <Button variant="ghost" asChild>
                        <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
                    </Button>
                </div>
                <div className="bg-destructive/10 text-destructive p-4 rounded-md inline-block">
                    <h2 className="text-lg font-bold mb-2">Access Denied</h2>
                    <p>You do not have permission to view Virtual Machine {vmid}.</p>
                </div>
            </div>
        );
    }

    // Fetch resources to find the VM
    let vmResource = null;
    try {
        const resources = await proxmox.getResources();
        // Look for qemu (VM) or lxc (Container) with this ID
        // Note: vmid in resources is a number, params.vmid is string
        vmResource = resources.find(r =>
            (r.type === 'qemu' || r.type === 'lxc') && String(r.vmid) === vmid
        );

        if (!vmResource) {
            // It might happen if it's a storage ID purely numerical, but unlikely for pools member list
        }

    } catch (e) {
        console.error("Failed to fetch cluster resources", e);
    }

    if (!vmResource) {
        return (
            <div className="p-8 max-w-7xl mx-auto">
                <div className="mb-4">
                    <Button variant="ghost" asChild>
                        <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
                    </Button>
                </div>
                <div className="text-destructive">
                    VM {vmid} not found or access denied.
                </div>
            </div>
        );
    }

    return (
        <VMDetailsView
            vmid={vmid}
            node={vmResource.node}
            vmResource={vmResource}
        />
    );
}
