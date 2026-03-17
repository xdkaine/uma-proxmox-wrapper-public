
'use client';

import { useState, useEffect } from 'react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import useSWR from 'swr';
import { Loader2, Server, TrendingUp, Activity, HardDrive } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface NodeDetailsSheetProps {
    node: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
});

function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatUptime(seconds: number) {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    result += `${minutes}m`;
    return result;
}

export function NodeDetailsSheet({ node, open, onOpenChange }: NodeDetailsSheetProps) {
    const [timeframe, setTimeframe] = useState('hour');
    const [cf, setCf] = useState('AVERAGE');

    // Fetch detailed status
    const { data: statusData, error: statusError } = useSWR(
        node && open ? `/api/proxmox/nodes/${node.node}/status` : null,
        fetcher
    );

    // Fetch RRD data
    const { data: rrdData, isLoading: rrdLoading } = useSWR(
        node && open ? `/api/proxmox/nodes/${node.node}/rrd?timeframe=${timeframe}&cf=${cf}` : null,
        fetcher
    );

    const status = statusData?.status;
    const rrd = rrdData?.data || [];

    // Process RRD data for Recharts
    const chartData = rrd.map((point: any) => ({
        time: new Date(point.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cpu: (point.cpu || 0) * 100, // Convert to percentage
        mem: (point.mem || 0), // Bytes
        memTotal: (point.memtotal || 0), // Bytes
        load: point.loadavg || 0
    })).filter((p: any) => p.cpu !== undefined && !isNaN(p.cpu));

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[800px] sm:max-w-[900px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-2xl flex items-center gap-2">
                        <Server className="h-6 w-6" />
                        {node?.node}
                        <Badge variant={node?.status === 'online' ? 'default' : 'destructive'}>
                            {node?.status}
                        </Badge>
                    </SheetTitle>
                    <SheetDescription>
                        Detailed node statistics and performance history.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                    {/* Hardware / Key Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xl font-bold">{status ? formatUptime(status.uptime) : '-'}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">CPU Usage</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xl font-bold">
                                    {status ? `${(status.cpu * 100).toFixed(1)}%` : '-'}
                                </div>
                                <p className="text-xs text-muted-foreground">{status?.cpuinfo?.cpus} Cores</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Memory</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xl font-bold">
                                    {status ? `${((status.memory.used / status.memory.total) * 100).toFixed(1)}%` : '-'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {status ? `${formatBytes(status.memory.used)} / ${formatBytes(status.memory.total)}` : '-'}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Boot Mode</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xl font-bold">{status?.boot_info?.mode || 'Legacy'}</div>
                                <p className="text-xs text-muted-foreground">{status?.boot_info?.secureboot ? 'Secure Boot On' : 'Secure Boot Off'}</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="col-span-1 md:col-span-2">
                            <CardHeader className="p-4">
                                <CardTitle className="text-base">System Information</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                                <div className="flex justify-between border-b py-1">
                                    <span className="text-muted-foreground">CPU Model</span>
                                    <span className="font-medium text-right">{status?.cpuinfo?.model}</span>
                                </div>
                                <div className="flex justify-between border-b py-1">
                                    <span className="text-muted-foreground">Kernel Version</span>
                                    <span className="font-medium">{status?.kversion}</span>
                                </div>
                                <div className="flex justify-between border-b py-1">
                                    <span className="text-muted-foreground">PVE Manager</span>
                                    <span className="font-medium">{status?.pveversion}</span>
                                </div>
                                <div className="flex justify-between border-b py-1">
                                    <span className="text-muted-foreground">Kernel Release</span>
                                    <span className="font-medium">{status?.uname}</span>
                                </div>
                                <div className="flex justify-between border-b py-1">
                                    <span className="text-muted-foreground">Root FS</span>
                                    <span className="font-medium">
                                        {status ? `${formatBytes(status.rootfs?.used)} / ${formatBytes(status.rootfs?.total)}` : '-'}
                                    </span>
                                </div>
                                <div className="flex justify-between border-b py-1">
                                    <span className="text-muted-foreground">Swap</span>
                                    <span className="font-medium">
                                        {status ? `${formatBytes(status.swap?.used)} / ${formatBytes(status.swap?.total)}` : '-'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Graphs */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg">Performance History</CardTitle>
                            <Select value={timeframe} onValueChange={setTimeframe}>
                                <SelectTrigger className="w-[120px] h-8">
                                    <SelectValue placeholder="Timeframe" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hour">Last Hour</SelectItem>
                                    <SelectItem value="day">Last Day</SelectItem>
                                    <SelectItem value="week">Last Week</SelectItem>
                                </SelectContent>
                            </Select>
                        </CardHeader>

                        <CardContent>
                            <Tabs defaultValue="cpu" className="w-full">
                                <TabsList className="grid w-full grid-cols-3 mb-4">
                                    <TabsTrigger value="cpu">CPU Load</TabsTrigger>
                                    <TabsTrigger value="memory">Memory Usage</TabsTrigger>
                                    <TabsTrigger value="load">Load Average</TabsTrigger>
                                </TabsList>

                                {/* CPU Chart */}
                                <TabsContent value="cpu" className="h-[250px] w-full mt-0">
                                    {rrdLoading ? (
                                        <div className="h-full flex items-center justify-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData}>
                                                <defs>
                                                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis
                                                    dataKey="time"
                                                    hide={timeframe !== 'hour'}
                                                    stroke="#888888"
                                                    fontSize={12}
                                                    tickLine={false}
                                                    axisLine={false}
                                                />
                                                <YAxis
                                                    stroke="#888888"
                                                    fontSize={12}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tickFormatter={(value) => `${value}%`}
                                                />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                                                    formatter={(value: any) => [`${value.toFixed(1)}%`, 'CPU']}
                                                    labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                                                />
                                                <Area type="monotone" dataKey="cpu" stroke="#8884d8" fillOpacity={1} fill="url(#colorCpu)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    )}
                                </TabsContent>

                                {/* Memory Chart */}
                                <TabsContent value="memory" className="h-[250px] w-full mt-0">
                                    {rrdLoading ? (
                                        <div className="h-full flex items-center justify-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData}>
                                                <defs>
                                                    <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="time" hide={timeframe !== 'hour'} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis
                                                    stroke="#888888"
                                                    fontSize={12}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tickFormatter={(value) => formatBytes(value, 0)}
                                                    width={80}
                                                />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                                                    formatter={(value: any) => [formatBytes(value), 'Memory']}
                                                    labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                                                />
                                                <Area type="monotone" dataKey="mem" stroke="#82ca9d" fillOpacity={1} fill="url(#colorMem)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    )}
                                </TabsContent>

                                {/* Load Chart */}
                                <TabsContent value="load" className="h-[250px] w-full mt-0">
                                    {rrdLoading ? (
                                        <div className="h-full flex items-center justify-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData}>
                                                <defs>
                                                    <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#ffc658" stopOpacity={0.8} />
                                                        <stop offset="95%" stopColor="#ffc658" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="time" hide={timeframe !== 'hour'} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                                                    labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                                                />
                                                <Area type="monotone" dataKey="load" stroke="#ffc658" fillOpacity={1} fill="url(#colorLoad)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>
            </SheetContent>
        </Sheet>
    );
}
