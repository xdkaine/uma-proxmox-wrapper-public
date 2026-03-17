"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Filter, Download, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface AuditFilters {
    userId?: string;
    action?: string;
    resource?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
}

interface AuditFiltersProps {
    filters: AuditFilters;
    onFiltersChange: (filters: AuditFilters) => void;
    onExport: (format: "csv" | "json") => void;
    isExporting?: boolean;
}

const ACTION_TYPES = [
    "LOGIN",
    "LOGOUT",
    "VM_Start",
    "VM_Stop",
    "VM_Create",
    "VM_Delete",
    "VM_Console_Open",
    "VM_Config_Update",
];

export function AuditFilters({ filters, onFiltersChange, onExport, isExporting }: AuditFiltersProps) {
    const [showActionDropdown, setShowActionDropdown] = useState(false);
    const [actionSearch, setActionSearch] = useState("");
    const actionRef = useRef<HTMLDivElement>(null);

    // Close action dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (actionRef.current && !actionRef.current.contains(event.target as Node)) {
                setShowActionDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleFilterChange = (key: keyof AuditFilters, value: string) => {
        const newFilters = { ...filters, [key]: value };
        if (!value) delete newFilters[key];
        onFiltersChange(newFilters);
    };

    const clearFilters = () => {
        setActionSearch("");
        onFiltersChange({});
    };

    const activeFilterCount = Object.keys(filters).length;

    const filteredActions = ACTION_TYPES.filter((action) =>
        action.toLowerCase().includes(actionSearch.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-4 p-4 border rounded-lg bg-card shadow-sm">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                        {activeFilterCount > 0 && (
                            <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                                {activeFilterCount}
                            </span>
                        )}
                    </h3>
                    <div className="flex items-center gap-2">
                        {activeFilterCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearFilters}
                                className="h-8 text-muted-foreground hover:text-foreground"
                            >
                                Clear all
                            </Button>
                        )}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 transition-colors"
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    Export
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-40 p-1" align="end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start font-normal"
                                    onClick={() => onExport("csv")}
                                    disabled={isExporting}
                                >
                                    Download CSV
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start font-normal"
                                    onClick={() => onExport("json")}
                                    disabled={isExporting}
                                >
                                    Download JSON
                                </Button>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Search Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search by user, resource..."
                            value={filters.userId || ""}
                            onChange={(e) => handleFilterChange("userId", e.target.value)}
                            className="w-full h-9 pl-9 pr-3 bg-background border border-input rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    {/* Action Filter */}
                    <div className="relative min-w-[180px]" ref={actionRef}>
                        <input
                            type="text"
                            placeholder="Action type..."
                            value={filters.action || actionSearch}
                            onChange={(e) => {
                                setActionSearch(e.target.value);
                                if (!e.target.value) {
                                    handleFilterChange("action", "");
                                }
                            }}
                            onFocus={() => setShowActionDropdown(true)}
                            className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                        {showActionDropdown && (
                            <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {filteredActions.length > 0 ? (
                                    filteredActions.map((action) => (
                                        <div
                                            key={action}
                                            className="px-3 py-2 text-sm text-popover-foreground hover:bg-muted cursor-pointer flex items-center justify-between"
                                            onClick={() => {
                                                handleFilterChange("action", action);
                                                setActionSearch("");
                                                setShowActionDropdown(false);
                                            }}
                                        >
                                            {action}
                                            {filters.action === action && (
                                                <Check className="h-4 w-4 text-primary" />
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">
                                        No actions found
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Status Filter */}
                    <div>
                        <select
                            value={filters.status || ""}
                            onChange={(e) => handleFilterChange("status", e.target.value)}
                            className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
                        >
                            <option value="">All Statuses</option>
                            <option value="SUCCESS">Success</option>
                            <option value="FAILURE">Failure</option>
                            <option value="WARNING">Warning</option>
                        </select>
                    </div>

                    {/* Date Inputs */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="date"
                                value={filters.startDate ? format(new Date(filters.startDate), "yyyy-MM-dd") : ""}
                                onChange={(e) => {
                                    const date = e.target.value ? new Date(e.target.value).toISOString() : "";
                                    handleFilterChange("startDate", date);
                                }}
                                className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                placeholder="Start Date"
                            />
                        </div>
                        <div className="relative flex-1">
                            <input
                                type="date"
                                value={filters.endDate ? format(new Date(filters.endDate), "yyyy-MM-dd") : ""}
                                onChange={(e) => {
                                    const date = e.target.value ? new Date(e.target.value).toISOString() : "";
                                    handleFilterChange("endDate", date);
                                }}
                                className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                placeholder="End Date"
                            />
                        </div>
                    </div>
                </div>

                {/* Quick Filters */}
                <div className="flex gap-2 text-xs overflow-x-auto pb-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => handleFilterChange("status", "FAILURE")}
                    >
                        Failed Actions
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => handleFilterChange("action", "LOGIN")}
                    >
                        Logins Only
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => handleFilterChange("action", "VM_Create")}
                    >
                        VM Creations
                    </Button>
                </div>
            </div>

            {/* Active Filters Display */}
            {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2">
                    {Object.entries(filters).map(([key, value]) => {
                        if (!value) return null;
                        if (key === "startDate") {
                            return (
                                <div key={key} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs font-medium text-foreground border border-border">
                                    <span className="text-muted-foreground">After:</span>
                                    <span>{format(new Date(value), "MMM d, y")}</span>
                                    <button onClick={() => handleFilterChange(key, "")} className="ml-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                                </div>
                            )
                        }
                        if (key === "endDate") {
                            return (
                                <div key={key} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs font-medium text-foreground border border-border">
                                    <span className="text-muted-foreground">Before:</span>
                                    <span>{format(new Date(value), "MMM d, y")}</span>
                                    <button onClick={() => handleFilterChange(key, "")} className="ml-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                                </div>
                            )
                        }
                        return (
                            <div
                                key={key}
                                className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs font-medium text-foreground border border-border"
                            >
                                <span className="text-muted-foreground capitalize">{key}:</span>
                                <span>{value}</span>
                                <button
                                    onClick={() => handleFilterChange(key as keyof AuditFilters, "")}
                                    className="ml-1 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
