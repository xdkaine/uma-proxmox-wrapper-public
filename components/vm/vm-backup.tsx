"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Loader2, HardDrive, RotateCw, Archive } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface VMBackupProps {
    vmid: string;
    node: string;
}

interface Storage {
    id: string; // usually "storageId" or "node:storageId"
    storage: string;
    content: string; // "images,rootdir,backup,..."
    type: string;
    avail: number;
    total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function VMBackup({ vmid, node }: VMBackupProps) {
    // Fetch available storage on this node that supports backups
    const { data: storageList, isLoading: isStorageLoading } = useSWR<Storage[]>(
        `/api/proxmox/storage?node=${node}`, // API should filter or we filter client side
        fetcher
    );

    const [selectedStorage, setSelectedStorage] = useState("");
    const [mode, setMode] = useState("snapshot");
    const [compress, setCompress] = useState("zstd");
    const [removeOld, setRemoveOld] = useState(false); // remove old backups? No, usually "remove" means prune? Or remove temp? 
    // Proxmox API `remove` usually means remove the VM? NO! 
    // Wait, `nodes/{node}/vzdump` `remove` param: "Remove the backup file on failure?" or "Remove old backups?"
    // Checked API docs: remove: boolean. "Remove the backup file (on success?)" - No.
    // Actually `remove`: Remove the backup file if the backup was successful? No, that makes no sense.
    // Let's re-read API or assume standard defaults.
    // Actually, looking at docs: `remove`: boolean "Remove the VM/CT after backup." !!!! DANGEROUS.
    // DO NOT EXPOSE TO USER without huge warning. 
    // It might be for migration.
    // Let's CHECK `lib/proxmox-api.ts` implementation again.
    // I implemented `remove: boolean`. I should probably NOT expose it or rename it "Danger: Remove VM".
    // Let's just NOT expose it for now to be safe.

    // Better to focus on: Mode, Compression, Storage.

    const [isStarting, setIsStarting] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    // Filter for storages that support 'backup' content
    const backupStorages = storageList?.filter(s => s.content.includes("backup")) || [];

    const handleBackup = async () => {
        if (!selectedStorage) {
            toast.error("Please select a storage");
            return;
        }

        setIsStarting(true);
        try {
            const res = await fetch(`/api/proxmox/nodes/${node}/vzdump`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vmid,
                    storage: selectedStorage,
                    mode,
                    compress,
                    remove: false // Safety hardcode
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success(`Backup started. UPID: ${data.upid}`);
            setDialogOpen(false);
            // Ideally we show the task log or redirect to tasks... 
        } catch (err: any) {
            toast.error(err.message || "Failed to start backup");
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Backups</CardTitle>
                    <CardDescription>
                        Create backups of your VM.
                    </CardDescription>
                </div>
                <div className="flex space-x-2">
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Archive className="mr-2 h-4 w-4" />
                                Backup Now
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Backup Now</DialogTitle>
                                <DialogDescription>
                                    Start a new backup job for this VM.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label>Storage</Label>
                                    <Select value={selectedStorage} onValueChange={setSelectedStorage}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select target storage" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {isStorageLoading ? (
                                                <SelectItem value="loading" disabled>Loading...</SelectItem>
                                            ) : backupStorages.length === 0 ? (
                                                <SelectItem value="none" disabled>No backup storage found</SelectItem>
                                            ) : (
                                                backupStorages.map(s => (
                                                    <SelectItem key={s.storage} value={s.storage}>
                                                        {s.storage} (Free: {Math.round(s.avail / 1024 / 1024 / 1024)} GB)
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label>Mode</Label>
                                    <Select value={mode} onValueChange={setMode}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="snapshot">Snapshot (Live)</SelectItem>
                                            <SelectItem value="suspend">Suspend</SelectItem>
                                            <SelectItem value="stop">Stop</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label>Compression</Label>
                                    <Select value={compress} onValueChange={setCompress}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="zstd">ZSTD (Fast/Good)</SelectItem>
                                            <SelectItem value="gzip">GZIP (Good)</SelectItem>
                                            <SelectItem value="lzo">LZO (Fastest)</SelectItem>
                                            <SelectItem value="0">None</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleBackup} disabled={isStarting || !selectedStorage}>
                                    {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Start Backup
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-center p-10 border-2 border-dashed rounded-lg text-muted-foreground mt-4">
                    List of existing backups is not yet implemented (requires storage context).
                    <br />
                    Use "Task History" to view backup progress.
                </div>
            </CardContent>
        </Card>
    );
}
