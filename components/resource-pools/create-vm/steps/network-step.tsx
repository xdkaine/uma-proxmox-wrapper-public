"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateVMContext } from "../create-vm-context";

export function NetworkStep() {
    const { state, actions } = useCreateVMContext();
    const vnets = state.vnetsData?.vnets || [];
    const userlabVnets = vnets.filter((v: any) => v.zone?.toLowerCase().includes("userlab"));
    const altzoneVnets = vnets.filter((v: any) => v.zone?.toLowerCase().includes("altzone"));

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Bridge / VNet</Label>
                <Select value={state.bridge} onValueChange={actions.setBridge}>
                    <SelectTrigger><SelectValue placeholder="Select Network Bridge" /></SelectTrigger>
                    <SelectContent>
                        {userlabVnets.length > 0 && (
                            <>
                                <SelectItem value="__header_userlabs" disabled className="font-semibold text-xs text-muted-foreground">— Userlabs Zone —</SelectItem>
                                {userlabVnets.map((v: any) => (
                                    <SelectItem key={v.vnet} value={v.vnet}>
                                        {v.vnet} {v.alias ? `(${v.alias})` : ""}
                                    </SelectItem>
                                ))}
                            </>
                        )}
                        {altzoneVnets.length > 0 && (
                            <>
                                <SelectItem value="__header_altzone" disabled className="font-semibold text-xs text-muted-foreground">— AltZone (Deprecated) —</SelectItem>
                                {altzoneVnets.map((v: any) => (
                                    <SelectItem key={v.vnet} value={v.vnet}>
                                        {v.vnet} {v.alias ? `(${v.alias})` : ""}
                                    </SelectItem>
                                ))}
                            </>
                        )}
                        {vnets.length === 0 && (
                            <SelectItem value="vmbr0">vmbr0 (Default)</SelectItem>
                        )}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Select a VNet from Userlabs or AltZone for network connectivity.</p>
            </div>
            <div className="space-y-2">
                <Label>Model</Label>
                <Select value={state.netModel} onValueChange={actions.setNetModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="virtio">VirtIO (Paravirtualized)</SelectItem>
                        <SelectItem value="e1000">Intel E1000</SelectItem>
                        <SelectItem value="rtl8139">Realtek RTL8139</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
