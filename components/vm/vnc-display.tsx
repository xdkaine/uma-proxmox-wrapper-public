"use client";

import React, { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const VncScreen = dynamic(() => import('react-vnc').then((mod) => mod.VncScreen), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mr-2" /> Loading VNC...</div>
});

export interface VncDisplayHandle {
    sendCtrlAltDel: () => void;
    sendKey: (keysym: number, code: string, down?: boolean) => void;
    sendKeys: (keys: { keysym: number; code: string }[]) => void;
    focus: () => void;
    machineReboot: () => void;
    machineShutdown: () => void;
    machineReset: () => void;
    clipboardPaste: (text: string) => void;
}

export interface VncDisplayProps {
    ref?: React.Ref<VncDisplayHandle>;
    url: string;
    password?: string;
    scaleViewport?: boolean;
    resizeSession?: boolean;
    viewOnly?: boolean;
    qualityPreset?: "low" | "balanced" | "high" | "performance";
    containerRef?: React.RefObject<HTMLDivElement | null>;
    onDisconnect?: () => void;
}

const QUALITY_LEVELS = {
    low: { qualityLevel: 2, compressionLevel: 9 },
    balanced: { qualityLevel: 6, compressionLevel: 6 },
    high: { qualityLevel: 9, compressionLevel: 2 },
    performance: { qualityLevel: 5, compressionLevel: 1 },
} as const;

type QualityPreset = keyof typeof QUALITY_LEVELS;

export function VncDisplay({
    ref,
    url,
    password,
    scaleViewport = true,
    resizeSession = true,
    viewOnly = false,
    qualityPreset = "balanced",
    containerRef,
    onDisconnect,
}: VncDisplayProps) {
    const localRef = useRef<HTMLDivElement>(null);
    const vncScreenRef = useRef<any>(null);

    const qualityConfig = useMemo(() => QUALITY_LEVELS[qualityPreset], [qualityPreset]);


    useEffect(() => {
        const rfb = vncScreenRef.current?.rfb;
        if (!rfb) return;

        if (typeof rfb.qualityLevel !== "undefined") {
            rfb.qualityLevel = qualityConfig.qualityLevel;
        }
        if (typeof rfb.compressionLevel !== "undefined") {
            rfb.compressionLevel = qualityConfig.compressionLevel;
        }
    }, [qualityConfig]);

    useImperativeHandle(ref, () => ({
        sendCtrlAltDel: () => {
            vncScreenRef.current?.sendCtrlAltDel?.();
        },
        sendKey: (keysym: number, code: string, down?: boolean) => {
            vncScreenRef.current?.sendKey?.(keysym, code, down);
        },
        sendKeys: (keys: { keysym: number; code: string }[]) => {
            const handle = vncScreenRef.current;
            if (!handle?.sendKey) return;
            for (const key of keys) {
                handle.sendKey(key.keysym, key.code, true);
            }
            for (const key of [...keys].reverse()) {
                handle.sendKey(key.keysym, key.code, false);
            }
        },
        focus: () => {
            vncScreenRef.current?.focus?.();
        },
        machineReboot: () => {
            vncScreenRef.current?.machineReboot?.();
        },
        machineShutdown: () => {
            vncScreenRef.current?.machineShutdown?.();
        },
        machineReset: () => {
            vncScreenRef.current?.machineReset?.();
        },
        clipboardPaste: (text: string) => {
            vncScreenRef.current?.clipboardPaste?.(text);
        },
    }), []);

    return (
        <div
            className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden rounded-md border border-slate-800"
            ref={containerRef ?? localRef}
        >
            <VncScreen
                ref={vncScreenRef}
                url={url}
                scaleViewport={scaleViewport}
                resizeSession={resizeSession}
                viewOnly={viewOnly}
                background="#000000"
                qualityLevel={qualityConfig.qualityLevel}
                compressionLevel={qualityConfig.compressionLevel}
                style={{
                    width: '100%',
                    height: '100%',
                }}
                rfbOptions={{
                    credentials: password ? { username: '', target: '', password } : undefined,
                }}
                onDisconnect={onDisconnect}
            />
        </div>
    );
}
