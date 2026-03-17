"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Activity, Cpu, HardDrive, Terminal } from "lucide-react";
import { VMOptions } from "./vm-options";
import { VMHardware } from "./vm-hardware";
import { VMSummary } from "./vm-summary";
import { VMConsole } from "./vm-console";
import { VMCloudInit } from "./vm-cloud-init";
import { VMTasks } from "./vm-tasks";
import { VMSnapshots } from "./vm-snapshots";
import { VMBackup } from "./vm-backup";
import { VMFirewall } from "./vm-firewall";
import { VMReplication } from "./vm-replication";
import { VMPermissions } from "./vm-permissions";

interface VMDetailsViewProps {
    vmid: string;
    node: string;
    vmResource: any; // Type strictly later
}

export function VMDetailsView({ vmid, node, vmResource }: VMDetailsViewProps) {
    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-6">
                <Button variant="ghost" asChild className="mb-4">
                    <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
                </Button>

                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">{vmResource.name}</h1>
                    <Badge variant={vmResource.status === 'running' ? 'default' : 'secondary'}>
                        {vmResource.status}
                    </Badge>
                    {vmResource.type === 'lxc' && <Badge variant="outline">Container</Badge>}
                </div>
                <p className="text-muted-foreground mt-1">ID: {vmid} • Node: {node}</p>
            </div>

            <Tabs defaultValue="summary" className="space-y-4">
                <TabsList>
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

                <TabsContent value="summary" className="space-y-4">
                    <VMSummary vmid={vmid} node={node} initialData={vmResource} />
                </TabsContent>

                <TabsContent value="console">
                    <VMConsole vmid={vmid} node={node} type={vmResource.type} />
                </TabsContent>

                <TabsContent value="hardware">
                    <VMHardware vmid={vmid} node={node} />
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
