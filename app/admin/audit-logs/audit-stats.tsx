"use client";

import { useState } from "react";
import useSWR from "swr";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AuditLogDetail from "./audit-log-detail";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Users,
    TrendingUp,
    Shield,
    XCircle,
    Clock,
    Loader2,
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface StatsData {
    summary: {
        totalEvents: number;
        successRate: number;
        successCount: number;
        failureCount: number;
        warningCount: number;
        failuresToday: number;
        uniqueUsers: number;
    };
    actionBreakdown: Array<{
        action: string;
        count: number;
        percentage: string;
    }>;
    recentAlerts: Array<{
        id: string;
        action: string;
        username: string;
        resource: string;
        status: string;
        createdAt: string;
    }>;
    hourlyActivity: Array<{
        hour: string;
        count: number;
    }>;
}

// Color palette for charts
const CHART_COLORS = {
    primary: "#6366f1",
    gradient: ["#6366f1", "#8b5cf6"],
    success: "#22c55e",
    failure: "#ef4444",
    warning: "#f59e0b",
    muted: "#71717a",
};

const ACTION_COLORS: Record<string, string> = {
    LOGIN: "#22c55e",
    LOGOUT: "#6366f1",
    VM_START: "#10b981",
    VM_STOP: "#ef4444",
    VM_DELETE: "#dc2626",
    VM_CREATE: "#3b82f6",
    VM_CONSOLE_OPEN: "#8b5cf6",
    DEFAULT: "#71717a",
};

export default function AuditStats() {
    const [selectedAlert, setSelectedAlert] = useState<any>(null);

    const { data, error, isLoading } = useSWR<StatsData>(
        "/api/admin/audit-logs/stats",
        fetcher,
        {
            refreshInterval: 10000,
            revalidateOnFocus: true,
        }
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                <p>Failed to load statistics</p>
            </div>
        );
    }

    const { summary, actionBreakdown, recentAlerts, hourlyActivity } = data;

    // Format hourly data for chart
    const formattedHourly = hourlyActivity.map((item) => ({
        ...item,
        label: format(new Date(item.hour), "HH:mm"),
    }));

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Events
                        </CardTitle>
                        <Activity className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">
                            {summary.totalEvents.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            All time audit logs
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Success Rate
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">
                            {summary.successRate}%
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-green-500">
                                {summary.successCount.toLocaleString()} success
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-red-500">
                                {summary.failureCount.toLocaleString()} failed
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Failures Today
                        </CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-bold ${summary.failuresToday > 0 ? "text-red-500" : "text-foreground"}`}>
                            {summary.failuresToday}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {summary.warningCount} warnings total
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Active Users
                        </CardTitle>
                        <Users className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">
                            {summary.uniqueUsers}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Last 7 days
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Activity Timeline */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Activity (Last 24 Hours)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px]">
                            {formattedHourly.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={formattedHourly}>
                                        <defs>
                                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fill: "#71717a", fontSize: 11 }}
                                            axisLine={{ stroke: "#3f3f46" }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fill: "#71717a", fontSize: 11 }}
                                            axisLine={{ stroke: "#3f3f46" }}
                                            tickLine={false}
                                            width={30}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: "hsl(var(--popover))",
                                                border: "1px solid hsl(var(--border))",
                                                borderRadius: "8px",
                                                color: "hsl(var(--popover-foreground))",
                                            }}
                                            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="count"
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            fill="url(#colorCount)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No activity data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Action Distribution */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Top Actions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px]">
                            {actionBreakdown.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={actionBreakdown.slice(0, 6)}
                                        margin={{ left: 0, right: 10 }}
                                    >
                                        <XAxis
                                            type="number"
                                            tick={{ fill: "#71717a", fontSize: 11 }}
                                            axisLine={{ stroke: "#3f3f46" }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="action"
                                            tick={{ fill: "#71717a", fontSize: 11 }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={100}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: "hsl(var(--popover))",
                                                border: "1px solid hsl(var(--border))",
                                                borderRadius: "8px",
                                                color: "hsl(var(--popover-foreground))",
                                            }}
                                            formatter={(value: number | undefined, name: string | undefined, props: any) => [
                                                `${value ?? 0} (${props.payload.percentage}%)`,
                                                "Count",
                                            ]}
                                        />
                                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                            {actionBreakdown.slice(0, 6).map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={ACTION_COLORS[entry.action] || ACTION_COLORS.DEFAULT}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No action data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Alerts */}
            {recentAlerts.length > 0 && (
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Recent Alerts
                            <Badge variant="outline" className="ml-2 text-xs border-amber-500/50 text-amber-500">
                                {recentAlerts.length} in last 24h
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {recentAlerts.map((alert) => (
                                <button
                                    key={alert.id}
                                    onClick={() => setSelectedAlert(alert)}
                                    className="w-full flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted/80 transition-all cursor-pointer text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        {alert.status === "FAILURE" ? (
                                            <XCircle className="h-5 w-5 text-red-500" />
                                        ) : (
                                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                                        )}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">
                                                    {alert.action}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-xs ${alert.status === "FAILURE"
                                                        ? "border-red-500/50 text-red-400"
                                                        : "border-amber-500/50 text-amber-400"
                                                        }`}
                                                >
                                                    {alert.status}
                                                </Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                {alert.username} • {alert.resource}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {selectedAlert && (
                <AuditLogDetail log={selectedAlert} onClose={() => setSelectedAlert(null)} />
            )}
        </div>
    );
}
