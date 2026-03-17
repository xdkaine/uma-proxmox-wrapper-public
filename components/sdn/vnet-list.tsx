"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useVnets, useZones } from "@/lib/swr-hooks";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Info, Trash2, Search, Timer, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CreateVnetDialog } from "./create-vnet-dialog";

import { toast } from "sonner";

const COOLDOWN_SECONDS = 300; // 5 minutes

export function VnetList({ username }: { username: string }) {
    const { mutate } = useSWRConfig();
    const { vnets, isLoading: vnetsLoading, isError: vnetsError } = useVnets();
    const { zones, isLoading: zonesLoading, isError: zonesError } = useZones();
    const [deletingVnet, setDeletingVnet] = useState<string | null>(null);

    // ── Apply SDN state ──
    const [sdnCooldown, setSdnCooldown] = useState(0);
    const [sdnApplying, setSdnApplying] = useState(false);
    const [sdnAppliedBy, setSdnAppliedBy] = useState<string | null>(null);

    // Poll global cooldown every 10s so we detect when any user triggers it
    useEffect(() => {
        const poll = () => {
            fetch("/api/proxmox/sdn/apply-queue")
                .then((res) => res.json())
                .then((data) => {
                    if (data.remainingSeconds > 0) {
                        setSdnCooldown(data.remainingSeconds);
                        setSdnAppliedBy(data.appliedBy || null);
                    } else {
                        setSdnCooldown(0);
                        setSdnAppliedBy(null);
                    }
                })
                .catch(() => { });
        };
        poll(); // fire immediately on mount
        const interval = setInterval(poll, 10_000);
        return () => clearInterval(interval);
    }, []);

    // Countdown timer
    useEffect(() => {
        if (sdnCooldown <= 0) return;
        const timer = setInterval(() => {
            setSdnCooldown((prev: number) => {
                if (prev <= 1) { clearInterval(timer); setSdnAppliedBy(null); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [sdnCooldown]);

    const handleApplySDN = useCallback(async () => {
        setSdnApplying(true);
        try {
            const res = await fetch("/api/proxmox/sdn/apply-queue", {
                method: "POST",
            });
            const data = await res.json();

            if (!res.ok) {
                if (res.status === 429 && data.remainingSeconds) {
                    setSdnCooldown(data.remainingSeconds);
                    setSdnAppliedBy(data.appliedBy || null);
                    toast.error(`Network config change in progress. Please wait.`);
                } else {
                    toast.error(data.error || "Failed to apply SDN");
                }
                return;
            }

            setSdnCooldown(data.cooldownSeconds || COOLDOWN_SECONDS);
            setSdnAppliedBy(username);
            toast.success("SDN applied successfully! Changes are being propagated to all nodes.");
        } catch {
            toast.error("Network error. Please try again.");
        } finally {
            setSdnApplying(false);
        }
    }, [username]);



    // Search & Pagination State
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setCurrentPage(1);
    };

    const handleDelete = async (vnetName: string) => {
        setDeletingVnet(vnetName);
        try {
            const res = await fetch("/api/proxmox/sdn/vnets", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ vnet: vnetName }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || data.message || "Failed to delete VNET");
            }

            toast.success(`VNET "${vnetName}" deleted successfully`);
            mutate("/api/proxmox/sdn/vnets");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setDeletingVnet(null);
        }
    };

    if (vnetsError || zonesError) return <div className="text-destructive">Failed to load data</div>;
    if (zonesLoading) return <div>Loading zones...</div>;

    // Zones are already filtered server-side
    const displayZones = Array.isArray(zones) ? zones : [];

    // Combine vnets from all display zones
    const safeVnets = Array.isArray(vnets) ? vnets : [];
    const combinedVnets = displayZones.flatMap(z => {
        const zoneVnets = safeVnets.filter(v => v.zone === z.zone);
        return zoneVnets;
    })
        .sort((a, b) => {
            const tagA = a.tag ?? Number.MAX_SAFE_INTEGER;
            const tagB = b.tag ?? Number.MAX_SAFE_INTEGER;
            return tagA - tagB;
        });

    // Filter Logic
    const filteredVnets = combinedVnets.filter(vnet => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            vnet.vnet.toLowerCase().includes(query) ||
            vnet.alias?.toLowerCase().includes(query) ||
            false
        );
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredVnets.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedVnets = filteredVnets.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
        <Card className="col-span-1 md:col-span-2 lg:col-span-2 border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-2xl">VNETs</CardTitle>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Info className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-4">
                            <div className="space-y-2">
                                <h4 className="font-medium leading-none">VNET Sync Required</h4>
                                <div className="text-sm text-muted-foreground">
                                    Newly created VNETs need to be synced across the nodes. Please request an administrator to start this process.
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">


                    {/* Search Input */}
                    <div className="relative w-full md:w-64">
                        <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                            <Search className="h-4 w-4" />
                        </div>
                        <Input
                            type="search"
                            placeholder="Search VNETs..."
                            className="pl-9"
                            value={searchQuery}
                            onChange={handleSearchChange}
                        />
                    </div>

                    <CreateVnetDialog
                        zones={displayZones}
                        username={username}
                    />

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span>
                                    <Button
                                        variant={sdnCooldown > 0 ? "outline" : "default"}
                                        size="sm"
                                        disabled={sdnCooldown > 0 || sdnApplying}
                                        onClick={handleApplySDN}
                                        className="gap-1.5"
                                    >
                                        {sdnCooldown > 0 ? (
                                            <>
                                                <Timer className="h-4 w-4" />
                                                {Math.floor(sdnCooldown / 60)}:{String(sdnCooldown % 60).padStart(2, "0")}
                                            </>
                                        ) : (
                                            <>
                                                <Zap className="h-4 w-4" />
                                                {sdnApplying ? "Applying..." : "Apply SDN"}
                                            </>
                                        )}
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            {sdnCooldown > 0 && (
                                <TooltipContent>
                                    <p>A network configuration change is being applied{sdnAppliedBy ? ` by ${sdnAppliedBy}` : ""}.</p>
                                    <p>Please wait {Math.floor(sdnCooldown / 60)}m {sdnCooldown % 60}s.</p>
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent className="px-0">
                <div className="rounded-md border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>VNET</TableHead>
                                <TableHead>Zone</TableHead>
                                <TableHead>Tag</TableHead>
                                <TableHead>Alias</TableHead>
                                <TableHead className="w-[80px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {vnetsLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Loading VNETs...</TableCell>
                                </TableRow>
                            ) : paginatedVnets.length > 0 ? (
                                paginatedVnets.map((vnet) => (
                                    <TableRow key={`${vnet.zone}-${vnet.vnet}`}>
                                        <TableCell className="font-medium">{vnet.vnet}</TableCell>
                                        <TableCell>{vnet.zone}</TableCell>
                                        <TableCell>
                                            {vnet.tag ? <Badge variant="outline">{vnet.tag}</Badge> : "-"}
                                        </TableCell>
                                        <TableCell className="max-w-[200px]">
                                            {vnet.alias ? (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="truncate cursor-help font-mono text-xs">
                                                                {vnet.alias}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{vnet.alias}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            ) : (
                                                "-"
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        disabled={deletingVnet === vnet.vnet}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete VNET</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Are you sure you want to delete <strong>{vnet.vnet}</strong>? This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDelete(vnet.vnet)}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        >
                                                            {deletingVnet === vnet.vnet ? "Deleting..." : "Delete"}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                        No VNETs found matching criteria
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
