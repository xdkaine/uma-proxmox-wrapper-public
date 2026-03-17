"use client";

import { usePools } from "@/lib/swr-hooks";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Settings2 } from "lucide-react";
import { PoolLimitsDialog } from "@/components/resource-pools/pool-limits-dialog";

export function AdminPoolLimitsList() {
    const { pools, isLoading, isError } = usePools();

    if (isLoading) {
        return (
            <div className="flex h-20 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isError) {
        return <div className="text-destructive">Failed to load pools</div>;
    }

    const safePools = Array.isArray(pools) ? pools : [];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pool Caps</CardTitle>
                <CardDescription>
                    Pool caps are managed globally and applied to every pool. Use this list to view per-pool usage.
                    Values shown are read-only here.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Pool ID</TableHead>
                            <TableHead>Comment</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {safePools.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                                    No pools found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            safePools.map((pool) => (
                                <TableRow key={pool.poolid}>
                                    <TableCell className="font-medium">{pool.poolid}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {pool.comment || "-"}
                                    </TableCell>
                                    <TableCell>
                                        <PoolLimitsDialog
                                            poolId={pool.poolid}
                                            trigger={
                                                <Button variant="outline" size="sm">
                                                    <Settings2 className="mr-2 h-3 w-3" />
                                                    View
                                                </Button>
                                            }
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
