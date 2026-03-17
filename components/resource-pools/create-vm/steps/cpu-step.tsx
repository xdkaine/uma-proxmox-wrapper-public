"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateVMContext } from "../create-vm-context";

export function CPUStep() {
    const { state, actions } = useCreateVMContext();
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Sockets</Label>
                    <Input type="number" value={state.sockets} onChange={(e) => actions.setSockets(e.target.value)} min={1} />
                </div>
                <div className="space-y-2">
                    <Label>Cores</Label>
                    <Input type="number" value={state.cores} onChange={(e) => actions.setCores(e.target.value)} min={1} />
                </div>
            </div>
            <div className="space-y-2">
                <Label>CPU Type</Label>
                <Select value={state.cpuType} onValueChange={actions.setCpuType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="host">Host (Best Performance)</SelectItem>
                        <SelectItem value="x86-64-v2-AES">x86-64-v2-AES (Compatible)</SelectItem>
                        <SelectItem value="kvm64">kvm64 (Legacy)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
