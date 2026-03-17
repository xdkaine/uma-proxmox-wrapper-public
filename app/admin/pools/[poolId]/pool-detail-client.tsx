'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Power, Monitor } from "lucide-react";
import { toast } from "sonner";
import { CreateVMDialog } from "@/components/resource-pools/create-vm-dialog";

interface PoolDetailClientProps {
    poolId: string;
    initialData: any;
}

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
});

export function PoolDetailClient({ poolId, initialData }: PoolDetailClientProps) {
    const { data: response, mutate, isLoading } = useSWR(
        `/api/proxmox/pools/${poolId}`,
        fetcher,
        {
            fallbackData: initialData ? { pool: initialData, nodes: [] } : undefined,
            refreshInterval: 5000
        }
    );

    const pool = response?.pool || initialData;
    const members = pool?.members || [];

    // Sort members: Running first, then by ID
    members.sort((a: any, b: any) => {
        if (a.status === 'running' && b.status !== 'running') return -1;
        if (a.status !== 'running' && b.status === 'running') return 1;
        return a.vmid - b.vmid;
    });

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'running': return 'default'; // dark/black
            case 'stopped': return 'secondary'; // gray
            default: return 'outline';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/admin/pools">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            Pool: {poolId}
                        </h1>
                        <p className="text-muted-foreground">{pool?.comment || "No description provided"}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <CreateVMDialog poolId={poolId} onSuccess={() => mutate()} />
                    <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Members Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Resources</CardTitle>
                    <CardDescription>
                        Virtual Machines and Containers belonging to this pool.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Node</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Uptime</TableHead>
                                <TableHead>Resources</TableHead>
                                {/* We could add actions here like Console if we want to allow admins to jump in */}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        This pool is empty.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                members.map((member: any) => (
                                    <TableRow
                                        key={member.id}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => window.location.href = `/admin/pools/${poolId}/${member.vmid}`}
                                    >
                                        <TableCell className="font-mono">{member.vmid}</TableCell>
                                        <TableCell className="font-medium">{member.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="uppercase text-[10px]">
                                                {member.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{member.node}</TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusVariant(member.status)}>
                                                {member.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {member.uptime ? (
                                                <span className="text-xs font-mono">
                                                    {Math.floor(member.uptime / 3600)}h {Math.floor((member.uptime % 3600) / 60)}m
                                                </span>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {member.maxcpu} CPU · {Math.round(member.maxmem / 1024 / 1024 / 1024)}GB RAM
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
