"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import {
    CloneVMContext,
    type CloneVMState,
    type CloneVMActions,
    type CloneVMMeta,
} from "./clone-vm-context";

interface CloneVMProviderProps {
    poolId: string;
    children: React.ReactNode;
}

export function CloneVMProvider({ poolId, children }: CloneVMProviderProps) {
    const [open, setOpen] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const [cloningStatus, setCloningStatus] = React.useState<string | null>(null);
    const [pollingUpid, setPollingUpid] = React.useState<{ node: string; upid: string } | null>(null);
    const [taskLogs, setTaskLogs] = React.useState<any[]>([]);
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const [sourceVmId, setSourceVmId] = React.useState("");
    const [name, setName] = React.useState("");
    const [targetStorage, setTargetStorage] = React.useState("");
    const [targetNode, setTargetNode] = React.useState("");

    const logsEndRef = React.useRef<HTMLDivElement>(null);
    const { mutate } = useSWRConfig();

    // Data fetching
    const { data: templates } = useSWR(open ? "/api/proxmox/templates" : null, fetcher);
    const { data: nodes } = useSWR(open ? "/api/proxmox/nodes" : null, fetcher, { refreshInterval: 2000 });
    const storageUrl = open ? `/api/proxmox/storage${targetNode ? `?node=${targetNode}` : ""}` : null;
    const { data: storageList } = useSWR(storageUrl, fetcher);
    const { data: globalLimitData } = useSWR(open ? `/api/proxmox/pools/global/limits` : null, fetcher);
    const { data: poolLimitData } = useSWR(open && poolId ? `/api/proxmox/pools/${poolId}/limits` : null, fetcher);

    const safeTemplates = Array.isArray(templates) ? templates : [];
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const safeStorageList = (Array.isArray(storageList) ? storageList : []).filter(
        (s: any) => s.storage !== "local" && s.storage !== "local-lvm"
    );

    const globalLimits = globalLimitData || {};
    const currentPoolVMs = poolLimitData?.usage?.vms || 0;
    const isLimitReached = globalLimits.maxVMs > 0 && currentPoolVMs >= globalLimits.maxVMs;
    const limitMessage = isLimitReached ? `Pool VM Cap Reached (${globalLimits.maxVMs} max)` : "";

    const sanitizeDNSName = (input: string): string =>
        input
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/^-+/, "")
            .replace(/-+$/, "")
            .replace(/-+/g, "-")
            .slice(0, 63);

    // Auto-scroll logs
    React.useEffect(() => {
        if (logsEndRef.current && isLoading) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [taskLogs, isLoading]);

    // Polling
    React.useEffect(() => {
        if (!pollingUpid) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/proxmox/tasks/status?node=${pollingUpid.node}&upid=${pollingUpid.upid}&logs=true`);
                const data = await res.json();
                if (typeof data.progress === "number") setProgress(data.progress);
                if (data.logs && Array.isArray(data.logs)) setTaskLogs(data.logs);

                if (data.status === "stopped") {
                    clearInterval(interval);
                    setPollingUpid(null);
                    if (data.exitstatus === "OK") {
                        setProgress(100);
                        setCloningStatus("Completed!");
                        toast.success("VM cloned successfully");
                        setTimeout(() => {
                            setOpen(false);
                            mutate(`/api/proxmox/pools/${poolId}`);
                            mutate("/api/proxmox/pools");
                            resetForm();
                        }, 1000);
                    } else {
                        setCloningStatus("Failed");
                        setErrorMessage(data.exitstatus || "Unknown error");
                        toast.error("Cloning failed: " + data.exitstatus);
                    }
                } else {
                    setCloningStatus("Cloning in progress...");
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [pollingUpid, poolId, mutate]);

    const resetForm = () => {
        setSourceVmId("");
        setName("");
        setTargetStorage("");
        setTargetNode("");
        setProgress(0);
        setCloningStatus(null);
        setIsLoading(false);
        setErrorMessage(null);
        setTaskLogs([]);
        setPollingUpid(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setCloningStatus("Initiating clone...");
        setProgress(5);
        try {
            const res = await fetch("/api/proxmox/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceVmId,
                    name,
                    poolId,
                    fullClone: true,
                    storage: targetStorage === "same" ? undefined : targetStorage,
                    target: targetNode || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                const msg = data.error || "Failed to clone VM";
                toast.error(msg);
                setIsLoading(false);
                setCloningStatus("Failed");
                setErrorMessage(msg);
            } else if (data.upid) {
                const parts = data.upid.split(":");
                const taskNode = parts.length >= 2 ? parts[1] : targetNode || "pve";
                setPollingUpid({ node: taskNode, upid: data.upid });
            } else {
                toast.success("VM cloned successfully");
                setOpen(false);
                mutate(`/api/proxmox/pools/${poolId}`);
                mutate("/api/proxmox/pools");
                resetForm();
            }
        } catch {
            toast.error("An unexpected error occurred");
            setIsLoading(false);
            setCloningStatus("Failed");
            setErrorMessage("An unexpected error occurred");
        }
    };

    const state: CloneVMState = {
        open, isLoading, progress, cloningStatus, errorMessage, taskLogs,
        sourceVmId, name, targetStorage, targetNode,
        safeTemplates, safeNodes, safeStorageList,
        isLimitReached, limitMessage,
    };

    const actions: CloneVMActions = {
        setOpen: (v) => { if (!isLoading) setOpen(v); },
        setSourceVmId, setName, setTargetStorage, setTargetNode,
        handleSubmit, resetForm,
    };

    const metaValue: CloneVMMeta = { poolId, logsEndRef, sanitizeDNSName };

    return (
        <CloneVMContext value={{ state, actions, meta: metaValue }}>
            {children}
        </CloneVMContext>
    );
}
