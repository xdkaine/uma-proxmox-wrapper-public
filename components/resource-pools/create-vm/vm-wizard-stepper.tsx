"use client";

import { Check } from "lucide-react";
import { useCreateVMContext } from "./create-vm-context";

export function VMWizardStepper() {
    const { state, meta } = useCreateVMContext();

    return (
        <div className="flex justify-between mb-8 px-2 relative">
            <div className="absolute top-1/2 left-0 w-full h-1 bg-muted -z-10 -translate-y-1/2 rounded-full" />
            <div
                className="absolute top-1/2 left-0 h-1 bg-primary -z-10 -translate-y-1/2 rounded-full transition-all duration-300"
                style={{
                    width: `${((state.step - 1) / (state.totalSteps - 1)) * 100}%`,
                }}
            />
            {meta.steps.map((s) => (
                <div
                    key={s.id}
                    className="flex flex-col items-center gap-2 bg-background z-10 px-1"
                >
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                            state.step >= s.id
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground text-muted-foreground bg-background"
                        }`}
                    >
                        {state.step > s.id ? (
                            <Check className="h-4 w-4" />
                        ) : (
                            s.id
                        )}
                    </div>
                    <span
                        className={`text-[10px] font-medium hidden sm:block ${
                            state.step >= s.id
                                ? "text-primary"
                                : "text-muted-foreground"
                        }`}
                    >
                        {s.title}
                    </span>
                </div>
            ))}
        </div>
    );
}
