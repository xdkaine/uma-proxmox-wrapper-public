'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DeleteResourceDialog } from "@/components/admin/delete-resource-dialog";

interface PoolsClientProps {
    initialPools: any[];
}

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
});

export function PoolsClient({ initialPools }: PoolsClientProps) {
    const { mutate } = useSWRConfig();
    const { data } = useSWR<{ pools: any[] }>('/api/proxmox/pools', fetcher, {
        fallbackData: { pools: initialPools },
        refreshInterval: 5000,
    });

    const pools = data?.pools || [];
    const [showAll, setShowAll] = useState(false);

    // Filter pools based on toggle
    const displayedPools = showAll
        ? pools
        : pools.filter(p => p.poolid.startsWith('DEV_'));

    const [deleteDialog, setDeleteDialog] = useState<{
        open: boolean;
        pool: any | null;
    }>({ open: false, pool: null });

    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!deleteDialog.pool) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/proxmox/pools/${deleteDialog.pool.poolid}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success(`Pool deleted successfully`);
                mutate('/api/proxmox/pools');
            } else {
                const error = await response.json();
                toast.error(`Failed to delete: ${error?.error || 'Unknown error'}`);
            }
        } catch (error: any) {
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
            setDeleteDialog({ open: false, pool: null });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Resource Pools</h1>
                    <p className="text-muted-foreground">Manage Proxmox resource pools.</p>
                </div>
                <Button
                    variant={showAll ? "secondary" : "outline"}
                    onClick={() => setShowAll(!showAll)}
                >
                    {showAll ? "Show App Pools Only" : "Show All Pools"}
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pools</CardTitle>
                    <CardDescription>
                        {showAll ? "Showing all resource pools." : "Only pools starting with 'DEV_' are shown."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Pool ID</TableHead>
                                <TableHead>Comment</TableHead>
                                <TableHead className="w-[150px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayedPools.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center">No pools found</TableCell>
                                </TableRow>
                            ) : (
                                displayedPools.map((pool) => (
                                    <TableRow key={pool.poolid}>
                                        <TableCell className="font-medium">{pool.poolid}</TableCell>
                                        <TableCell>{pool.comment || '-'}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    asChild
                                                >
                                                    <Link href={`/admin/pools/${pool.poolid}`}>View</Link>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive"
                                                    onClick={() => setDeleteDialog({ open: true, pool })}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
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
                resourceName={deleteDialog.pool?.poolid}
                resourceType="Pool"
                isDeleting={isDeleting}
            />
        </div>
    );
}
