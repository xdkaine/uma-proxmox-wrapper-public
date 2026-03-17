"use client";

import { createContext, use } from "react";

export interface CloneVMState {
    open: boolean;
    isLoading: boolean;
    progress: number;
    cloningStatus: string | null;
    errorMessage: string | null;
    taskLogs: any[];
    // Form
    sourceVmId: string;
    name: string;
    targetStorage: string;
    targetNode: string;
    // Fetched
    safeTemplates: any[];
    safeNodes: any[];
    safeStorageList: any[];
    // Limits
    isLimitReached: boolean;
    limitMessage: string;
}

export interface CloneVMActions {
    setOpen: (v: boolean) => void;
    setSourceVmId: (v: string) => void;
    setName: (v: string) => void;
    setTargetStorage: (v: string) => void;
    setTargetNode: (v: string) => void;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
    resetForm: () => void;
}

export interface CloneVMMeta {
    poolId: string;
    logsEndRef: React.RefObject<HTMLDivElement | null>;
    sanitizeDNSName: (input: string) => string;
}

export interface CloneVMContextValue {
    state: CloneVMState;
    actions: CloneVMActions;
    meta: CloneVMMeta;
}

export const CloneVMContext = createContext<CloneVMContextValue | null>(null);

export function useCloneVMContext(): CloneVMContextValue {
    const ctx = use(CloneVMContext);
    if (!ctx) {
        throw new Error(
            "useCloneVMContext must be used within a <CloneVMProvider>"
        );
    }
    return ctx;
}
