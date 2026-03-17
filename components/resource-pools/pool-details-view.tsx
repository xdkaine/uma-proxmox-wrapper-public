"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloneVMDialog } from "@/components/resource-pools/clone-vm-dialog";
import { CreateVMDialog } from "@/components/resource-pools/create-vm-dialog";
import { ArrowLeft, Server, HardDrive, Loader2, MoreHorizontal, Play, Square, RefreshCw, Power } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PoolDetailsProvider } from "./pool-detail-provider";
import { usePoolDetailsContext } from "./pool-detail-context";

function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds: number) {
    if (!seconds) return '-';
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatPercentage(value: number) {
    if (value === undefined || value === null) return '-';
    return (value * 100).toFixed(1) + '%';
}

interface PoolDetailsViewProps {
    poolId: string;
}

export function PoolDetailsView({ poolId }: PoolDetailsViewProps) {
    return (
        <PoolDetailsProvider poolId={poolId}>
            <PoolDetailsContent poolId={poolId} />
        </PoolDetailsProvider>
    );
}

function PoolDetailsContent({ poolId }: { poolId: string }) {
    const router = useRouter();
    const { state, actions } = usePoolDetailsContext();
    const { pool, nodes, members, isLoading, error, isOffline } = state;
    const { handlePowerAction } = actions;

    if (error && !pool) return <div className="p-8 text-destructive">Failed to load pool details</div>;
    if (pool && pool.error && !pool.pool) {
        return <div className="p-8 text-destructive">Error: {pool.error}</div>;
    }
    if (isLoading && !pool) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/dashboard">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight">Pool: {poolId}</h1>
                        {isOffline && (
                            <div className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full font-medium">
                                <Power className="h-3 w-3" />
                                <span>Offline</span>
                            </div>
                        )}
                    </div>
                    <p className="text-muted-foreground">{pool?.comment || "No description provided"}</p>
                </div>
                <div className="ml-auto flex gap-2">
                    <CreateVMDialog poolId={poolId} />
                    <CloneVMDialog poolId={poolId} />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Resources</CardTitle>
                    <CardDescription>Virtual Machines and Containers in this pool</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">ID</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Node</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>CPU</TableHead>
                                <TableHead>Memory</TableHead>
                                <TableHead>Disk</TableHead>
                                <TableHead>Uptime</TableHead>
                                <TableHead>Host CPU</TableHead>
                                <TableHead>Host Mem</TableHead>
                                <TableHead>Tags</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.length > 0 ? (
                                members.map((member: any) => (
                                    <TableRow
                                        key={`${member.type}-${member.id}`}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => {
                                            if (member.type === 'qemu' || member.type === 'lxc') {
                                                router.push(`/dashboard/vm/${member.vmid || member.id}?node=${member.node}`);
                                            }
                                        }}
                                    >
                                        <TableCell className="font-mono">
                                            {member.type === 'qemu' || member.type === 'lxc' ? (
                                                <Link
                                                    href={`/dashboard/vm/${member.vmid || member.id}?node=${member.node}`}
                                                    className="hover:underline text-primary"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {member.vmid || member.id}
                                                </Link>
                                            ) : (
                                                <span>{member.vmid || member.id}</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {member.type === 'qemu' || member.type === 'lxc' ? (
                                                    <Server className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                                                )}
                                                <span className="capitalize">{member.type}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {member.type === 'qemu' || member.type === 'lxc' ? (
                                                <Link
                                                    href={`/dashboard/vm/${member.vmid || member.id}?node=${member.node}`}
                                                    className="hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {member.name || member.storage || member.id}
                                                </Link>
                                            ) : (
                                                <span>{member.name || member.storage || member.id}</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{member.node}</TableCell>
                                        <TableCell>
                                            {member.status && (
                                                <Badge variant={member.status === 'running' ? 'default' : 'secondary'}>
                                                    {member.status}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {member.status === 'running' ? formatPercentage(member.cpu) : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {member.status === 'running' ? `${formatBytes(member.mem)} / ${formatBytes(member.maxmem)}` : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {member.status === 'running' && member.disk ? `${formatPercentage(member.disk / member.maxdisk)}` : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {member.status === 'running' ? formatUptime(member.uptime) : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const host = nodes?.find((n: any) => n.node === member.node);
                                                return host ? formatPercentage(host.cpu) : '-';
                                            })()}
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const host = nodes?.find((n: any) => n.node === member.node);
                                                return host ? `${formatPercentage(host.mem / host.maxmem)}` : '-';
                                            })()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {member.tags ? member.tags.split(',').map((tag: string) => (
                                                    <Badge key={tag} variant="outline" className="text-xs px-1 py-0">{tag}</Badge>
                                                )) : '-'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {(member.type === 'qemu' || member.type === 'lxc') && (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(String(member.vmid || member.id))}>
                                                                Copy ID
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => handlePowerAction(member.vmid || member.id, member.node, 'start')}>
                                                                <Play className="mr-2 h-4 w-4" /> Start
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handlePowerAction(member.vmid || member.id, member.node, 'shutdown')}>
                                                                <Power className="mr-2 h-4 w-4" /> Shutdown
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handlePowerAction(member.vmid || member.id, member.node, 'reboot')}>
                                                                <RefreshCw className="mr-2 h-4 w-4" /> Reboot
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => handlePowerAction(member.vmid || member.id, member.node, 'stop')} className="text-destructive">
                                                                <Square className="mr-2 h-4 w-4" /> Force Stop
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={13} className="text-center text-muted-foreground h-24">
                                        No resources found in this pool.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
