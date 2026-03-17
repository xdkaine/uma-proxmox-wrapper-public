"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, Copy, CheckCircle2, User, Filter, ChevronDown, ChevronUp } from "lucide-react";
import useSWR from "swr";
import { AuditFilters } from "./audit-filters";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type AuditLogWithDetails = {
    id: string;
    userId: string | null;
    username: string;
    action: string;
    resource: string;
    details: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    status: string;
    createdAt: string | Date;
};

interface AuditLogTableProps {
    filters?: AuditFilters;
}

export default function AuditLogTable({ filters }: AuditLogTableProps) {
    const [page, setPage] = useState(1);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Reset to page 1 when filters change
    useEffect(() => {
        setPage(1);
    }, [filters]);

    // Build query params
    const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: "20",
    });

    if (filters?.userId) queryParams.set("userId", filters.userId);
    if (filters?.action) queryParams.set("action", filters.action);
    if (filters?.resource) queryParams.set("resource", filters.resource);
    if (filters?.status) queryParams.set("status", filters.status);
    if (filters?.startDate) queryParams.set("startDate", filters.startDate);
    if (filters?.endDate) queryParams.set("endDate", filters.endDate);

    const { data, error, isLoading } = useSWR(
        `/api/admin/audit-logs?${queryParams}`,
        fetcher,
        {
            refreshInterval: 5000,
            keepPreviousData: true,
        }
    );

    const logs: AuditLogWithDetails[] = data?.logs || [];
    const totalPages = data?.pagination?.pages || 1;
    const total = data?.pagination?.total || 0;
    const loading = isLoading;

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const toggleRow = (logId: string) => {
        setExpandedRow(expandedRow === logId ? null : logId);
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case "SUCCESS":
                return "text-green-500 dark:text-green-400";
            case "FAILURE":
                return "text-red-500 dark:text-red-400";
            case "WARNING":
                return "text-amber-500 dark:text-amber-400";
            default:
                return "text-muted-foreground";
        }
    };

    const getActionStyle = (action: string) => {
        if (action.includes("DELETE") || action.includes("STOP")) {
            return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400";
        }
        if (action === "LOGIN") {
            return "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400";
        }
        if (action === "VM_CONSOLE_OPEN") {
            return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-400";
        }
        if (action.includes("CREATE") || action.includes("START")) {
            return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400";
        }
        if (action.includes("VIEW")) {
            return "border-border text-muted-foreground";
        }
        return "border-border text-foreground";
    };

    const getRowStyle = (log: AuditLogWithDetails) => {
        if (log.status === "FAILURE") {
            return "bg-red-50/50 hover:bg-red-50 dark:bg-red-950/10 dark:hover:bg-red-950/20";
        }
        if (log.status === "WARNING") {
            return "bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20";
        }
        return "hover:bg-muted/50";
    };

    return (
        <div className="space-y-4">
            {/* Results Count */}
            <div className="flex items-center justify-between px-1">
                <span className="text-sm text-muted-foreground">
                    {total.toLocaleString()} total results
                </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-left text-sm text-foreground">
                    <thead className="bg-muted text-xs uppercase text-muted-foreground font-medium">
                        <tr>
                            <th className="px-4 py-3 w-8"></th>
                            <th className="px-4 py-3">Timestamp</th>
                            <th className="px-4 py-3">User</th>
                            <th className="px-4 py-3">Action</th>
                            <th className="px-4 py-3">Resource</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">IP Address</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-8 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                                    <Filter className="h-6 w-6 mx-auto mb-2" />
                                    No logs found matching your filters.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <>
                                    {/* Main Row */}
                                    <tr
                                        key={log.id}
                                        className={`transition-colors cursor-pointer ${getRowStyle(log)} ${expandedRow === log.id ? "bg-muted/50" : ""
                                            }`}
                                        onClick={() => toggleRow(log.id)}
                                    >
                                        <td className="px-4 py-3">
                                            {expandedRow === log.id ? (
                                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                                            <div className="text-foreground">
                                                {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                                            </div>
                                            <div className="text-muted-foreground text-[10px]">
                                                {format(new Date(log.createdAt), "yyyy")}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                                                    <User className="h-3 w-3 text-muted-foreground" />
                                                </div>
                                                <span className="text-foreground">{log.username}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getActionStyle(
                                                    log.action
                                                )}`}
                                            >
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={log.resource}>
                                            {log.resource}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`text-xs font-medium ${getStatusStyle(log.status)}`}>
                                                {log.status === "SUCCESS" && "✓ "}
                                                {log.status === "FAILURE" && "✗ "}
                                                {log.status === "WARNING" && "⚠ "}
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                                            {log.ipAddress || "—"}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(log.id);
                                                }}
                                                className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                                title="Copy Log ID"
                                            >
                                                {copiedId === log.id ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                ) : (
                                                    <Copy className="h-4 w-4" />
                                                )}
                                            </button>
                                        </td>
                                    </tr>

                                    {/* Expanded Details Row */}
                                    {expandedRow === log.id && (
                                        <tr className="bg-muted/30 border-t border-border">
                                            <td colSpan={8} className="px-4 py-4">
                                                <div className="grid grid-cols-2 gap-6 max-w-4xl">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                                                                User Details
                                                            </span>
                                                            <div className="text-foreground font-medium">{log.username}</div>
                                                            {log.userId && (
                                                                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                                                    ID: {log.userId}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                                                                Resource
                                                            </span>
                                                            <div className="text-foreground font-mono text-sm">
                                                                {log.resource}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                                                                Source
                                                            </span>
                                                            <div className="text-foreground font-mono text-sm">
                                                                {log.ipAddress || "Unknown IP"}
                                                            </div>
                                                            {log.userAgent && (
                                                                <div className="text-xs text-muted-foreground mt-1 break-all">
                                                                    {log.userAgent}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                                                            Details
                                                        </span>
                                                        <div className="bg-muted/50 rounded-md p-3 border border-border font-mono text-xs overflow-x-auto max-h-60 overflow-y-auto">
                                                            <pre className="text-foreground whitespace-pre-wrap">
                                                                {JSON.stringify(log.details, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-between items-center px-1">
                <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-card border border-input rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm text-foreground transition-colors"
                >
                    Previous
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                    </span>
                    {totalPages > 1 && (
                        <div className="flex gap-1">
                            {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                const pageNum = i + 1;
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setPage(pageNum)}
                                        className={`w-8 h-8 rounded text-xs transition-colors ${page === pageNum
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                            {totalPages > 5 && (
                                <span className="text-muted-foreground">...</span>
                            )}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 bg-card border border-input rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm text-foreground transition-colors"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
