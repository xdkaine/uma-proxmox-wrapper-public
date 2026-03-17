"use client";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateVMContext } from "../create-vm-context";

export function ConfirmStep() {
    const { state, actions, meta } = useCreateVMContext();

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wider">General</span>
                    <div className="font-medium">{state.node} : (Auto-generated ID) ({state.name})</div>
                </div>
                <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wider">Pool</span>
                    <div className="font-medium">{meta.poolId}</div>
                </div>
                <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wider">OS</span>
                    <div className="font-medium text-ellipsis overflow-hidden whitespace-nowrap" title={state.isoImage}>{state.isoImage || "No Media"}</div>
                    <div className="text-xs text-muted-foreground">{state.osType}</div>
                </div>
                <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wider">System</span>
                    <div className="font-medium">{state.machine}</div>
                </div>
                <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wider">Disk</span>
                    <div className="font-medium">{state.diskSize} GiB on {state.diskStorage}</div>
                </div>
                <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wider">CPU/RAM</span>
                    <div className="font-medium">{state.sockets} socket(s), {state.cores} core(s) ({state.cpuType})</div>
                    <div className="font-medium">{state.memory} MiB</div>
                </div>
                <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wider">Network</span>
                    <div className="font-medium">{state.netModel} on {state.bridge}</div>
                </div>
            </div>

            <div className="flex items-center space-x-2 pt-4 border-t">
                <Checkbox
                    id="start"
                    checked={state.start}
                    onCheckedChange={(c) => actions.setStart(!!c)}
                />
                <Label htmlFor="start">Start after created</Label>
            </div>
        </div>
    );
}
