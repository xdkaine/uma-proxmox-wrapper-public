"use client";

import { useState } from "react";
import useSWR from "swr";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Cpu, Server, Network, HardDrive } from "lucide-react";

interface VMPerformanceChartsProps {
    vmid: string;
    node: string;
    type?: string;
}

type TimeframeType = 'hour' | 'day' | 'week' | 'month' | 'year';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Format bytes to human readable
function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format percentage
function formatPercent(value: number): string {
    return (value * 100).toFixed(1) + '%';
}

// Format timestamp to readable time
function formatTime(timestamp: number, timeframe: TimeframeType): string {
    const date = new Date(timestamp * 1000);
    if (timeframe === 'hour') {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (timeframe === 'day') {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (timeframe === 'week') {
        return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}

// Custom tooltip component
function CustomTooltip({ active, payload, label, formatter }: any) {
    if (active && payload && payload.length) {
        return (
            <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                <p className="font-medium text-foreground mb-2">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-muted-foreground">{entry.name}:</span>
                        <span className="font-medium text-foreground">
                            {formatter ? formatter(entry.value) : entry.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
}

export function VMPerformanceCharts({ vmid, node, type = 'qemu' }: VMPerformanceChartsProps) {
    const [timeframe, setTimeframe] = useState<TimeframeType>('hour');

    const { data: rrdData, error, isLoading } = useSWR(
        `/api/proxmox/vm/${vmid}/rrddata?node=${node}&type=${type}&timeframe=${timeframe}&cf=AVERAGE`,
        fetcher,
        {
            refreshInterval: 30000, // Refresh every 30 seconds
            revalidateOnFocus: true,
        }
    );

    const timeframeOptions: { value: TimeframeType; label: string }[] = [
        { value: 'hour', label: 'Hour' },
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'year', label: 'Year' },
    ];

    // Transform RRD data for charts
    const chartData = Array.isArray(rrdData)
        ? rrdData
            .filter((d: any) => d.time) // Filter out entries without time
            .map((d: any) => ({
                time: formatTime(d.time, timeframe),
                timestamp: d.time,
                cpu: d.cpu || 0,
                mem: d.mem || 0,
                maxmem: d.maxmem || 0,
                memPercent: d.maxmem ? d.mem / d.maxmem : 0,
                netin: d.netin || 0,
                netout: d.netout || 0,
                diskread: d.diskread || 0,
                diskwrite: d.diskwrite || 0,
            }))
            .sort((a: any, b: any) => a.timestamp - b.timestamp)
        : [];

    if (error) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center p-10">
                    <p className="text-muted-foreground">Failed to load performance data</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            <CardTitle>Performance</CardTitle>
                        </div>
                        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                            {timeframeOptions.map((option) => (
                                <Button
                                    key={option.value}
                                    variant={timeframe === option.value ? 'default' : 'ghost'}
                                    size="sm"
                                    className="h-7 px-3"
                                    onClick={() => setTimeframe(option.value)}
                                >
                                    {option.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                    {isLoading && (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                        </div>
                    )}
                </CardHeader>
            </Card>


            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-blue-500" />
                            <CardTitle className="text-base">CPU Usage</CardTitle>
                        </div>
                        <CardDescription>Processor utilization over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px]">
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis
                                            dataKey="time"
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground"
                                        />
                                        <YAxis
                                            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={[0, 'auto']}
                                            className="text-muted-foreground"
                                        />
                                        <Tooltip content={<CustomTooltip formatter={formatPercent} />} />
                                        <Area
                                            type="monotone"
                                            dataKey="cpu"
                                            name="CPU"
                                            stroke="#3b82f6"
                                            fill="url(#cpuGradient)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>


                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-green-500" />
                            <CardTitle className="text-base">Memory Usage</CardTitle>
                        </div>
                        <CardDescription>RAM utilization over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px]">
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis
                                            dataKey="time"
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground"
                                        />
                                        <YAxis
                                            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={[0, 1]}
                                            className="text-muted-foreground"
                                        />
                                        <Tooltip content={<CustomTooltip formatter={formatPercent} />} />
                                        <Area
                                            type="monotone"
                                            dataKey="memPercent"
                                            name="Memory"
                                            stroke="#22c55e"
                                            fill="url(#memGradient)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>


                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <Network className="h-4 w-4 text-purple-500" />
                            <CardTitle className="text-base">Network Traffic</CardTitle>
                        </div>
                        <CardDescription>Inbound and outbound traffic</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px]">
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="netinGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="netoutGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis
                                            dataKey="time"
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground"
                                        />
                                        <YAxis
                                            tickFormatter={formatBytes}
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground"
                                        />
                                        <Tooltip content={<CustomTooltip formatter={formatBytes} />} />
                                        <Legend />
                                        <Area
                                            type="monotone"
                                            dataKey="netin"
                                            name="In"
                                            stroke="#a855f7"
                                            fill="url(#netinGradient)"
                                            strokeWidth={2}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="netout"
                                            name="Out"
                                            stroke="#f97316"
                                            fill="url(#netoutGradient)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>


                <Card>
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4 text-orange-500" />
                            <CardTitle className="text-base">Disk I/O</CardTitle>
                        </div>
                        <CardDescription>Read and write operations</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px]">
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="diskreadGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="diskwriteGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis
                                            dataKey="time"
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground"
                                        />
                                        <YAxis
                                            tickFormatter={formatBytes}
                                            tick={{ fontSize: 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground"
                                        />
                                        <Tooltip content={<CustomTooltip formatter={formatBytes} />} />
                                        <Legend />
                                        <Area
                                            type="monotone"
                                            dataKey="diskread"
                                            name="Read"
                                            stroke="#06b6d4"
                                            fill="url(#diskreadGradient)"
                                            strokeWidth={2}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="diskwrite"
                                            name="Write"
                                            stroke="#ec4899"
                                            fill="url(#diskwriteGradient)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
