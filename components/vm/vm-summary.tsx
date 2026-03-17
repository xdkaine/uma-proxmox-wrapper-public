"use client";

import { useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import {
    Activity,
    Cpu,
    HardDrive,
    Play,
    Square,
    RefreshCw,
    Power,
    Pause,
    RotateCcw,
    Network,
    ArrowDownToLine,
    ArrowUpFromLine,
    FileText,
    Save,
    Clock,
    Server,
    Database,
    Pencil,
    Loader2,
    AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VMPerformanceCharts } from "./vm-performance-charts";

interface VMSummaryProps {
    vmid: string;
    node: string;
    initialData: any;
    type?: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Format bytes to human readable string
function formatBytes(bytes: number, decimals = 2): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format uptime to human readable string
function formatUptime(seconds: number): string {
    if (!seconds || seconds === 0) return '0s';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

export function VMSummary({ vmid, node, initialData, type }: VMSummaryProps) {
    const vmType = type || initialData?.type || 'qemu';

    // Poll for real-time status updates every 5 seconds
    const { data: statusData, error: statusError, isLoading: statusLoading } = useSWR(
        `/api/proxmox/vm/${vmid}/status?node=${node}&type=${vmType}`,
        fetcher,
        {
            refreshInterval: 5000,
            fallbackData: initialData,
            revalidateOnFocus: true
        }
    );

    // Fetch VM config for notes and other config values
    const { data: configData, mutate: mutateConfig } = useSWR(
        `/api/proxmox/vm/${vmid}/config?node=${node}`,
        fetcher
    );

    // Merge status and initial data
    const vmData = {
        ...initialData,
        ...statusData,
    };

    // Notes editing state
    const [notes, setNotes] = useState('');
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    // Update notes when config loads
    useEffect(() => {
        if (configData?.description) {
            setNotes(configData.description);
        }
    }, [configData?.description]);

    // Power Actions
    const [isLoading, setIsLoading] = useState(false);



    const handlePowerAction = async (action: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/power`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node, action }),
            });
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || `Failed to ${action} VM`);
            } else {
                toast.success(`VM ${action} initiated`);
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        } catch (e) {
            toast.error("Action failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveNotes = async () => {
        setIsSavingNotes(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node, description: notes }),
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to save notes");
            } else {
                toast.success("Notes saved successfully");
                setIsEditingNotes(false);
                mutateConfig();
            }
        } catch (e) {
            toast.error("Failed to save notes");
        } finally {
            setIsSavingNotes(false);
        }
    };

    // Quick Edit State
    const [quickEditField, setQuickEditField] = useState<'name' | 'memory' | 'cores' | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    const handleQuickEdit = (field: 'name' | 'memory' | 'cores') => {
        setQuickEditField(field);
        if (field === 'name') setEditValue(vmData.name || configData?.name || "");
        if (field === 'memory') setEditValue(configData?.memory || "");
        if (field === 'cores') setEditValue(configData?.cores || "");
    };

    const handleQuickSave = async () => {
        setIsSavingNotes(true);
        try {
            const payload: any = { node };
            if (quickEditField === 'name') payload.name = editValue;
            if (quickEditField === 'memory') payload.memory = parseInt(editValue);
            if (quickEditField === 'cores') payload.cores = parseInt(editValue);

            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to update");
            } else {
                toast.success("Updated successfully");
                setQuickEditField(null);
                mutateConfig();
            }
        } catch (e) {
            toast.error("Failed to update");
        } finally {
            setIsSavingNotes(false);
        }
    };



    const statusMap: Record<string, { color: string, label: string }> = {
        running: { color: "text-green-500", label: "Running" },
        stopped: { color: "text-red-500", label: "Stopped" },
        paused: { color: "text-yellow-500", label: "Paused" },
    };

    const currentStatus = vmData.status || 'unknown';
    const statusInfo = statusMap[currentStatus] || { color: "text-gray-500", label: currentStatus };

    // Calculate usage percentages safely
    const cpuUsage = vmData.cpu ? (vmData.cpu * 100) : 0;
    const memUsage = vmData.mem && vmData.maxmem ? (vmData.mem / vmData.maxmem) * 100 : 0;
    const diskUsage = vmData.disk && vmData.maxdisk ? (vmData.disk / vmData.maxdisk) * 100 : 0;

    return (
        <div className="space-y-6">

            <div className="flex items-center justify-between bg-card p-4 rounded-lg border shadow-sm">
                <div className="flex items-center gap-3">
                    <Activity className={`h-5 w-5 ${statusInfo.color}`} />
                    <span className="font-medium text-lg capitalize">{statusInfo.label}</span>
                    <span className="text-muted-foreground text-sm mx-2">|</span>
                    <span className="text-muted-foreground text-sm">Node: {node}</span>
                    {statusLoading && (
                        <>
                            <span className="text-muted-foreground text-sm mx-2">|</span>
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">

                    <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={isLoading || currentStatus === 'running'}
                        onClick={() => handlePowerAction('start')}
                    >
                        <Play className="h-4 w-4 mr-2" /> Start
                    </Button>


                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={isLoading || currentStatus !== 'running'}
                        onClick={() => handlePowerAction('shutdown')}
                    >
                        <Power className="h-4 w-4 mr-2" /> Shutdown
                    </Button>


                    {currentStatus === 'paused' ? (
                        <Button
                            size="sm"
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={isLoading}
                            onClick={() => handlePowerAction('resume')}
                        >
                            <Play className="h-4 w-4 mr-2" /> Resume
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoading || currentStatus !== 'running'}
                            onClick={() => handlePowerAction('suspend')}
                        >
                            <Pause className="h-4 w-4 mr-2" /> Pause
                        </Button>
                    )}


                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" disabled={isLoading}>
                                More
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handlePowerAction('reboot')} disabled={currentStatus !== 'running'}>
                                <RefreshCw className="mr-2 h-4 w-4" /> Reboot
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => handlePowerAction('reset')}
                                disabled={currentStatus !== 'running'}
                                className="text-orange-600 focus:text-orange-600"
                            >
                                <RotateCcw className="mr-2 h-4 w-4" /> Reset (Hard)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePowerAction('stop')} disabled={currentStatus !== 'running'} className="text-red-600 focus:text-red-600">
                                <Square className="mr-2 h-4 w-4" /> Stop (Force)
                            </DropdownMenuItem>

                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatUptime(vmData.uptime || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Since last boot
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {cpuUsage.toFixed(1)}%
                        </div>
                        <Progress value={cpuUsage} className="h-2 mt-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {vmData.cpus || vmData.maxcpu || 'N/A'} vCPU(s)
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                        <Server className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {memUsage.toFixed(1)}%
                        </div>
                        <Progress value={memUsage} className="h-2 mt-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {formatBytes(vmData.mem || 0)} / {formatBytes(vmData.maxmem || 0)}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Disk Usage</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {diskUsage.toFixed(1)}%
                        </div>
                        <Progress value={diskUsage} className="h-2 mt-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {formatBytes(vmData.disk || 0)} / {formatBytes(vmData.maxdisk || 0)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Network Traffic</CardTitle>
                        <Network className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                                <ArrowDownToLine className="h-4 w-4 text-green-500" />
                                <div>
                                    <div className="text-lg font-semibold">{formatBytes(vmData.netin || 0)}</div>
                                    <p className="text-xs text-muted-foreground">Received</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <ArrowUpFromLine className="h-4 w-4 text-blue-500" />
                                <div>
                                    <div className="text-lg font-semibold">{formatBytes(vmData.netout || 0)}</div>
                                    <p className="text-xs text-muted-foreground">Transmitted</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Disk I/O</CardTitle>
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                                <ArrowDownToLine className="h-4 w-4 text-purple-500" />
                                <div>
                                    <div className="text-lg font-semibold">{formatBytes(vmData.diskread || 0)}</div>
                                    <p className="text-xs text-muted-foreground">Read</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <ArrowUpFromLine className="h-4 w-4 text-orange-500" />
                                <div>
                                    <div className="text-lg font-semibold">{formatBytes(vmData.diskwrite || 0)}</div>
                                    <p className="text-xs text-muted-foreground">Written</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" /> Notes
                        </CardTitle>
                        <CardDescription>VM description and notes</CardDescription>
                    </div>
                    {!isEditingNotes ? (
                        <Button variant="outline" size="sm" onClick={() => setIsEditingNotes(true)}>
                            Edit
                        </Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setIsEditingNotes(false);
                                    setNotes(configData?.description || '');
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSaveNotes}
                                disabled={isSavingNotes}
                            >
                                {isSavingNotes ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4 mr-2" />
                                )}
                                Save
                            </Button>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {isEditingNotes ? (
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add notes or description for this VM..."
                            className="min-h-[100px]"
                        />
                    ) : (
                        <div className="min-h-[60px] text-sm">
                            {notes || configData?.description ? (
                                <pre className="whitespace-pre-wrap font-sans text-foreground">
                                    {notes || configData?.description}
                                </pre>
                            ) : (
                                <p className="text-muted-foreground italic">No notes added yet.</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Information</CardTitle>
                    <CardDescription>VM Configuration Details</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <span className="text-muted-foreground block">ID</span>
                            <span className="font-medium">{vmid}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">Name</span>
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{vmData.name || configData?.name || 'N/A'}</span>
                                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleQuickEdit('name')}>
                                    <Pencil className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">Node</span>
                            <span className="font-medium">{node}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">Type</span>
                            <span className="font-medium uppercase">{vmType}</span>
                        </div>
                        {configData?.ostype && (
                            <div>
                                <span className="text-muted-foreground block">OS Type</span>
                                <span className="font-medium">{configData.ostype}</span>
                            </div>
                        )}
                        {configData?.machine && (
                            <div>
                                <span className="text-muted-foreground block">Machine</span>
                                <span className="font-medium">{configData.machine}</span>
                            </div>
                        )}
                        {configData?.cpu && (
                            <div>
                                <span className="text-muted-foreground block">CPU Type</span>
                                <span className="font-medium">{configData.cpu}</span>
                            </div>
                        )}
                        {configData?.sockets && (
                            <div>
                                <span className="text-muted-foreground block">Sockets</span>
                                <span className="font-medium">{configData.sockets}</span>
                            </div>
                        )}
                        {configData?.cores && (
                            <div>
                                <span className="text-muted-foreground block">Cores</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{configData.cores}</span>
                                    <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleQuickEdit('cores')}>
                                        <Pencil className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        )}
                        {configData?.memory && (
                            <div>
                                <span className="text-muted-foreground block">Memory</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{configData.memory} MB</span>
                                    <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleQuickEdit('memory')}>
                                        <Pencil className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        )}
                        {configData?.boot && (
                            <div>
                                <span className="text-muted-foreground block">Boot Order</span>
                                <span className="font-medium">{configData.boot}</span>
                            </div>
                        )}
                        {vmData.pid && (
                            <div>
                                <span className="text-muted-foreground block">PID</span>
                                <span className="font-medium">{vmData.pid}</span>
                            </div>
                        )}
                        {vmData.ha && vmData.ha.managed === 1 && (
                            <div>
                                <span className="text-muted-foreground block">HA Status</span>
                                <span className="font-medium text-green-600">Managed</span>
                            </div>
                        )}
                        {configData?.agent && (
                            <div>
                                <span className="text-muted-foreground block">QEMU Agent</span>
                                <span className="font-medium">{configData.agent === 1 || configData.agent === '1' ? 'Enabled' : 'Disabled'}</span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Dialog open={!!quickEditField} onOpenChange={(open) => !open && setQuickEditField(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit {quickEditField === 'name' ? 'VM Name' : quickEditField === 'memory' ? 'Memory' : 'Cores'}</DialogTitle>
                        <DialogDescription>
                            Change the {quickEditField} of the VM.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {quickEditField === 'name' && (
                            <div className="grid gap-2">
                                <Label htmlFor="edit-name">Name</Label>
                                <Input
                                    id="edit-name"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                />
                            </div>
                        )}
                        {quickEditField === 'memory' && (
                            <div className="grid gap-2">
                                <Label htmlFor="edit-memory">Memory (MiB)</Label>
                                <Input
                                    id="edit-memory"
                                    type="number"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                />
                            </div>
                        )}
                        {quickEditField === 'cores' && (
                            <div className="grid gap-2">
                                <Label htmlFor="edit-cores">Cores</Label>
                                <Input
                                    id="edit-cores"
                                    type="number"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setQuickEditField(null)}>Cancel</Button>
                        <Button onClick={handleQuickSave} disabled={isSavingNotes}>
                            {isSavingNotes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>



            <VMPerformanceCharts vmid={vmid} node={node} type={vmType} />
        </div >
    );
}
