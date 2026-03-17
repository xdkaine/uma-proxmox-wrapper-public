"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useCreateVMContext } from "../create-vm-context";

export function DiskStep() {
    const { state, actions } = useCreateVMContext();
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Disk Storage</Label>
                <Select value={state.diskStorage} onValueChange={actions.setDiskStorage}>
                    <SelectTrigger><SelectValue placeholder="Select Storage for Disk" /></SelectTrigger>
                    <SelectContent>
                        {state.diskStorages.map((s: any) => (
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
                    <Alert variant="destructive" className="mt-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="flex flex-col gap-1">
                            <span>Warning: &quot;local-lvm&quot; is local to this node. VMs on this storage cannot be easily migrated.</span>
                            <span className="font-semibold text-xs opacity-90">Available: {freeGB} GB free of {totalGB} GB</span>
                        </AlertDescription>
                    </Alert>
                );
            })()}

            <div className="space-y-2">
                <Label>Disk Size (GiB)</Label>
                <Input type="number" value={state.diskSize} onChange={(e) => actions.setDiskSize(e.target.value)} />
            </div>
        </div>
    );
}
