'use client';

import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Server, Box, Network, Cpu, HardDrive, MemoryStick } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface PoolUtilizationProps {
    poolId: string;
}

export function PoolUtilization({ poolId }: PoolUtilizationProps) {
    const { data: limits } = useSWR(`/api/proxmox/pools/${poolId}/limits`, fetcher);
    const { data: poolData } = useSWR(`/api/proxmox/pools/${poolId}`, fetcher);
    const { data: allVnets } = useSWR(`/api/proxmox/sdn/vnets`, fetcher);

    if (!limits || !poolData) return <div>Loading utilization...</div>;

    const members = poolData.members || [];
    const vms = members.filter((m: any) => m.type === 'qemu');
    const lxcs = members.filter((m: any) => m.type === 'lxc');


    const vmCount = vms.length;
    const lxcCount = lxcs.length;


    const poolVnets = (allVnets?.vnets || []).filter((v: any) => v.alias && v.alias.startsWith(`${poolId}_`));
    const vnetCount = poolVnets.length;

    const usedCpu = members.reduce((acc: number, m: any) => acc + (m.maxcpu || 0), 0);
    const usedMem = members.reduce((acc: number, m: any) => acc + (m.maxmem || 0), 0);
    const usedDisk = members.reduce((acc: number, m: any) => acc + (m.maxdisk || 0), 0);


    const renderBar = (label: string, value: number, max: number, icon: any, unit: string = '') => {
        if (max === 0) return null; // unlimited or not set
        const percent = Math.min((value / max) * 100, 100);
        return (
            <div className="space-y-1">
                <div className="flex justify-between text-sm">
                    <div className="flex items-center gap-2">
                        {icon}
                        <span>{label}</span>
                    </div>
                    <span>{value}{unit} / {max}{unit}</span>
                </div>
                <Progress value={percent} className={percent > 90 ? "bg-red-200" : ""} />
            </div>
        );
    };

    const formatBytes = (bytes: number) => {
        const gb = bytes / (1024 * 1024 * 1024);
        return Math.round(gb * 100) / 100;
    };

    const formatMB = (bytes: number) => {
        const mb = bytes / (1024 * 1024);
        return Math.round(mb);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pool Utilization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                    {renderBar("VMs", vmCount, limits.maxVMs, <Server className="w-4 h-4" />)}
                    {renderBar("LXCs", lxcCount, limits.maxLXCs, <Box className="w-4 h-4" />)}
                    {renderBar("vNETs", vnetCount, limits.maxVnets, <Network className="w-4 h-4" />)}
                    {renderBar("CPU Cores", usedCpu, limits.maxCpu, <Cpu className="w-4 h-4" />)}
                    {renderBar("Memory (MB)", formatMB(usedMem), limits.maxMemory, <MemoryStick className="w-4 h-4" />)}
                    {renderBar("Storage (GB)", formatBytes(usedDisk), limits.maxDisk, <HardDrive className="w-4 h-4" />)}
                </div>
                {limits.maxVMs === 0 && limits.maxCpu === 0 && limits.maxVnets === 0 && (
                    <div className="text-sm text-muted-foreground text-center">
                        No limits configured for this pool.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
