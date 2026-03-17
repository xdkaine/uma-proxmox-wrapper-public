"use client";

import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useCreateVMContext } from "../create-vm-context";

export function OSStep() {
    const { state, actions } = useCreateVMContext();

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>ISO Storage</Label>
                <Select value={state.isoStorage} onValueChange={actions.setIsoStorage}>
                    <SelectTrigger><SelectValue placeholder="Select ISO Storage" /></SelectTrigger>
                    <SelectContent>
                        {state.isoStorages.map((s: any) => (
                            <SelectItem key={s.storage} value={s.storage}>{s.storage}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {state.diskStorage === "local-lvm" && (() => {
                const sel = state.diskStorages.find((s: any) => s.storage === "local-lvm");
                const freeGB = ((sel?.free || 0) / (1024 * 1024 * 1024)).toFixed(2);
                const totalGB = ((sel?.total || 0) / (1024 * 1024 * 1024)).toFixed(2);
                return (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="flex flex-col gap-1">
                            <span>Warning: &quot;local-lvm&quot; works, however it is local to this node. VMs on this storage cannot be easily migrated.</span>
                            <span className="font-semibold text-xs opacity-90">Available: {freeGB} GB free of {totalGB} GB</span>
                        </AlertDescription>
                    </Alert>
                );
            })()}

            <div className="space-y-2">
                <Label>ISO Image</Label>
                <Select value={state.isoImage} onValueChange={actions.setIsoImage} disabled={!state.isoStorage}>
                    <SelectTrigger><SelectValue placeholder="Select ISO Image" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none" className="text-muted-foreground italic">No Media</SelectItem>
                        {state.isoList.map((iso: any) => (
                            <SelectItem key={iso.volid} value={iso.volid}>
                                {iso.volid.split("/").pop()}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Guest OS Type</Label>
                <Select value={state.osType} onValueChange={actions.setOsType}>
                    <SelectTrigger><SelectValue placeholder="Select OS Type" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="l26">Linux 6.x - 2.6 Kernel</SelectItem>
                        <SelectItem value="win11">Microsoft Windows 11/2022</SelectItem>
                        <SelectItem value="win10">Microsoft Windows 10/2016/2019</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
