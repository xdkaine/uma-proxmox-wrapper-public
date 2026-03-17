"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RotateCw, Trash2, Shield } from "lucide-react";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface VMFirewallProps {
    vmid: string;
    node: string;
}

interface Rule {
    pos: number;
    action: string;
    type: string;
    enable: number;
    comment?: string;
    source?: string;
    dest?: string;
    proto?: string;
    dport?: string;
    sport?: string;
    macro?: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function VMFirewall({ vmid, node }: VMFirewallProps) {
    const { data: rules, error, isLoading, mutate } = useSWR<Rule[]>(
        `/api/proxmox/vm/${vmid}/firewall/rules?node=${node}`,
        fetcher
    );

    const [isCreating, setIsCreating] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    // Form States
    const [action, setAction] = useState("ACCEPT");
    const [direction, setDirection] = useState("IN");
    const [source, setSource] = useState("");
    const [dest, setDest] = useState("");
    const [proto, setProto] = useState("tcp");
    const [dport, setDport] = useState("");
    const [comment, setComment] = useState("");

    const handleAdd = async () => {
        setIsCreating(true);
        try {
            const rule: any = {
                action,
                type: direction,
                enable: 1, // Default enabled
                comment,
                proto
            };
            if (source) rule.source = source;
            if (dest) rule.dest = dest;
            if (dport) rule.dport = dport;

            const res = await fetch(`/api/proxmox/vm/${vmid}/firewall/rules`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node, ...rule }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success("Rule added successfully");
            setDialogOpen(false);
            // Reset form
            setSource("");
            setDest("");
            setDport("");
            setComment("");
            mutate();
        } catch (err: any) {
            toast.error(err.message || "Failed to add rule");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (pos: number) => {
        if (!confirm(`Are you sure you want to delete rule #${pos}?`)) return;
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/firewall/rules?node=${node}&pos=${pos}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success("Rule deleted");
            mutate();
        } catch (err: any) {
            toast.error(err.message || "Failed to delete rule");
        }
    };

    const getActionBadge = (action: string) => {
        if (action === "ACCEPT") return <Badge className="bg-green-600">ACCEPT</Badge>;
        if (action === "DROP") return <Badge variant="destructive">DROP</Badge>;
        if (action === "REJECT") return <Badge variant="destructive" className="bg-orange-600">REJECT</Badge>;
        return <Badge variant="outline">{action}</Badge>;
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Firewall Rules</CardTitle>
                    <CardDescription>
                        Manage network traffic rules for this VM.
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
                                Add Rule
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Add Firewall Rule</DialogTitle>
                                <DialogDescription>
                                    Define a new rule to filter traffic.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4 grid-cols-2">
                                <div className="grid gap-2">
                                    <Label>Direction</Label>
                                    <Select value={direction} onValueChange={setDirection}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="IN">IN</SelectItem>
                                            <SelectItem value="OUT">OUT</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Action</Label>
                                    <Select value={action} onValueChange={setAction}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ACCEPT">ACCEPT</SelectItem>
                                            <SelectItem value="DROP">DROP</SelectItem>
                                            <SelectItem value="REJECT">REJECT</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Protocol</Label>
                                    <Select value={proto} onValueChange={setProto}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="tcp">TCP</SelectItem>
                                            <SelectItem value="udp">UDP</SelectItem>
                                            <SelectItem value="icmp">ICMP</SelectItem>
                                            <SelectItem value="any">Any</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Dest. Port</Label>
                                    <Input value={dport} onChange={(e) => setDport(e.target.value)} placeholder="80, 443" />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Source IP/CIDR</Label>
                                    <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="192.168.1.100" />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Dest. IP/CIDR</Label>
                                    <Input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="0.0.0.0/0" />
                                </div>
                                <div className="grid gap-2 col-span-2">
                                    <Label>Comment</Label>
                                    <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Rule description" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleAdd} disabled={isCreating}>
                                    {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Add Rule
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
                                <TableHead className="w-[80px]">Status</TableHead>
                                <TableHead>Dir</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Proto</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Dest</TableHead>
                                <TableHead>Port</TableHead>
                                <TableHead>Comment</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center h-24">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : rules?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center h-24 text-muted-foreground">
                                        No rules defined.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rules?.map((rule) => (
                                    <TableRow key={rule.pos}>
                                        <TableCell>
                                            <div className={`w-3 h-3 rounded-full ${rule.enable ? 'bg-green-500' : 'bg-gray-300'}`} title={rule.enable ? "Enabled" : "Disabled"} />
                                        </TableCell>
                                        <TableCell>{rule.type}</TableCell>
                                        <TableCell>{getActionBadge(rule.action)}</TableCell>
                                        <TableCell className="uppercase">{rule.proto || "ANY"}</TableCell>
                                        <TableCell>{rule.source || "Any"}</TableCell>
                                        <TableCell>{rule.dest || "Any"}</TableCell>
                                        <TableCell>{rule.dport || "Any"}</TableCell>
                                        <TableCell className="text-muted-foreground italic truncate max-w-[150px]">{rule.comment}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.pos)} className="text-destructive hover:text-destructive">
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
