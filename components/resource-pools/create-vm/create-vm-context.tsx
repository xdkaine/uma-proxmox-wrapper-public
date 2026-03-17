"use client";

import { createContext, use } from "react";

// ── Form State ────────────────────────────────────────────────────

export interface CreateVMFormState {
    node: string;
    name: string;
    isoStorage: string;
    isoImage: string;
    osType: string;
    machine: string;
    diskStorage: string;
    diskSize: string;
    sockets: string;
    cores: string;
    cpuType: string;
    memory: string;
    bridge: string;
    netModel: string;
    start: boolean;
}

export interface CreateVMState extends CreateVMFormState {
    step: number;
    totalSteps: number;
    loading: boolean;
    open: boolean;
    // Fetched data
    safeNodes: any[];
    diskStorages: any[];
    isoStorages: any[];
    isoList: any[];
    vnetsData: any;
    // Limits
    isLimitReached: boolean;
    limitMessage: string;
}

export interface CreateVMActions {
    setOpen: (open: boolean) => void;
    nextStep: () => void;
    prevStep: () => void;
    // Form setters
    setNode: (v: string) => void;
    setName: (v: string) => void;
    setIsoStorage: (v: string) => void;
    setIsoImage: (v: string) => void;
    setOsType: (v: string) => void;
    setMachine: (v: string) => void;
    setDiskStorage: (v: string) => void;
    setDiskSize: (v: string) => void;
    setSockets: (v: string) => void;
    setCores: (v: string) => void;
    setCpuType: (v: string) => void;
    setMemory: (v: string) => void;
    setBridge: (v: string) => void;
    setNetModel: (v: string) => void;
    setStart: (v: boolean) => void;
    // Submit
    handleSubmit: () => Promise<void>;
}

export interface CreateVMMeta {
    poolId: string;
    steps: { id: number; title: string }[];
}

export interface CreateVMContextValue {
    state: CreateVMState;
    actions: CreateVMActions;
    meta: CreateVMMeta;
}

export const CreateVMContext = createContext<CreateVMContextValue | null>(null);

export function useCreateVMContext(): CreateVMContextValue {
    const ctx = use(CreateVMContext);
    if (!ctx) {
        throw new Error(
            "useCreateVMContext must be used within a <CreateVMProvider>"
        );
    }
    return ctx;
}
