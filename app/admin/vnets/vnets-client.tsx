'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Trash2, Info, Timer, Zap } from "lucide-react";
import { toast } from "sonner";
import { DeleteResourceDialog } from "@/components/admin/delete-resource-dialog";
import { CreateVnetDialog } from "@/components/sdn/create-vnet-dialog";

interface VnetsClientProps {
    initialVnets: any[];
    zones: any[];
    session: any;
}

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
});

const COOLDOWN_SECONDS = 300; // 5 minutes

export function VnetsClient({ initialVnets, zones, session }: VnetsClientProps) {
    const { mutate } = useSWRConfig();

    const { data, error, isLoading } = useSWR<{ vnets: any[] }>('/api/proxmox/sdn/vnets', fetcher, {
        fallbackData: { vnets: initialVnets },
        refreshInterval: 10000,
    });

    const vnets = data?.vnets || [];
    const appVnets = vnets.filter((v: any) => v.vnet.startsWith('DEV'));

    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; vnet?: any }>({ open: false });
    const [isDeleting, setIsDeleting] = useState(false);

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
        poll();
        const interval = setInterval(poll, 10_000);
        return () => clearInterval(interval);
    }, []);

    // Countdown timer (ticks locally between polls for smooth UX)
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
            const res = await fetch("/api/proxmox/sdn/apply-queue", { method: "POST" });
            const data = await res.json();

            if (!res.ok) {
                if (res.status === 429 && data.remainingSeconds) {
                    setSdnCooldown(data.remainingSeconds);
                    setSdnAppliedBy(data.appliedBy || null);
                    toast.error('Network config change in progress. Please wait.');
                } else {
                    toast.error(data.error || 'Failed to apply SDN');
                }
                return;
            }

            setSdnCooldown(data.cooldownSeconds || COOLDOWN_SECONDS);
            setSdnAppliedBy(session?.user?.username || null);
            toast.success('SDN applied successfully! Changes are being propagated to all nodes.');
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setSdnApplying(false);
        }
    }, [session?.user?.username]);

    const handleDelete = async () => {
        if (!deleteDialog.vnet) return;
        setIsDeleting(true);
        try {
            const response = await fetch('/api/proxmox/sdn/vnets', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vnet: deleteDialog.vnet.vnet }),
            });

            if (response.ok) {
                toast.success('VNET deleted successfully');
                mutate('/api/proxmox/sdn/vnets');
                setDeleteDialog({ open: false });
            } else {
                const errData = await response.json();
                toast.error(`Failed to delete: ${errData?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            toast.error(`Error: ${err.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    if (error) return <div className="text-red-500">Failed to load VNETs</div>;
    if (isLoading) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <Card className="w-full">
                <CardContent className="p-6">

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-2xl">VNETs</CardTitle>
                            <Popover>
                                <PopoverTrigger>
                                    <Info className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none">VNET Information</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Manage your Virtual Networks (VNETs) here. VNETs are part of the SDN (Software Defined Network) and allow you to segment your network traffic.
                                        </p>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                            <CreateVnetDialog
                                zones={zones || []}
                                username={session?.user?.username || ''}
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
                    </div>
                    <CardDescription>
                        Only VNETs starting with <code>DEV</code> are shown.
                    </CardDescription>
                </CardContent>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>VNET</TableHead>
                                <TableHead>Zone</TableHead>
                                <TableHead>Tag</TableHead>
                                <TableHead>VLAN Aware</TableHead>
                                <TableHead>Alias</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {appVnets.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center">No application VNETs found</TableCell>
                                </TableRow>
                            ) : (
                                appVnets.map((vnet: any) => (
                                    <TableRow key={vnet.vnet}>
                                        <TableCell className="font-medium">{vnet.vnet}</TableCell>
                                        <TableCell>{vnet.zone}</TableCell>
                                        <TableCell>{vnet.tag || '-'}</TableCell>
                                        <TableCell>{vnet.vlanaware ? 'Yes' : 'No'}</TableCell>
                                        <TableCell>{vnet.alias || '-'}</TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setDeleteDialog({ open: true, vnet })}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <DeleteResourceDialog
                open={deleteDialog.open}
                onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
                onConfirm={handleDelete}
                resourceName={deleteDialog.vnet?.vnet}
                resourceType="VNET"
                isDeleting={isDeleting}
            />
        </div>
    );
}
