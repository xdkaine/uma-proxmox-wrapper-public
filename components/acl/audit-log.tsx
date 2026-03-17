"use client";

import { useState } from "react";
import { useACLs } from "@/lib/swr-hooks";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface AuditLogProps {
    username?: string;
    isAdmin?: boolean;
}

export function AuditLog({ username, isAdmin = false }: AuditLogProps) {
    const { acls, isLoading, isError } = useACLs();
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"all" | "my">("my");
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // Handlers
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setCurrentPage(1);
    };

    const handleViewModeChange = (mode: "all" | "my") => {
        setViewMode(mode);
        setCurrentPage(1);
    };

    if (isError) return <div className="text-destructive">Failed to load ACLs</div>;

    // Filter Logic - ensure acls is an array first
    // Filter Logic - ensure acls is an array first
    // API might return { acls: [...] } or [...]
    let safeAcls: any[] = [];
    if (acls && Array.isArray(acls)) {
        safeAcls = acls;
    } else if (acls && typeof acls === 'object' && 'acls' in acls && Array.isArray((acls as any).acls)) {
        safeAcls = (acls as any).acls;
    }

    // Fallback if safeAcls is still not an array (should be empty array from init)
    if (!Array.isArray(safeAcls)) safeAcls = [];
    const filteredAcls = safeAcls.filter(acl => {
        // 1. View Mode Filter
        // If "my" mode enabled, filter by username
        // If "all" mode enabled (and isAdmin), show everything
        // Regular users stuck in "my" mode implicitly
        if (viewMode === "my" || !isAdmin) {
            if (username) {
                // Strict check to avoid partial matches
                const matchesUser = acl.ugid === username || acl.ugid.startsWith(`${username}@`);
                if (!matchesUser) return false;
            }
        }

        // 2. Search Filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesPath = acl.path.toLowerCase().includes(query);
            const matchesUser = acl.ugid.toLowerCase().includes(query);
            const matchesRole = acl.roleid.toLowerCase().includes(query);
            return matchesPath || matchesUser || matchesRole;
        }

        return true;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredAcls.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedAcls = filteredAcls.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
        <Card className="col-span-1 md:col-span-2 lg:col-span-3 border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0 mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <CardTitle className="text-2xl">Access Permissions</CardTitle>

                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        {/* Search Input */}
                        <div className="relative w-full md:w-64">
                            <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                type="search"
                                placeholder="Search logs..."
                                className="pl-9"
                                value={searchQuery}
                                onChange={handleSearchChange}
                            />
                        </div>

                        {/* View Mode Toggle (Admins only) */}
                        {isAdmin && (
                            <div className="flex bg-muted rounded-md p-1 shrink-0">
                                <button
                                    onClick={() => handleViewModeChange("my")}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${viewMode === "my" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    My Actions
                                </button>
                                <button
                                    onClick={() => handleViewModeChange("all")}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${viewMode === "all" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    All Actions
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-0">
                <div className="rounded-md border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Path</TableHead>
                                <TableHead>User/Token</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Propagate</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">Loading audit logs...</TableCell>
                                </TableRow>
                            ) : paginatedAcls.length > 0 ? (
                                paginatedAcls.map((acl, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium max-w-[200px] md:max-w-[300px] truncate" title={acl.path}>{acl.path}</TableCell>
                                        <TableCell>{acl.ugid}</TableCell>
                                        <TableCell>{acl.roleid}</TableCell>
                                        <TableCell>{acl.propagate ? "Yes" : "No"}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                        No audit entries found
                                        {isAdmin && viewMode === "my" && <div className="text-xs mt-1 cursor-pointer text-primary underline" onClick={() => handleViewModeChange("all")}>Switch to All Actions</div>}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </Button>
                        <span className="text-sm text-muted-foreground mx-2">
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
