"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Loader2 } from "lucide-react";

interface PoolLimitsDialogProps {
    poolId: string;
    trigger?: React.ReactNode;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function PoolLimitsDialog({ poolId, trigger }: PoolLimitsDialogProps) {
    const [open, setOpen] = useState(false);

    const [limits, setLimits] = useState({
        maxVMs: 0,
        maxLXCs: 0,
        maxCpu: 0,
        maxMemory: 0,
        maxDisk: 0
    });

    // Fetch existing limits when dialog opens
    const { data, isLoading } = useSWR(
        open ? `/api/proxmox/pools/${poolId}/limits` : null,
        fetcher,
        {
            onSuccess: (data) => {
                if (data) {
                    setLimits({
                        maxVMs: data.maxVMs || 0,
                        maxLXCs: data.maxLXCs || 0,
                        maxCpu: data.maxCpu || 0,
                        maxMemory: data.maxMemory || 0,
                        maxDisk: data.maxDisk || 0
                    });
                }
            }
        }
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Settings2 className="h-4 w-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]" onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>Resource Limits: {poolId}</DialogTitle>
                    <DialogDescription>
                        Pool caps are set globally. This view shows the read-only cap and current usage.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="maxVMs">Max VMs</Label>
                                <Input
                                    id="maxVMs"
                                    type="number"
                                    min="0"
                                    value={limits.maxVMs}
                                    disabled
                                    onChange={(e) => setLimits({ ...limits, maxVMs: parseInt(e.target.value) || 0 })}
                                />
                                {data?.usage && (
                                    <p className="text-xs text-muted-foreground">
                                        Current usage: {data.usage.vms}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="maxLXCs">Max Containers</Label>
                                <Input
                                    id="maxLXCs"
                                    type="number"
                                    min="0"
                                    value={limits.maxLXCs}
                                    disabled
                                    onChange={(e) => setLimits({ ...limits, maxLXCs: parseInt(e.target.value) || 0 })}
                                />
                                {data?.usage && (
                                    <p className="text-xs text-muted-foreground">
                                        Current usage: {data.usage.lxcs}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* 
                           Additional fields for CPU/RAM can be added here.
                           Hidden for now to focus on the user's reported issue.
                        */}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
