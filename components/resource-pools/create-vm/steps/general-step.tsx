"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCreateVMContext } from "../create-vm-context";

export function GeneralStep() {
    const { state, actions } = useCreateVMContext();
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Node</Label>
                <Select value={state.node} onValueChange={actions.setNode}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select Node" />
                    </SelectTrigger>
                    <SelectContent>
                        {state.safeNodes.map((n: any) => (
                            <SelectItem key={n.node} value={n.node}>
                                <div className="flex items-center justify-between gap-4 w-full min-w-[300px]">
                                    <span className="font-medium">{n.node}</span>
                                    <span className="text-xs text-muted-foreground font-mono">
                                        CPU: {((n.cpu || 0) * 100).toFixed(1)}% | RAM:{" "}
                                        {n.maxmem ? ((n.mem / n.maxmem) * 100).toFixed(1) : 0}%
                                    </span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>Name</Label>
                <Input
                    value={state.name}
                    onChange={(e) => actions.setName(e.target.value)}
                    placeholder="my-vm"
                    autoFocus
                />
            </div>
        </div>
    );
}
