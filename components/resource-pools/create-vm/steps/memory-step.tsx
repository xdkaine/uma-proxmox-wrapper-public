"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateVMContext } from "../create-vm-context";

export function MemoryStep() {
    const { state, actions } = useCreateVMContext();
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Memory (MiB)</Label>
                <Input type="number" value={state.memory} onChange={(e) => actions.setMemory(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                    {parseInt(state.memory || "0") >= 1024
                        ? `~ ${(parseInt(state.memory || "0") / 1024).toFixed(1)} GiB`
                        : ""}
                </p>
            </div>
        </div>
    );
}
