import useSWR from "swr";
import { ProxmoxPool, ProxmoxZone, ProxmoxVnet } from "./proxmox-api";

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
});

export function usePools() {
    const { data, error, isLoading } = useSWR<{ pools: ProxmoxPool[] }>("/api/proxmox/pools", fetcher, {
        refreshInterval: 5000, // Poll every 5 seconds for real-time updates
    });

    return {
        pools: data?.pools,
        isLoading,
        isError: error,
    };
}

export function useZones() {
    const { data, error, isLoading } = useSWR<{ zones: ProxmoxZone[] }>("/api/proxmox/sdn/zones", fetcher, {
        refreshInterval: 10000, // Poll every 10 seconds
    });

    return {
        zones: data?.zones,
        isLoading,
        isError: error,
    };
}

export function useVnets() {
    const { data, error, isLoading } = useSWR<{ vnets: ProxmoxVnet[] }>("/api/proxmox/sdn/vnets", fetcher, {
        refreshInterval: 10000,
    });

    return {
        vnets: data?.vnets,
        isLoading,
        isError: error,
    };
}

export function useNextVnetTag(zone: string | null) {
    const { data, error, isLoading, mutate } = useSWR<{ nextTag: number; suggestedName: string }>(
        zone ? `/api/proxmox/sdn/vnets/next-tag?zone=${encodeURIComponent(zone)}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
        }
    );

    return {
        nextTag: data?.nextTag,
        suggestedName: data?.suggestedName,
        isLoading,
        isError: error,
        mutate,
    };
}

export function useACLs() {
    const { data, error, isLoading } = useSWR<{ acls: any[] }>("/api/proxmox/access/acl", fetcher, {
        refreshInterval: 15000,
    });

    return {
        acls: data?.acls,
        isLoading,
        isError: error,
    };
}

import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

export function useUser() {
    const { data, error, isLoading } = useSWR<{ user: any; isLoggedIn: boolean }>("/api/user", fetcher);

    return {
        user: data?.user,
        isLoggedIn: data?.isLoggedIn,
        isLoading,
        isError: error,
    };
}
