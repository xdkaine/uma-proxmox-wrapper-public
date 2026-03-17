"use client";

import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight } from "lucide-react";
import { useCreateVMContext } from "./create-vm-context";

export function VMWizardFooter() {
    const { state, actions } = useCreateVMContext();
    const { step, totalSteps, loading, node, name, diskStorage, diskSize } =
        state;

    const isNextDisabled =
        (step === 1 && (!node || !name)) ||
        (step === 4 && (!diskStorage || !diskSize));

    return (
        <>
            <Button
                variant="outline"
                onClick={
                    step === 1 ? () => actions.setOpen(false) : actions.prevStep
                }
                disabled={loading}
            >
                {step === 1 ? "Cancel" : "Back"}
            </Button>

            {step < totalSteps ? (
                <Button onClick={actions.nextStep} disabled={isNextDisabled}>
                    Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            ) : (
                <Button onClick={actions.handleSubmit} disabled={loading}>
                    {loading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Finish
                </Button>
            )}
        </>
    );
}
