'use client';

import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetcher } from "@/lib/fetcher";
import { NodeDetailsSheet } from "@/components/admin/node-details-sheet";
import { useState } from "react";

function formatUptime(seconds: number) {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    return result || `${minutes}m`;
}

interface ClusterResourcesProps {
    allowInteraction?: boolean;
}

export function ClusterResources({ allowInteraction = true }: ClusterResourcesProps) {
    const { data: nodes, error } = useSWR('/api/proxmox/nodes', fetcher);
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    if (error) return <div>Failed to load resources</div>;
    if (!nodes) return <div>Loading resources...</div>;

    // Proxmox API returns an array directly for /nodes
    const nodeList = Array.isArray(nodes) ? nodes : (nodes?.data || []);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {nodeList.map((node: any) => {
                const cpuPercent = (node.cpu || 0) * 100;
                const memPercent = node.maxmem ? (node.mem / node.maxmem) * 100 : 0;
                const diskPercent = node.maxdisk ? (node.disk / node.maxdisk) * 100 : 0;

                const isOnline = node.status === 'online';

                return (
                    <Card
                        key={node.node}
                        onClick={() => {
                            if (isOnline && allowInteraction) {
                                setSelectedNode(node);
                                setDetailsOpen(true);
                            }
                        }}
                        className={`overflow-hidden transition-all ${isOnline
                                ? (allowInteraction ? 'cursor-pointer hover:border-primary/50 hover:bg-muted/50' : 'cursor-default')
                                : 'opacity-70'
                            }`}
                    >
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`relative flex h-2 w-2 items-center justify-center`}>
                                        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></span>
                                        <span className={`relative inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    </span>
                                    <span className="font-medium text-sm truncate" title={node.node}>{node.node}</span>
                                </div>
                                {isOnline && (
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                        {formatUptime(node.uptime)}
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-muted-foreground">CPU</span>
                                        <span className="text-[10px] font-medium">{Math.round(cpuPercent)}%</span>
                                    </div>
                                    <Progress value={cpuPercent} className="h-1" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-muted-foreground">RAM</span>
                                        <span className="text-[10px] font-medium">{Math.round(memPercent)}%</span>
                                    </div>
                                    <Progress value={memPercent} className="h-1" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-muted-foreground">HD</span>
                                        <span className="text-[10px] font-medium">{Math.round(diskPercent)}%</span>
                                    </div>
                                    <Progress value={diskPercent} className="h-1" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}

            <NodeDetailsSheet
                node={selectedNode}
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
            />
        </div>
    );
}
