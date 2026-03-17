"use client";

import { useMemo, useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import { PoolDetailsContext, type PoolDetailsContextValue } from "./pool-detail-context";

interface PoolDetailsProviderProps {
    poolId: string;
    children: React.ReactNode;
}
const EMPTY_ARRAY: any[] = [];

export function PoolDetailsProvider({ poolId, children }: PoolDetailsProviderProps) {
    const { data, isLoading, error, mutate } = useSWR(
        `/api/proxmox/pools/${poolId}`,
        fetcher,
        {
            refreshInterval: 5000,
            dedupingInterval: 2000,
        }
    );

    const handlePowerAction = useCallback(async (vmid: string, node: string, action: string) => {
        try {
            toast.info(`Initiating ${action} for VM ${vmid}…`);
            const res = await fetch(`/api/proxmox/vm/${vmid}/power`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node, action }),
            });
            const result = await res.json();

            if (!res.ok) {
                toast.error(result.error || `Failed to ${action} VM`);
            } else {
                toast.success(`VM ${action} task started`);
                setTimeout(() => mutate(), 2000);
            }
        } catch (e) {
            toast.error("Action failed");
        }
    }, [mutate]);

    const pool = data?.pool;
    const nodes = data?.nodes;
    const members = Array.isArray(pool?.members) ? pool.members : EMPTY_ARRAY;
    const isOffline = !!(error && data);

    const contextValue = useMemo<PoolDetailsContextValue>(() => ({
        state: {
            pool,
            nodes,
            members,
            isLoading,
            error,
            isOffline,
        },
        actions: {
            handlePowerAction,
            mutate,
        },
    }), [pool, nodes, members, isLoading, error, isOffline, handlePowerAction, mutate]);

    return (
        <PoolDetailsContext.Provider value={contextValue}>
            {children}
        </PoolDetailsContext.Provider>
    );
}
