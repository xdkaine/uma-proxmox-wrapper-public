"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import {
    CreateVMContext,
    type CreateVMState,
    type CreateVMActions,
    type CreateVMMeta,
} from "./create-vm-context";

const STEPS = [
    { id: 1, title: "General" },
    { id: 2, title: "OS" },
    { id: 3, title: "System" },
    { id: 4, title: "Disks" },
    { id: 5, title: "CPU" },
    { id: 6, title: "Memory" },
    { id: 7, title: "Network" },
    { id: 8, title: "Confirm" },
];

interface CreateVMProviderProps {
    poolId: string;
    onSuccess?: () => void;
    children: React.ReactNode;
}

export function CreateVMProvider({
    poolId,
    onSuccess,
    children,
}: CreateVMProviderProps) {
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [step, setStep] = React.useState(1);

    // Form state
    const [node, setNode] = React.useState("");
    const [name, setName] = React.useState("");
    const [isoStorage, setIsoStorage] = React.useState("");
    const [isoImage, setIsoImage] = React.useState("");
    const [osType, setOsType] = React.useState("l26");
    const [machine, setMachine] = React.useState("q35");
    const [diskStorage, setDiskStorage] = React.useState("");
    const [diskSize, setDiskSize] = React.useState("32");
    const [sockets, setSockets] = React.useState("1");
    const [cores, setCores] = React.useState("2");
    const [cpuType, setCpuType] = React.useState("x86-64-v2-AES");
    const [memory, setMemory] = React.useState("2048");
    const [bridge, setBridge] = React.useState("");
    const [netModel, setNetModel] = React.useState("virtio");
    const [start, setStart] = React.useState(true);

    // Data fetching
    const { data: nodes } = useSWR(
        open ? "/api/proxmox/nodes" : null,
        fetcher,
        { refreshInterval: 2000 }
    );
    const { data: resources } = useSWR(
        open ? "/api/proxmox/storage" : null,
        fetcher
    );
    const { data: isoData } = useSWR(
        open && node ? `/api/proxmox/nodes/${node}/storage/isos` : null,
        fetcher
    );
    const { data: vnetsData } = useSWR(
        open ? "/api/proxmox/sdn/vnets?includeAll=true" : null,
        fetcher
    );
    const { data: globalLimitData } = useSWR(
        open ? `/api/proxmox/pools/global/limits` : null,
        fetcher
    );
    const { data: poolLimitData } = useSWR(
        open && poolId ? `/api/proxmox/pools/${poolId}/limits` : null,
        fetcher
    );

    // Derived
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const storages = Array.isArray(resources) ? resources : [];
    const diskStorages = storages.filter((s: any) => s.node === node);
    const isoStorages = (isoData?.data || []).filter(
        (s: any) => s.storage !== "local" && s.storage !== "local-lvm"
    );
    const selectedStorageData = isoStorages.find(
        (s: any) => s.storage === isoStorage
    );
    const isoList = selectedStorageData?.isos || [];

    const globalLimits = globalLimitData || {};
    const currentPoolVMs = poolLimitData?.usage?.vms || 0;
    const isLimitReached =
        globalLimits.maxVMs > 0 && currentPoolVMs >= globalLimits.maxVMs;
    const limitMessage = isLimitReached
        ? `Pool VM Cap Reached (${globalLimits.maxVMs} max)`
        : "";

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const payload = {
                name,
                pool: poolId,
                storage: diskStorage,
                iso: isoImage || undefined,
                cores: parseInt(cores),
                memory: parseInt(memory),
                diskSize: `${diskSize}G`,
                start,
                net0: `${netModel},bridge=${bridge}`,
                ostype: osType,
            };

            const res = await fetch(`/api/proxmox/nodes/${node}/qemu`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Failed to create VM");
            }

            toast.success("VM creation started");
            setOpen(false);
            setStep(1);
            if (onSuccess) onSuccess();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const state: CreateVMState = {
        step,
        totalSteps: STEPS.length,
        loading,
        open,
        node,
        name,
        isoStorage,
        isoImage,
        osType,
        machine,
        diskStorage,
        diskSize,
        sockets,
        cores,
        cpuType,
        memory,
        bridge,
        netModel,
        start,
        safeNodes,
        diskStorages,
        isoStorages,
        isoList,
        vnetsData,
        isLimitReached,
        limitMessage,
    };

    const actions: CreateVMActions = {
        setOpen,
        nextStep: () => setStep((s) => s + 1),
        prevStep: () => setStep((s) => s - 1),
        setNode,
        setName,
        setIsoStorage: (v: string) => {
            setIsoStorage(v);
            setIsoImage("");
        },
        setIsoImage,
        setOsType,
        setMachine,
        setDiskStorage,
        setDiskSize,
        setSockets,
        setCores,
        setCpuType,
        setMemory,
        setBridge,
        setNetModel,
        setStart,
        handleSubmit,
    };

    const metaValue: CreateVMMeta = { poolId, steps: STEPS };

    return (
        <CreateVMContext value={{ state, actions, meta: metaValue }}>
            {children}
        </CreateVMContext>
    );
}
