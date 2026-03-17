
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { proxmox } from "@/lib/proxmox-api";
import { checkVMAccess } from "@/lib/acl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VMSummary } from "@/components/vm/vm-summary";
import { VMHardware } from "@/components/vm/vm-hardware";
import { VMOptions } from "@/components/vm/vm-options";
import { VMConsole } from "@/components/vm/vm-console";
import { VMCloudInit } from "@/components/vm/vm-cloud-init";
import { VMTasks } from "@/components/vm/vm-tasks";
import { VMSnapshots } from "@/components/vm/vm-snapshots";
import { VMBackup } from "@/components/vm/vm-backup";
import { VMFirewall } from "@/components/vm/vm-firewall";
import { VMReplication } from "@/components/vm/vm-replication";
import { VMPermissions } from "@/components/vm/vm-permissions";


import { DeleteVMButton } from "@/components/vm/delete-vm-button";

interface AdminVMPageProps {
    params: Promise<{
        poolId: string;
        vmid: string;
    }>;
}

export default async function AdminVMPage({ params }: AdminVMPageProps) {
    const { poolId, vmid } = await params;
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        redirect("/login");
    }

    // --- ACL Check (Admin should pass, but good to keep logic consistent) ---
    const hasAccess = await checkVMAccess(session.user.username, session.user.groups || [], vmid, session.user.isAdmin);

    if (!hasAccess) {
        return (
            <div className="p-8 max-w-7xl mx-auto text-center">
                <div className="mb-4">
                    <Button variant="ghost" asChild>
                        <Link href={`/admin/pools/${poolId}`}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Pool</Link>
                    </Button>
                </div>
                <div className="bg-destructive/10 text-destructive p-4 rounded-md inline-block">
                    <h2 className="text-lg font-bold mb-2">Access Denied</h2>
                    <p>You do not have permission to view VM {vmid}.</p>
                </div>
            </div>
        );
    }

    // Fetch initial data to find the node
    let node = "";
    let vmType = "qemu";

    try {
        const resources = await proxmox.getResources('vm');
        const vmResource = resources.find((r: any) => r.vmid.toString() === vmid);
        if (vmResource) {
            node = vmResource.node;
            vmType = vmResource.type;
        } else {
            return (
                <div className="p-8">
                    <h1 className="text-2xl font-bold text-destructive">VM Not Found</h1>
                    <p>Could not locate VM {vmid} in the cluster.</p>
                    <Button variant="outline" className="mt-4" asChild>
                        <Link href={`/admin/pools/${poolId}`}>Back to Pool</Link>
                    </Button>
                </div>
            )
        }
    } catch (e) {
        console.error("Failed to fetch VM info", e);
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/pools/${poolId}`}>
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            VM {vmid} <span className="text-muted-foreground text-base font-normal">({node})</span>
                        </h1>
                    </div>
                </div>
                <DeleteVMButton vmid={vmid} node={node} type={vmType} poolId={poolId} />
            </div>

            <Tabs defaultValue="summary" className="w-full">
                <TabsList className="mb-4 flex-wrap">
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="console">Console</TabsTrigger>
                    <TabsTrigger value="hardware">Hardware</TabsTrigger>
                    <TabsTrigger value="options">Options</TabsTrigger>
                    <TabsTrigger value="cloudinit">Cloud-Init</TabsTrigger>
                    <TabsTrigger value="tasks">Task History</TabsTrigger>
                    <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
                    <TabsTrigger value="backup">Backup</TabsTrigger>
                    <TabsTrigger value="firewall">Firewall</TabsTrigger>
                    <TabsTrigger value="replication">Replication</TabsTrigger>
                    <TabsTrigger value="permissions">Permissions</TabsTrigger>
                </TabsList>

                <TabsContent value="summary">
                    <VMSummary vmid={vmid} node={node} initialData={null} type={vmType} />
                </TabsContent>

                <TabsContent value="console">
                    <VMConsole vmid={vmid} node={node} type={vmType} />
                </TabsContent>

                <TabsContent value="hardware">
                    <VMHardware vmid={vmid} node={node} adminView />
                </TabsContent>

                <TabsContent value="options">
                    <VMOptions vmid={vmid} node={node} />
                </TabsContent>

                <TabsContent value="cloudinit">
                    <VMCloudInit vmid={vmid} node={node} />
                </TabsContent>

                <TabsContent value="tasks">
                    <VMTasks vmid={vmid} node={node} />
                </TabsContent>

                <TabsContent value="snapshots">
                    <VMSnapshots vmid={vmid} node={node} />
                </TabsContent>

                <TabsContent value="backup">
                    <VMBackup vmid={vmid} node={node} />
                </TabsContent>

                <TabsContent value="firewall">
                    <VMFirewall vmid={vmid} node={node} />
                </TabsContent>

                <TabsContent value="replication">
                    <VMReplication vmid={vmid} node={node} />
                </TabsContent>

                <TabsContent value="permissions">
                    <VMPermissions vmid={vmid} node={node} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
