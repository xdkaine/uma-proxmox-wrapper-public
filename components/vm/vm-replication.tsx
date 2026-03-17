"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RotateCw, Trash2, Copy, History, Clock } from "lucide-react";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface VMReplicationProps {
    vmid: string;
    node: string;
}

interface ReplicationJob {
    id: string;
    target: string;
    guest: string;
    type: string;
    schedule: string;
    active: number;
    last_sync?: number;
    duration?: number;
    fail_count?: number;
    error?: string;
}

interface Node {
    node: string;
    status: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function VMReplication({ vmid, node }: VMReplicationProps) {
    const { data: jobs, error, isLoading, mutate } = useSWR<ReplicationJob[]>(
        `/api/proxmox/cluster/replication?vmid=${vmid}`,
        fetcher
    );

    // Fetch nodes for target selection (excluding current node)
    const { data: nodesData } = useSWR<{ nodes: Node[] }>('/api/proxmox/pools/none',
        () => fetch('/api/proxmox/pools/none').then(r => r.json()).catch(() => ({ nodes: [] }))
    );
    const [isCreating, setIsCreating] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [target, setTarget] = useState("");
    const [schedule, setSchedule] = useState("*/15"); // default 15 min

    const handleAdd = async () => {
        if (!target) {
            toast.error("Target node is required");
            return;
        }
        setIsCreating(true);
        try {
            const res = await fetch(`/api/proxmox/cluster/replication`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vmid,
                    target,
                    schedule
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success("Replication job created");
            setDialogOpen(false);
            setTarget("");
            mutate();
        } catch (err: any) {
            toast.error(err.message || "Failed to create job");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(`Are you sure you want to delete replication job ${id}?`)) return;
        try {
            const res = await fetch(`/api/proxmox/cluster/replication/${id}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success("Job deleted");
            mutate();
        } catch (err: any) {
            toast.error(err.message || "Failed to delete job");
        }
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return "-";
        return `${Math.round(seconds)}s`;
    };

    const formatTime = (ts?: number) => {
        if (!ts) return "-";
        return new Date(ts * 1000).toLocaleString();
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Replication</CardTitle>
                    <CardDescription>
                        Manage high availability replication for this VM.
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
                                Add Job
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add Replication Job</DialogTitle>
                                <DialogDescription>
                                    Replicate this VM to another node.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label>Target Node</Label>
                                    <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. pve2" />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Schedule (Cron format)</Label>
                                    <Select value={schedule} onValueChange={setSchedule}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="*/15">Every 15 min</SelectItem>
                                            <SelectItem value="*/30">Every 30 min</SelectItem>
                                            <SelectItem value="*/60">Every hour</SelectItem>
                                            <SelectItem value="*/2">Every 2 minutes</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleAdd} disabled={isCreating}>
                                    {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Job
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
                                <TableHead>Target</TableHead>
                                <TableHead>Schedule</TableHead>
                                <TableHead>Last Sync</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : jobs?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                        No replication jobs found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                jobs?.map((job) => (
                                    <TableRow key={job.id}>
                                        <TableCell className="font-medium">{job.target}</TableCell>
                                        <TableCell><Badge variant="outline">{job.schedule}</Badge></TableCell>
                                        <TableCell>{formatTime(job.last_sync)}</TableCell>
                                        <TableCell>{formatDuration(job.duration)}</TableCell>
                                        <TableCell>
                                            {job.fail_count && job.fail_count > 0 ? (
                                                <Badge variant="destructive">Error: {job.fail_count}</Badge>
                                            ) : job.error ? (
                                                <Badge variant="destructive">{job.error}</Badge>
                                            ) : (
                                                <Badge className="bg-green-600">OK</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(job.id)} className="text-destructive hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
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
