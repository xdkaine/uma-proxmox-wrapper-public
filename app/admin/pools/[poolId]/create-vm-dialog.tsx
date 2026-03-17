
'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

interface CreateVMDialogProps {
    poolId: string;
    onSuccess?: () => void;
}

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
});

export function CreateVMDialog({ poolId, onSuccess }: CreateVMDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [node, setNode] = useState<string>("");
    const [name, setName] = useState("");
    const [vmid, setVmid] = useState("");
    const [isoStorage, setIsoStorage] = useState<string>("");
    const [isoImage, setIsoImage] = useState<string>("");
    const [diskStorage, setDiskStorage] = useState<string>("");
    const [diskSize, setDiskSize] = useState("32");
    const [cores, setCores] = useState("2");
    const [memory, setMemory] = useState("2048");
    const [start, setStart] = useState(true);

    // Fetch Nodes
    const { data: nodes } = useSWR('/api/proxmox/nodes', fetcher);

    // Fetch Storages (using resources API)
    const { data: resources } = useSWR('/api/proxmox/resources?type=storage', fetcher);
    const storages = resources?.data || [];

    // Filter storages
    const isoStorages = storages.filter((s: any) => s.content && s.content.includes('iso'));
    const diskStorages = storages.filter((s: any) => s.content && s.content.includes('images') && s.storage !== 'local');

    // Fetch ISOs when node and isoStorage are selected
    const { data: isoContent } = useSWR(
        node && isoStorage ? `/api/proxmox/storage/${isoStorage}/content?node=${node}&content=iso` : null,
        fetcher
    );
    const isoList = isoContent || [];

    // Helper to generate next VMID (simplified, ideally backend handles or we search)
    // For now user must input, or we default to free?
    // Let's assume user inputs for now, or we could fetch nextId.
    // Fetching next free ID:
    const { data: clusterResources } = useSWR('/api/proxmox/resources', fetcher);

    useEffect(() => {
        if (open && clusterResources?.data) {
            // Find a free ID starting 100
            const ids = clusterResources.data.map((r: any) => r.vmid).filter((id: any) => id).map(Number);
            let next = 100;
            while (ids.includes(next)) next++;
            if (!vmid) setVmid(next.toString());
        }
    }, [open, clusterResources, vmid]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!node) throw new Error("Please select a node");
            if (!vmid) throw new Error("Please enter a VM ID");
            if (!name) throw new Error("Please enter a Name");
            if (!diskStorage) throw new Error("Please select disk storage");

            const payload = {
                vmid,
                name,
                pool: poolId,
                storage: diskStorage,
                iso: isoImage || undefined,
                cores: parseInt(cores),
                memory: parseInt(memory),
                diskSize: `${diskSize}G`,
                start,
                net0: 'vmbr0' // Default bridge
            };

            const res = await fetch(`/api/proxmox/nodes/${node}/qemu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Failed to create VM");
            }

            toast.success("VM creation started");
            setOpen(false);
            if (onSuccess) onSuccess();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create VM
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
                <DialogHeader>
                    <DialogTitle>Create Virtual Machine</DialogTitle>
                    <DialogDescription>
                        Create a new VM in pool <strong>{poolId}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 space-y-2">
                            <Label>Select Node</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[200px] overflow-y-auto p-1">
                                {nodes?.map((n: any) => {
                                    // Calculate percentages
                                    const cpuPercent = n.maxcpu ? (n.cpu / n.maxcpu) * 100 : 0;
                                    const memPercent = n.maxmem ? (n.mem / n.maxmem) * 100 : 0;
                                    const diskPercent = n.maxdisk ? (n.disk / n.maxdisk) * 100 : 0;

                                    return (
                                        <div
                                            key={n.node}
                                            className={`border rounded-lg p-3 cursor-pointer transition-colors ${node === n.node ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted'}`}
                                            onClick={() => setNode(n.node)}
                                        >
                                            <div className="font-semibold mb-2">{n.node}</div>
                                            <div className="space-y-1 text-xs text-muted-foreground">
                                                <div className="flex justify-between">
                                                    <span>CPU</span>
                                                    <span>{Math.round(cpuPercent)}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500" style={{ width: `${cpuPercent}%` }} />
                                                </div>

                                                <div className="flex justify-between">
                                                    <span>RAM</span>
                                                    <span>{Math.round(memPercent)}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                                    <div className="h-full bg-purple-500" style={{ width: `${memPercent}%` }} />
                                                </div>

                                                <div className="flex justify-between">
                                                    <span>Disk</span>
                                                    <span>{Math.round(diskPercent)}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                                    <div className="h-full bg-orange-500" style={{ width: `${diskPercent}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>VM ID</Label>
                            <Input
                                value={vmid}
                                onChange={(e) => setVmid(e.target.value)}
                                placeholder="100"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="vm-name"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>ISO Storage</Label>
                            <Select value={isoStorage} onValueChange={(val) => { setIsoStorage(val); setIsoImage(""); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select ISO Storage" />
                                </SelectTrigger>
                                <SelectContent>
                                    {isoStorages.map((s: any) => (
                                        <SelectItem key={s.storage} value={s.storage}>
                                            {s.storage}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>ISO Image</Label>
                            <Select value={isoImage} onValueChange={setIsoImage} disabled={!isoStorage}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select ISO Image" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No Media</SelectItem>
                                    {isoList.map((iso: any) => (
                                        <SelectItem key={iso.volid} value={iso.volid}>
                                            {iso.volid.split('/').pop()}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Disk Storage</Label>
                            <Select value={diskStorage} onValueChange={setDiskStorage}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Disk Storage" />
                                </SelectTrigger>
                                <SelectContent>
                                    {diskStorages.map((s: any) => (
                                        <SelectItem key={s.storage} value={s.storage}>
                                            {s.storage}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Disk Size (GB)</Label>
                            <Input
                                type="number"
                                value={diskSize}
                                onChange={(e) => setDiskSize(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Cores</Label>
                            <Input
                                type="number"
                                value={cores}
                                onChange={(e) => setCores(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Memory (MB)</Label>
                            <Input
                                type="number"
                                value={memory}
                                onChange={(e) => setMemory(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="start"
                            checked={start}
                            onChange={(e) => setStart(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="start">Start after created</Label>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create VM
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
