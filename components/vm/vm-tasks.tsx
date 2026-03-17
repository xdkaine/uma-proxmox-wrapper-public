"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCw } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface VMTasksProps {
    vmid: string;
    node: string;
}

interface Task {
    upid: string;
    node: string;
    pid: number;
    pstart: number;
    starttime: number;
    endtime?: number;
    type: string;
    id: string;
    user: string;
    status: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function VMTasks({ vmid, node }: VMTasksProps) {
    const { data: tasks, error, isLoading, mutate } = useSWR<Task[]>(
        `/api/proxmox/nodes/${node}/tasks?vmid=${vmid}`,
        fetcher
    );

    const formatTime = (timestamp: number) => {
        if (!timestamp) return "-";
        return new Date(timestamp * 1000).toLocaleString();
    };

    const getStatusBadge = (status: string) => {
        if (status === "OK") return <Badge variant="default" className="bg-green-600">OK</Badge>;
        if (status === "RUNNING") return <Badge variant="secondary" className="animate-pulse">Running</Badge>;
        return <Badge variant="destructive">{status}</Badge>;
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Task History</CardTitle>
                    <CardDescription>
                        Recent operations performed on this VM.
                    </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => mutate()}>
                    <RotateCw className="mr-2 h-4 w-4" />
                    Reload
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px]">Start Time</TableHead>
                                <TableHead className="w-[180px]">End Time</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : tasks?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                        No tasks found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                tasks?.map((task) => (
                                    <TableRow key={task.upid}>
                                        <TableCell>{formatTime(task.starttime)}</TableCell>
                                        <TableCell>{formatTime(task.endtime || 0)}</TableCell>
                                        <TableCell className="font-medium">{task.type}</TableCell>
                                        <TableCell>{task.user}</TableCell>
                                        <TableCell className="text-right">
                                            {getStatusBadge(task.status)}
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
