"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Trash2, Loader2, HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface UnusedDisk {
    key: string;
    size: string;
    storage: string;
}

interface UnusedDisksManagerProps {
    vmid: string;
    node: string;
    config: any;
    onUpdate: () => void;
}

export function UnusedDisksManager({ vmid, node, config, onUpdate }: UnusedDisksManagerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedDisk, setSelectedDisk] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isReattaching, setIsReattaching] = useState(false);

    const unusedDisks: UnusedDisk[] = Object.keys(config || {})
        .filter(key => key.startsWith('unused'))
        .map(key => ({
            key,
            size: config[key].match(/size=(\d+[KMGT]?)/)?.[1] || 'Unknown',
            storage: config[key].split(':')[0] || 'Unknown'
        }));

    const handleDelete = async (diskKey: string) => {
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    node,
                    delete: diskKey
                })
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to delete disk");
            } else {
                toast.success("Unused disk deleted");
                onUpdate();
            }
        } catch (e) {
            toast.error("Failed to delete disk");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleReattach = async (diskKey: string) => {
        setIsReattaching(true);
        try {
            // Find next available scsi slot
            let nextSlot = 0;
            while (config[`scsi${nextSlot}`] !== undefined) {
                nextSlot++;
            }

            const diskValue = config[diskKey];

            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    node,
                    [`scsi${nextSlot}`]: diskValue,
                    delete: diskKey
                })
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to reattach disk");
            } else {
                toast.success(`Disk reattached as scsi${nextSlot}`);
                onUpdate();
            }
        } catch (e) {
            toast.error("Failed to reattach disk");
        } finally {
            setIsReattaching(false);
        }
    };

    if (unusedDisks.length === 0) return null;

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="relative"
            >
                <HardDrive className="h-4 w-4 mr-2" />
                Unused Disks
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">
                    {unusedDisks.length}
                </span>
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Unused Disks Manager</DialogTitle>
                        <DialogDescription>
                            Manage orphaned disks that are not currently attached
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        {unusedDisks.map((disk) => (
                            <Card key={disk.key}>
                                <CardHeader className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-base">{disk.key}</CardTitle>
                                            <CardDescription className="text-sm">
                                                {disk.storage} • {disk.size}
                                            </CardDescription>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleReattach(disk.key)}
                                                disabled={isReattaching || isDeleting}
                                            >
                                                <RefreshCw className="h-4 w-4 mr-1" />
                                                Reattach
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => handleDelete(disk.key)}
                                                disabled={isDeleting || isReattaching}
                                            >
                                                <Trash2 className="h-4 w-4 mr-1" />
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                            </Card>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
