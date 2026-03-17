"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import { CloneVMProvider } from "./clone-vm/clone-vm-provider";
import { useCloneVMContext } from "./clone-vm/clone-vm-context";
import { CloneForm } from "./clone-vm/clone-form";
import { CloneProgress } from "./clone-vm/clone-progress";

interface CloneVMDialogProps {
    poolId: string;
}

function CloneVMDialogShell() {
    const { state, actions, meta } = useCloneVMContext();

    return (
        <Dialog open={state.open} onOpenChange={actions.setOpen}>
            <DialogTrigger asChild>
                <span>
                    <Button
                        disabled={state.isLimitReached}
                        className={state.isLimitReached ? "opacity-50 cursor-not-allowed" : ""}
                    >
                        <Copy className="mr-2 h-4 w-4" />
                        Clone VM
                    </Button>
                </span>
            </DialogTrigger>
            {state.isLimitReached && (
                <div className="absolute mt-1 text-xs text-destructive font-medium bg-background border px-2 py-1 rounded shadow-sm z-50">
                    {state.limitMessage}
                </div>
            )}
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Clone VM to {meta.poolId}</DialogTitle>
                    <DialogDescription>
                        Create a copy of a template VM into this pool.
                    </DialogDescription>
                </DialogHeader>

                {state.isLoading ? <CloneProgress /> : <CloneForm />}
            </DialogContent>
        </Dialog>
    );
}

export function CloneVMDialog({ poolId }: CloneVMDialogProps) {
    return (
        <CloneVMProvider poolId={poolId}>
            <CloneVMDialogShell />
        </CloneVMProvider>
    );
}
