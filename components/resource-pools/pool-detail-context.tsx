"use client";

import { createContext, use } from "react";

// ── State ──────────────────────────────────────────────────────────

export interface PoolDetailsState {
    pool: any | undefined;
    nodes: any[] | undefined;
    members: any[];
    isLoading: boolean;
    error: any;
    isOffline: boolean;
}

// ── Actions ────────────────────────────────────────────────────────

export interface PoolDetailsActions {
    handlePowerAction: (vmid: string, node: string, action: string) => Promise<void>;
    mutate: () => void;
}

// ── Context ────────────────────────────────────────────────────────

export interface PoolDetailsContextValue {
    state: PoolDetailsState;
    actions: PoolDetailsActions;
}

export const PoolDetailsContext =
    createContext<PoolDetailsContextValue | null>(null);

export function usePoolDetailsContext(): PoolDetailsContextValue {
    const ctx = use(PoolDetailsContext);
    if (!ctx) {
        throw new Error(
            "usePoolDetailsContext must be used within a <PoolDetailsProvider>"
        );
    }
    return ctx;
}
