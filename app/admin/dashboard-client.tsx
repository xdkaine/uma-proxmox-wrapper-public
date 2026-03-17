'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Server,
    Database,
    Network,
    Shield,
    Activity,
    Zap,
    Plus,
    RefreshCw,
    MoreVertical
} from "lucide-react";
import { NodeDetailsSheet } from "@/components/admin/node-details-sheet";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { motion } from "framer-motion";
import Link from 'next/link';

interface DashboardClientProps {
    initialNodes: any[];
}

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
});

export function DashboardClient({ initialNodes }: DashboardClientProps) {
    const { data: nodesData } = useSWR<{ data: any[] }>('/api/proxmox/resources?type=node', fetcher, {
        fallbackData: { data: initialNodes },
        refreshInterval: 5000,
    });

    const { data: poolsData } = useSWR<{ pools: any[] }>('/api/proxmox/pools', fetcher);
    const { data: vnetsData } = useSWR<{ vnets: any[] }>('/api/proxmox/sdn/vnets', fetcher);
    const { data: aclsData } = useSWR<{ acls: any[] }>('/api/proxmox/access/acl', fetcher);

    const nodes = nodesData?.data || initialNodes;
    const pools = poolsData?.pools || [];
    const vnets = vnetsData?.vnets || [];
    const acls = aclsData?.acls || [];

    const appPools = pools.filter(p => p.poolid.startsWith('DEV_'));
    const onlineNodes = nodes.filter(n => n.status === 'online').length;

    // Prepare chart data (mocked history based on current state for demo purposes)
    const chartData = nodes.map(node => ({
        name: node.node,
        cpu: node.cpu ? (node.cpu * 100).toFixed(1) : 0,
        memory: node.mem && node.maxmem ? ((node.mem / node.maxmem) * 100).toFixed(1) : 0,
    }));

    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center justify-between"
            >
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">System Overview</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Monitor and manage your Proxmox infrastructure
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </motion.div>

            {/* Stats Cards */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
            >
                {[
                    { title: "Total Nodes", value: nodes.length, sub: `${onlineNodes} online`, icon: Server, color: "text-blue-500" },
                    { title: "App Pools", value: appPools.length, sub: "Managed resources", icon: Database, color: "text-green-500" },
                    { title: "VNETs", value: vnets.length, sub: "Virtual networks", icon: Network, color: "text-purple-500" },
                    { title: "ACL Entries", value: acls.length, sub: "Active permissions", icon: Shield, color: "text-orange-500" }
                ].map((stat, i) => (
                    <Card key={i} className="shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value}</div>
                            <p className="text-xs text-muted-foreground">
                                {stat.sub}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </motion.div>

            {/* Main Content Grid */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
            >
                {/* Chart Section */}
                <Card className="md:col-span-2 xl:col-span-2 h-full">
                    <CardHeader>
                        <CardTitle>Resource Usage</CardTitle>
                        <CardDescription>
                            CPU and Memory utilization per node
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="cpu" name="CPU %" fill="var(--chart-1, #3b82f6)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="memory" name="Memory %" fill="var(--chart-2, #10b981)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                        <CardDescription>
                            Common administrative tasks
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 gap-3">
                            <Link href="/admin/pools" className="group block">
                                <div className="flex items-center p-3 border rounded-lg hover:bg-muted/50 transition-colors group-hover:border-primary/50">
                                    <div className="p-2 bg-primary/10 rounded-md mr-3 group-hover:bg-primary/20 transition-colors">
                                        <Database className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">Manage Pools</span>
                                        <span className="text-xs text-muted-foreground">Configure resource pools</span>
                                    </div>
                                </div>
                            </Link>
                            <Link href="/admin/vnets" className="group block">
                                <div className="flex items-center p-3 border rounded-lg hover:bg-muted/50 transition-colors group-hover:border-primary/50">
                                    <div className="p-2 bg-primary/10 rounded-md mr-3 group-hover:bg-primary/20 transition-colors">
                                        <Network className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">Config Network</span>
                                        <span className="text-xs text-muted-foreground">Manage VNETs and subnets</span>
                                    </div>
                                </div>
                            </Link>
                            <Link href="/admin/acls" className="group block">
                                <div className="flex items-center p-3 border rounded-lg hover:bg-muted/50 transition-colors group-hover:border-primary/50">
                                    <div className="p-2 bg-primary/10 rounded-md mr-3 group-hover:bg-primary/20 transition-colors">
                                        <Shield className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">Update ACLs</span>
                                        <span className="text-xs text-muted-foreground">Manage user permissions</span>
                                    </div>
                                </div>
                            </Link>
                            <Link href="/admin/settings" className="group block">
                                <div className="flex items-center p-3 border rounded-lg hover:bg-muted/50 transition-colors group-hover:border-primary/50">
                                    <div className="p-2 bg-primary/10 rounded-md mr-3 group-hover:bg-primary/20 transition-colors">
                                        <Zap className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">System Health</span>
                                        <span className="text-xs text-muted-foreground">View system status</span>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Nodes Table */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
            >
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Nodes Status</CardTitle>
                            <CardDescription>
                                Real-time status of all cluster nodes
                            </CardDescription>
                        </div>
                        <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Node</TableHead>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Uptime</TableHead>
                                    <TableHead>CPU Usage</TableHead>
                                    <TableHead>Memory Usage</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {nodes.map((node) => (
                                    <TableRow
                                        key={node.id}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => {
                                            setSelectedNode(node);
                                            setDetailsOpen(true);
                                        }}
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1 rounded bg-secondary">
                                                    <Server className="h-4 w-4 text-primary" />
                                                </div>
                                                {node.node}
                                            </div>
                                        </TableCell>
                                        <TableCell>{node.id}</TableCell>
                                        <TableCell className="text-muted-foreground">{node.uptime ? Math.floor(node.uptime / 3600 / 24) + 'd ' + Math.floor((node.uptime / 3600) % 24) + 'h' : 'N/A'}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-2 rounded-full bg-secondary overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500"
                                                        style={{ width: node.cpu ? `${node.cpu * 100}%` : '0%' }}
                                                    />
                                                </div>
                                                <span className="text-xs text-muted-foreground">
                                                    {node.cpu ? `${(node.cpu * 100).toFixed(1)}%` : '0%'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-2 rounded-full bg-secondary overflow-hidden">
                                                    <div
                                                        className="h-full bg-emerald-500"
                                                        style={{ width: node.mem && node.maxmem ? `${(node.mem / node.maxmem) * 100}%` : '0%' }}
                                                    />
                                                </div>
                                                <span className="text-xs text-muted-foreground">
                                                    {node.mem && node.maxmem ? `${((node.mem / node.maxmem) * 100).toFixed(1)}%` : '0%'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={node.status === 'online' ? 'outline' : 'destructive'} className={node.status === 'online' ? 'border-green-500 text-green-500 bg-green-500/10' : ''}>
                                                {node.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </motion.div>

            <NodeDetailsSheet
                node={selectedNode}
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
            />
        </div>
    );
}
