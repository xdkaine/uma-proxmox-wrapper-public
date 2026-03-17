"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateVMContext } from "../create-vm-context";

export function SystemStep() {
    const { state, actions } = useCreateVMContext();
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Machine</Label>
                <Select value={state.machine} onValueChange={actions.setMachine}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="q35">q35 (Modern)</SelectItem>
                        <SelectItem value="i440fx">i440fx (Legacy)</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">q35 is recommended for most modern workloads (PCIe support).</p>
            </div>
            <div className="p-4 border rounded-md bg-muted/20">
                <p className="text-sm font-medium">Default Controllers</p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li>SCSI Controller: VirtIO SCSI</li>
                    <li>BIOS: SeaBIOS (Default)</li>
                    <li>Graphics: Default</li>
                </ul>
            </div>
        </div>
    );
}
