"use client";

import { useState } from "react";
import { usePools } from "@/lib/swr-hooks";
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
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trash2, Loader2, AlertTriangle, Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreatePoolDialog } from "./create-pool-dialog";
import { ManageUsersDialog } from "./manage-users-dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useSWRConfig } from "swr";

interface PoolListProps {
    username?: string;
    userGroups?: string[];
}

type PoolCategoryFilter = "all" | "my-pools" | "group-pools" | "dev" | "kamino-pod" | "kamino-template";

export function PoolList({ username, userGroups }: PoolListProps) {
    const { pools, isLoading, isError } = usePools();
    const { mutate } = useSWRConfig();
    const router = useRouter();

    const [deletePoolId, setDeletePoolId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [poolCategoryFilter, setPoolCategoryFilter] = useState<PoolCategoryFilter>("all");
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 9;

    // Reset page when filters change
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setCurrentPage(1);
    };

    const handleCategoryFilterChange = (nextFilter: PoolCategoryFilter) => {
        setPoolCategoryFilter(nextFilter);
        setCurrentPage(1);
    };

    const getUsernameCandidates = (): Set<string> => {
        const candidates = new Set<string>();
        const raw = (username || '').trim();
        if (!raw) return candidates;

        const add = (value: string) => {
            const normalized = value.trim().toLowerCase();
            if (normalized) candidates.add(normalized);
        };

        add(raw);
        if (raw.includes('\\')) {
            add(raw.split('\\').pop() || '');
        }

        Array.from(candidates).forEach((value) => {
            if (value.includes('@')) {
                add(value.split('@')[0]);
            }
        });

        return candidates;
    };

    const getGroupCandidates = (): Set<string> => {
        const candidates = new Set<string>();
        (userGroups || []).forEach((group) => {
            const raw = (group || '').trim();
            if (!raw) return;

            const cnMatch = raw.match(/^CN=([^,]+)/i);
            const groupName = (cnMatch ? cnMatch[1] : raw).trim();
            if (!groupName) return;

            candidates.add(groupName.toLowerCase());
            candidates.add(groupName.replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase());
        });
        return candidates;
    };

    const getOwnerFromComment = (comment?: string): { type: 'user' | 'group'; name: string } | null => {
        if (!comment) return null;
        const match = comment.match(/\[Owner:\s*(user|group):([^\]]+)\]/i);
        if (!match) return null;
        const ownerType = match[1].toLowerCase();
        const ownerName = (match[2] || '').trim();
        if (!ownerName || (ownerType !== 'user' && ownerType !== 'group')) return null;
        return { type: ownerType as 'user' | 'group', name: ownerName };
    };

    const usernameCandidates = getUsernameCandidates();
    const groupCandidates = getGroupCandidates();

    const isDevPool = (poolId: string) => /^DEV_/i.test(poolId);
    const isKaminoTemplatePool = (poolId: string) => /^kamino_template_/i.test(poolId);
    const isMyPool = (poolId: string, comment?: string) => {
        const owner = getOwnerFromComment(comment);
        if (owner?.type === 'user' && usernameCandidates.has(owner.name.toLowerCase())) {
            return true;
        }

        const normalizedPool = poolId.toLowerCase();
        return Array.from(usernameCandidates).some((candidate) => {
            const sanitized = candidate.replace(/[^a-zA-Z0-9\-_]/g, '_');
            return normalizedPool.startsWith(`dev_${sanitized}_`);
        });
    };

    const isGroupPool = (poolId: string, comment?: string) => {
        const owner = getOwnerFromComment(comment);
        if (owner?.type === 'group') {
            const normalized = owner.name.toLowerCase();
            const sanitized = normalized.replace(/[^a-zA-Z0-9\-_]/g, '_');
            if (groupCandidates.has(normalized) || groupCandidates.has(sanitized)) {
                return true;
            }
        }

        const normalizedPool = poolId.toLowerCase();
        return Array.from(groupCandidates).some((candidate) =>
            normalizedPool.startsWith(`dev_${candidate}_`)
        );
    };
    const isKaminoPodPool = (poolId: string, comment?: string) => {
        const id = poolId.trim();
        const notes = (comment || "").toLowerCase();

        if (/^kamino_pod_/i.test(id)) {
            return true;
        }

        // Typical pod/lab pools use numeric prefixes like "1001_*"
        if (/^\d+_[A-Za-z0-9]/.test(id)) {
            return !isDevPool(id) && !isKaminoTemplatePool(id);
        }

        if (/\bpod\b/.test(id.toLowerCase()) || /\bpod\b/.test(notes)) {
            return !isKaminoTemplatePool(id) && !isDevPool(id);
        }

        return false;
    };

    const matchesPoolCategory = (poolId: string, comment?: string) => {
        if (poolCategoryFilter === "all") {
            return true;
        }

        if (poolCategoryFilter === "dev") {
            return isDevPool(poolId);
        }

        if (poolCategoryFilter === "my-pools") {
            return isMyPool(poolId, comment);
        }

        if (poolCategoryFilter === "group-pools") {
            return isGroupPool(poolId, comment);
        }

        if (poolCategoryFilter === "kamino-pod") {
            return isKaminoPodPool(poolId, comment);
        }

        if (poolCategoryFilter === "kamino-template") {
            return isKaminoTemplatePool(poolId);
        }

        return true;
    };

    const getPoolCategoryLabel = (poolId: string, comment?: string): string => {
        if (isMyPool(poolId, comment)) {
            return "My";
        }
        if (isGroupPool(poolId, comment)) {
            return "Group";
        }
        if (isDevPool(poolId)) {
            return "DEV";
        }
        if (isKaminoTemplatePool(poolId)) {
            return "Kamino Template";
        }
        if (isKaminoPodPool(poolId, comment)) {
            return "Kamino Pod";
        }
        return "Other";
    };

    const handleDeleteClick = (e: React.MouseEvent, poolId: string) => {
        e.stopPropagation();
        setDeletePoolId(poolId);
    };

    const confirmDelete = async () => {
        if (!deletePoolId) return;
        setIsDeleting(true);

        try {
            const res = await fetch(`/api/proxmox/pools/${deletePoolId}`, {
                method: "DELETE",
            });
            const data = await res.json();

            if (!res.ok) {
                if (res.status === 409) {
                    // Pool not empty
                    toast.error("Cannot delete pool: " + data.message);
                } else {
                    toast.error(data.error || "Failed to delete pool");
                }
            } else {
                toast.success(`Pool ${deletePoolId} deleted successfully`);
                mutate("/api/proxmox/pools");
            }

        } catch (error: any) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsDeleting(false);
            setDeletePoolId(null);
        }
    };

    const isOffline = isError && pools;

    // Filter Logic
    const safePools = Array.isArray(pools) ? pools : [];
    const filteredPools = safePools.filter(pool => {
        if (/^Templates$/i.test(pool.poolid)) {
            return false;
        }

        if (!matchesPoolCategory(pool.poolid, pool.comment)) {
            return false;
        }

        // Search Filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesId = pool.poolid.toLowerCase().includes(query);
            const matchesComment = pool.comment?.toLowerCase().includes(query);
            return matchesId || matchesComment;
        }

        return true;
    }) || [];

    // Pagination Logic
    const totalPages = Math.ceil(filteredPools.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedPools = filteredPools.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    if (isError && !pools) return <div className="text-destructive">Failed to load pools</div>;

    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0 mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <CardTitle className="text-2xl">Resource Pools</CardTitle>
                        {isOffline && (
                            <div className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full font-medium">
                                <AlertTriangle className="h-3 w-3" />
                                <span>Offline</span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant={poolCategoryFilter === "all" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleCategoryFilterChange("all")}
                            >
                                All
                            </Button>
                            <Button
                                type="button"
                                variant={poolCategoryFilter === "my-pools" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleCategoryFilterChange("my-pools")}
                            >
                                My Pools
                            </Button>
                            <Button
                                type="button"
                                variant={poolCategoryFilter === "group-pools" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleCategoryFilterChange("group-pools")}
                            >
                                Group Pools
                            </Button>
                            <Button
                                type="button"
                                variant={poolCategoryFilter === "dev" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleCategoryFilterChange("dev")}
                            >
                                DEV Pool View
                            </Button>
                            <Button
                                type="button"
                                variant={poolCategoryFilter === "kamino-pod" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleCategoryFilterChange("kamino-pod")}
                            >
                                Kamino Pod View
                            </Button>
                            <Button
                                type="button"
                                variant={poolCategoryFilter === "kamino-template" ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleCategoryFilterChange("kamino-template")}
                            >
                                Kamino Template
                            </Button>
                        </div>

                        {/* Search Input */}
                        <div className="relative w-full md:w-64">
                            <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                type="search"
                                placeholder="Search pools..."
                                className="pl-9"
                                value={searchQuery}
                                onChange={handleSearchChange}
                            />
                        </div>

                        <CreatePoolDialog username={username} userGroups={userGroups} />
                    </div>
                </div>
            </CardHeader>

            <CardContent className="px-0">
                {isLoading && !pools ? (
                    <div className="flex h-40 items-center justify-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        Loading pools...
                    </div>
                ) : paginatedPools.length > 0 ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                            {paginatedPools.map((pool) => (
                                <Card
                                    key={pool.poolid}
                                    className="group relative rounded-xl border bg-card text-card-foreground shadow-sm transition-all overflow-hidden cursor-pointer"
                                    onClick={() => router.push(`/dashboard/pools/${pool.poolid}`)}
                                >

                                    <CardContent className="p-6">
                                        <div className="mb-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="space-y-2">
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <h3 className="font-semibold text-lg leading-tight tracking-tight break-all">
                                                                    {pool.poolid}
                                                                </h3>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{pool.poolid}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {getPoolCategoryLabel(pool.poolid, pool.comment)}
                                                    </Badge>
                                                </div>

                                                {pool.allowManage && (
                                                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                                        <div onClick={(e) => e.stopPropagation()}>
                                                            <ManageUsersDialog poolId={pool.poolid} description={pool.comment} />
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive/80 hover:text-destructive hover:bg-destructive/10 -mr-2"
                                                            onClick={(e) => handleDeleteClick(e, pool.poolid)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="min-h-[3rem]">
                                            <p className="text-sm text-muted-foreground line-clamp-2">
                                                {pool.comment || "No description provided."}
                                            </p>
                                        </div>

                                        <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                                            <span>Click to view details</span>
                                            <Eye className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-8">
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
                    </>
                ) : (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                        <p>No resource pools found matching your criteria.</p>
                    </div>
                )}
            </CardContent>

            <AlertDialog open={!!deletePoolId} onOpenChange={(open: boolean) => !open && setDeletePoolId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Pool?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <strong>{deletePoolId}</strong>?
                            <br /><br />
                            <span className="flex items-center text-yellow-600 gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                <span>Caution: Ensure there are no VMs in this pool.</span>
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e: React.MouseEvent) => {
                                e.preventDefault();
                                confirmDelete();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
