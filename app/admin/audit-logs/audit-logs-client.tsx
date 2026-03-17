"use client";

import { useState, useCallback } from "react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, List, RefreshCw } from "lucide-react";
import AuditStats from "./audit-stats";
import AuditLogTable from "./audit-log-table";
import { AuditFilters } from "./audit-filters";

export default function AuditLogsClient() {
    const [activeTab, setActiveTab] = useState("dashboard");
    const [isExporting, setIsExporting] = useState(false);
    const [filters, setFilters] = useState<AuditFilters>({
        action: "",
        resource: "",
        userId: "",
        status: "",
        startDate: "",
        endDate: "",
    });

    const handleExport = useCallback(async () => {
        setIsExporting(true);
        try {
            // Build query params from filters
            const params = new URLSearchParams();
            params.set("limit", "10000"); // Export all matching logs
            if (filters.action) params.set("action", filters.action);
            if (filters.resource) params.set("resource", filters.resource);
            if (filters.userId) params.set("userId", filters.userId);
            if (filters.status) params.set("status", filters.status);
            if (filters.startDate) params.set("startDate", filters.startDate);
            if (filters.endDate) params.set("endDate", filters.endDate);

            const response = await fetch(`/api/admin/audit-logs?${params}`);
            const data = await response.json();

            if (!data.logs || data.logs.length === 0) {
                alert("No logs to export");
                return;
            }

            // Create CSV content
            const headers = [
                "Timestamp",
                "User",
                "Action",
                "Resource",
                "Status",
                "IP Address",
                "User Agent",
            ];
            const rows = data.logs.map((log: any) => [
                format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss"),
                log.username,
                log.action,
                log.resource,
                log.status,
                log.ipAddress || "",
                log.userAgent || "",
            ]);

            const csvContent = [
                headers.join(","),
                ...rows.map((row: string[]) =>
                    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
                ),
            ].join("\n");

            // Download file
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `audit-logs-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to export logs");
        } finally {
            setIsExporting(false);
        }
    }, [filters]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Audit Logs
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Security monitoring and activity tracking dashboard
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin-slow" />
                    <span>Auto-refresh enabled</span>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-muted border border-border">
                    <TabsTrigger
                        value="dashboard"
                        className="data-[state=active]:bg-background data-[state=active]:text-foreground"
                    >
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        Dashboard
                    </TabsTrigger>
                    <TabsTrigger
                        value="logs"
                        className="data-[state=active]:bg-background data-[state=active]:text-foreground"
                    >
                        <List className="h-4 w-4 mr-2" />
                        All Logs
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="space-y-6 mt-4">
                    <AuditStats />
                </TabsContent>

                <TabsContent value="logs" className="space-y-4 mt-4">
                    <AuditFilters
                        filters={filters}
                        onFiltersChange={setFilters}
                        onExport={handleExport}
                        isExporting={isExporting}
                    />
                    <AuditLogTable filters={filters} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
