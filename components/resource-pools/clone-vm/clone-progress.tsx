"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    Loader2, Server, CheckCircle2, XCircle, Clock, ClipboardCopy,
} from "lucide-react";
import { toast } from "sonner";
import { useCloneVMContext } from "./clone-vm-context";

export function CloneProgress() {
    const { state, actions, meta } = useCloneVMContext();

    return (
        <div className="py-6 space-y-4">
            {/* Status Header */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {state.cloningStatus === "Failed" ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                        ) : state.cloningStatus === "Completed!" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : state.cloningStatus === "Initiating clone..." ? (
                            <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                        ) : (
                            <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                        )}
                        <span
                            className={`font-semibold ${
                                state.cloningStatus === "Failed"
                                    ? "text-red-600"
                                    : state.cloningStatus === "Completed!"
                                    ? "text-green-600"
                                    : state.cloningStatus === "Initiating clone..."
                                    ? "text-blue-600"
                                    : "text-amber-600"
                            }`}
                        >
                            {state.cloningStatus || "Processing..."}
                        </span>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground">
                        {state.progress}%
                    </span>
                </div>
                <Progress
                    value={state.progress}
                    className={`h-2 transition-all ${
                        state.cloningStatus === "Failed"
                            ? "[&>div]:bg-red-500"
                            : state.cloningStatus === "Completed!"
                            ? "[&>div]:bg-green-500"
                            : "[&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-amber-500"
                    }`}
                />
            </div>

            {/* Error Alert */}
            {state.errorMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
                    <div className="flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="font-semibold text-red-900 dark:text-red-100 text-sm">Clone Failed</h4>
                            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{state.errorMessage}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Logs */}
            <div className="rounded-lg border bg-card shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
                    <span className="text-sm font-semibold flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Task Logs
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => {
                            const logsText = state.taskLogs.map((log) => log.t).join("\n");
                            navigator.clipboard.writeText(logsText);
                            toast.success("Logs copied to clipboard");
                        }}
                        disabled={state.taskLogs.length === 0}
                    >
                        <ClipboardCopy className="h-3 w-3" />
                        Copy Logs
                    </Button>
                </div>
                <div className="h-[300px] overflow-y-auto font-mono text-xs bg-slate-950 text-green-400 p-4">
                    {state.taskLogs.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-500 italic">
                            <div className="text-center">
                                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
                                <div>Waiting for task logs...</div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {state.taskLogs.map((log, i) => (
                                <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
                                    <span className="text-slate-600 select-none mr-2">
                                        {String(i + 1).padStart(3, " ")}│
                                    </span>
                                    {log.t}
                                </div>
                            ))}
                            <div ref={meta.logsEndRef} />
                        </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            {state.cloningStatus === "Failed" ? (
                <div className="flex gap-2 pt-2">
                    <Button variant="default" onClick={actions.resetForm} className="flex-1">
                        Retry
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            actions.setOpen(false);
                            actions.resetForm();
                        }}
                        className="flex-1"
                    >
                        Close
                    </Button>
                </div>
            ) : (
                state.cloningStatus !== "Completed!" && (
                    <p className="text-xs text-center text-muted-foreground pt-2">
                        Please wait while the VM is being cloned to{" "}
                        <span className="font-semibold">{meta.poolId}</span>
                    </p>
                )
            )}
        </div>
    );
}
