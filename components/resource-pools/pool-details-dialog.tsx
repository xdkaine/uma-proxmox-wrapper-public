"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Loader2, Server, HardDrive } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PoolDetailsDialogProps {
    poolId: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function PoolDetailsDialog({ poolId }: PoolDetailsDialogProps) {
    const [open, setOpen] = useState(false);

    const { data, isLoading } = useSWR(
        open ? `/api/proxmox/pools/${poolId}` : null,
        fetcher
    );

    const members = data?.pool?.members || [];
    const proxmoxUrl = data?.proxmoxUrl || "";

    const getProxmoxLink = (member: any) => {
        if (!proxmoxUrl) return "#";
        // Format: https://proxmox.sdc.cpp/#v1:0:=qemu%2F261:4::::30:::26
        // We need type (qemu/lxc) and vmid.
        const type = member.type === 'qemu' ? 'qemu' : member.type === 'lxc' ? 'lxc' : null;
        if (!type) return "#";
        return `${proxmoxUrl}/#v1:0:=${type}%2F${member.vmid || member.id}:4::::30:::26`;
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="View Details">
                    <Eye className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Pool Details: {poolId}</DialogTitle>
                    <DialogDescription>
                        Resources assigned to this pool.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {isLoading ? (
                        <div className="flex justify-center p-4">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="border rounded-md max-h-[60vh] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[100px]">ID</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Node</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {members.length > 0 ? (
                                        members.map((member: any) => (
                                            <TableRow key={`${member.type}-${member.id}`}>
                                                <TableCell className="font-mono">
                                                    <Link
                                                        href={getProxmoxLink(member)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="hover:underline text-primary"
                                                    >
                                                        {member.vmid || member.id}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {member.type === 'qemu' || member.type === 'lxc' ? (
                                                            <Server className="h-4 w-4 text-muted-foreground" />
                                                        ) : (
                                                            <HardDrive className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                        <span className="capitalize">{member.type}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    <Link
                                                        href={getProxmoxLink(member)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="hover:underline"
                                                    >
                                                        {member.name || member.storage || member.id}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{member.node}</TableCell>
                                                <TableCell>
                                                    {member.status && (
                                                        <Badge variant={member.status === 'running' ? 'default' : 'secondary'}>
                                                            {member.status}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                                No resources found in this pool.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
