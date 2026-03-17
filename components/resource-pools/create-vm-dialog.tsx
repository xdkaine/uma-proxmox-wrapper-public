"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { CreateVMProvider } from "./create-vm/create-vm-provider";
import { useCreateVMContext } from "./create-vm/create-vm-context";
import { VMWizardStepper } from "./create-vm/vm-wizard-stepper";
import { VMWizardFooter } from "./create-vm/vm-wizard-footer";
import { GeneralStep } from "./create-vm/steps/general-step";
import { OSStep } from "./create-vm/steps/os-step";
import { SystemStep } from "./create-vm/steps/system-step";
import { DiskStep } from "./create-vm/steps/disk-step";
import { CPUStep } from "./create-vm/steps/cpu-step";
import { MemoryStep } from "./create-vm/steps/memory-step";
import { NetworkStep } from "./create-vm/steps/network-step";
import { ConfirmStep } from "./create-vm/steps/confirm-step";

interface CreateVMDialogProps {
    poolId: string;
    onSuccess?: () => void;
}

function CreateVMDialogShell() {
    const { state, actions, meta } = useCreateVMContext();

    return (
        <Dialog open={state.open} onOpenChange={actions.setOpen}>
            <DialogTrigger asChild>
                <span>
                    <Button
                        disabled={state.isLimitReached}
                        className={
                            state.isLimitReached
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                        }
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Create VM
                    </Button>
                </span>
            </DialogTrigger>
            {state.isLimitReached && (
                <div className="absolute mt-1 text-xs text-destructive font-medium bg-background border px-2 py-1 rounded shadow-sm z-50">
                    {state.limitMessage}
                </div>
            )}
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>Create Virtual Machine</DialogTitle>
                    <DialogDescription>
                        Step {state.step} of {state.totalSteps}:{" "}
                        {meta.steps[state.step - 1].title}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-6">
                    <VMWizardStepper />
                    <div className="max-w-xl mx-auto space-y-4">
                        {state.step === 1 && <GeneralStep />}
                        {state.step === 2 && <OSStep />}
                        {state.step === 3 && <SystemStep />}
                        {state.step === 4 && <DiskStep />}
                        {state.step === 5 && <CPUStep />}
                        {state.step === 6 && <MemoryStep />}
                        {state.step === 7 && <NetworkStep />}
                        {state.step === 8 && <ConfirmStep />}
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-muted/10">
                    <VMWizardFooter />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function CreateVMDialog({ poolId, onSuccess }: CreateVMDialogProps) {
    return (
        <CreateVMProvider poolId={poolId} onSuccess={onSuccess}>
            <CreateVMDialogShell />
        </CreateVMProvider>
    );
}
