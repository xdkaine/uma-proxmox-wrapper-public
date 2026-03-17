'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PoolLimitsPage() {
    return (
        <div className="p-8 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Default Pool Limits</h1>
                    <p className="text-muted-foreground mt-2">
                        Set caps that apply to every pool when users create VMs and LXCs through this app.
                    </p>
                </div>
            </div>

            <GlobalLimitForm />
            <VnetLimitsForm />
        </div>
    );
}

function GlobalLimitForm() {
    const [loading, setLoading] = useState(false);

    // Form state
    const [limits, setLimits] = useState({
        maxVMs: 0,
        maxLXCs: 0,
        maxCpu: 0,
        maxMemory: 0,
        maxDisk: 0
    });

    const { data: existingLimits, isLoading } = useSWR('/api/proxmox/pools/global/limits', fetcher, {
        onSuccess: (data) => {
            if (data) setLimits({
                maxVMs: data.maxVMs || 0,
                maxLXCs: data.maxLXCs || 0,
                maxCpu: data.maxCpu || 0,
                maxMemory: data.maxMemory || 0,
                maxDisk: data.maxDisk || 0
            });
        }
    });

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/proxmox/pools/global/limits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(limits)
            });

            if (!res.ok) throw new Error("Failed to save global limits");

            toast.success("Global resource limits updated");
            mutate('/api/proxmox/pools/global/limits');
        } catch (error) {
            toast.error("Failed to update limits");
        } finally {
            setLoading(false);
        }
    };

    if (isLoading) {
        return <div>Loading limits...</div>;
    }

    return (
        <Card className="max-w-3xl">
            <CardHeader>
                <CardTitle>Default Pool Caps</CardTitle>
                <CardDescription>
                    Set to 0 for unlimited. These caps are enforced per pool for VM and LXC creation.
                    CPU, memory, and disk caps are stored but not enforced.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                            Max VMs Per Pool
                        </Label>
                        <Input
                            type="number"
                            min="0"
                            value={limits.maxVMs}
                            onChange={(e) => setLimits({ ...limits, maxVMs: parseInt(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-muted-foreground">
                            Hard cap on concurrent VMs allowed in each pool.
                        </p>
                    </div>
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                            Max LXCs Per Pool
                        </Label>
                        <Input
                            type="number"
                            min="0"
                            value={limits.maxLXCs}
                            onChange={(e) => setLimits({ ...limits, maxLXCs: parseInt(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-muted-foreground">
                            Hard cap on concurrent LXCs allowed in each pool.
                        </p>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-6">
                <Button onClick={handleSave} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Global Limits
                </Button>
            </CardFooter>
        </Card>
    );
}

function VnetLimitsForm() {
    const [loading, setLoading] = useState(false);
    const [maxVnetsPerUser, setMaxVnetsPerUser] = useState(0);

    const { isLoading } = useSWR('/api/settings/limits', fetcher, {
        onSuccess: (data) => {
            if (data?.maxVnetsPerUser !== undefined) {
                setMaxVnetsPerUser(data.maxVnetsPerUser || 0);
            }
        }
    });

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/settings/limits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxVnetsPerUser })
            });

            if (!res.ok) throw new Error("Failed to save dashboard limits");

            toast.success("vNET limits updated");
            mutate('/api/settings/limits');
        } catch (error) {
            toast.error("Failed to update vNET limits");
        } finally {
            setLoading(false);
        }
    };

    if (isLoading) {
        return <div>Loading dashboard limits...</div>;
    }

    return (
        <Card className="max-w-3xl">
            <CardHeader>
                <CardTitle>vNET Limits</CardTitle>
                <CardDescription>
                    Cap how many VNETs a non-admin user can create from the dashboard. Set to 0 for unlimited.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-w-sm space-y-3 rounded-lg border bg-muted/30 p-4">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Max VNETs Per User
                    </Label>
                    <Input
                        type="number"
                        min="0"
                        value={maxVnetsPerUser}
                        onChange={(e) => setMaxVnetsPerUser(parseInt(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Applies to dashboard-created VNETs only.
                    </p>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-6">
                <Button onClick={handleSave} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save vNET Limits
                </Button>
            </CardFooter>
        </Card>
    );
}
