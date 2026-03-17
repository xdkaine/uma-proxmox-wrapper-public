"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RotateCcw, Trash2, Camera, RotateCw } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface VMSnapshotsProps {
    vmid: string;
    node: string;
}

interface Snapshot {
    name: string;
    snaptime?: number;
    description?: string;
    vmstate?: number;
    parent?: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function VMSnapshots({ vmid, node }: VMSnapshotsProps) {
    const { data: snapshots, error, isLoading, mutate } = useSWR<Snapshot[]>(
        `/api/proxmox/vm/${vmid}/snapshots?node=${node}`,
        fetcher
    );

    const [isCreating, setIsCreating] = useState(false);
    const [snapName, setSnapName] = useState("");
    const [snapDesc, setSnapDesc] = useState("");
    const [includeRam, setIncludeRam] = useState(true);
    const [isLoadingAction, setIsLoadingAction] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);


    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [snapshotToDelete, setSnapshotToDelete] = useState<string | null>(null);

    const formatTime = (timestamp?: number) => {
        if (!timestamp) return "-";
        return new Date(timestamp * 1000).toLocaleString();
    };

    const handleCreate = async () => {
        setIsLoadingAction(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/snapshots`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node,
                    snapname: snapName,
                    description: snapDesc,
                    vmstate: includeRam ? 1 : 0
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success("Snapshot created successfully");
            setSnapName("");
            setSnapDesc("");
            setDialogOpen(false);
            mutate();
        } catch (err: any) {
            toast.error(err.message || "Failed to create snapshot");
        } finally {
            setIsLoadingAction(false);
        }
    };

    const handleRollback = async (snapname: string) => {
        if (!confirm(`Are you sure you want to rollback to snapshot '${snapname}'? Current state will be lost.`)) return;
        setIsLoadingAction(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/snapshots/rollback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node, snapname }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success("Rollback started");
            mutate();
        } catch (err: any) {
            toast.error(err.message || "Failed to rollback");
        } finally {
            setIsLoadingAction(false);
        }
    };

    const handleDelete = async (snapname: string) => {
        setSnapshotToDelete(snapname);
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!snapshotToDelete) return;
        setIsLoadingAction(true);
        try {
            console.log(`Deleting snapshot: ${snapshotToDelete}`);
            const res = await fetch(`/api/proxmox/vm/${vmid}/snapshots?node=${node}&snapname=${snapshotToDelete}`, {
                method: "DELETE",
            });
            const data = await res.json();
            console.log("Delete response:", data);
            if (!res.ok) throw new Error(data.error);
            toast.success("Snapshot deleted");
            await mutate(); // Await the mutation
            setIsDeleteDialogOpen(false);
            setSnapshotToDelete(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to delete snapshot");
        } finally {
            setIsLoadingAction(false);
        }
    };


    const sortedSnapshots = snapshots?.sort((a, b) => (b.snaptime || 0) - (a.snaptime || 0));

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Snapshots</CardTitle>
                    <CardDescription>
                        Manage VM snapshots.
                    </CardDescription>
                </div>
                <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => mutate()}>
                        <RotateCw className="mr-2 h-4 w-4" />
                        Reload
                    </Button>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="mr-2 h-4 w-4" />
                                Take Snapshot
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Take Snapshot</DialogTitle>
                                <DialogDescription>
                                    Save the current state of the VM.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input id="name" value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder="Snapshot Name" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="desc">Description</Label>
                                    <Textarea id="desc" value={snapDesc} onChange={(e) => setSnapDesc(e.target.value)} placeholder="Notes (optional)" />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="ram" checked={includeRam} onCheckedChange={(c) => setIncludeRam(!!c)} />
                                    <Label htmlFor="ram">Include RAM</Label>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleCreate} disabled={isLoadingAction}>
                                    {isLoadingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Take Snapshot
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Delete Snapshot</DialogTitle>
                                <DialogDescription>
                                    Are you sure you want to delete snapshot '{snapshotToDelete}'? This action cannot be undone.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                                <Button variant="destructive" onClick={confirmDelete} disabled={isLoadingAction}>
                                    {isLoadingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Delete
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>RAM</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : sortedSnapshots?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                        No snapshots found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedSnapshots?.map((snap) => (
                                    <TableRow key={snap.name}>
                                        <TableCell className="font-medium">
                                            {snap.name === "current" ? (
                                                <Badge variant="outline">Current State</Badge>
                                            ) : (
                                                <div className="flex items-center">
                                                    <Camera className="mr-2 h-4 w-4 text-muted-foreground" />
                                                    {snap.name}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>{formatTime(snap.snaptime)}</TableCell>
                                        <TableCell>{snap.vmstate ? "Yes" : "No"}</TableCell>
                                        <TableCell className="max-w-[300px] truncate">{snap.description}</TableCell>
                                        <TableCell className="text-right">
                                            {snap.name !== "current" && (
                                                <div className="flex justify-end space-x-2">
                                                    <Button variant="ghost" size="icon" onClick={() => handleRollback(snap.name)} title="Rollback">
                                                        <RotateCcw className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(snap.name)} title="Delete" className="text-destructive hover:text-destructive">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
