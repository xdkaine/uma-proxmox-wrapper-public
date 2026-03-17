"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Database } from "lucide-react";
import { useCloneVMContext } from "./clone-vm-context";

export function CloneForm() {
    const { state, actions, meta } = useCloneVMContext();

    return (
        <form onSubmit={actions.handleSubmit}>
            <div className="grid gap-4 py-4">
                {/* Source VM */}
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="source" className="text-right">Source</Label>
                    <div className="col-span-3">
                        <Select value={state.sourceVmId} onValueChange={actions.setSourceVmId} required>
                            <SelectTrigger>
                                <SelectValue placeholder={state.safeTemplates.length === 0 ? "Loading..." : "Select Template"} />
                            </SelectTrigger>
                            <SelectContent>
                                {state.safeTemplates.map((t: any) => (
                                    <SelectItem key={t.vmid} value={String(t.vmid)}>
                                        {t.vmid}: {t.name}
                                    </SelectItem>
                                ))}
                                {state.safeTemplates.length === 0 && (
                                    <SelectItem value="none" disabled>No templates found</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Target Node */}
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="node" className="text-right">Target Node</Label>
                    <div className="col-span-3">
                        <Select value={state.targetNode} onValueChange={actions.setTargetNode} required>
                            <SelectTrigger>
                                <SelectValue placeholder={state.safeNodes.length === 0 ? "Loading..." : "Select Node"} />
                            </SelectTrigger>
                            <SelectContent>
                                {state.safeNodes.map((n: any) => (
                                    <SelectItem key={n.node} value={n.node}>
                                        <div className="flex items-center justify-between gap-4 w-full min-w-[280px]">
                                            <span className="font-medium">{n.node}</span>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                CPU: {((n.cpu || 0) * 100).toFixed(1)}% | RAM: {n.maxmem ? ((n.mem / n.maxmem) * 100).toFixed(1) : 0}%
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Storage */}
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="storage" className="text-right">Storage</Label>
                    <div className="col-span-3">
                        <Select value={state.targetStorage} onValueChange={actions.setTargetStorage} disabled={!state.targetNode}>
                            <SelectTrigger>
                                <SelectValue placeholder={!state.targetNode ? "Select Node first" : "Same as Source"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="same">Same as Source</SelectItem>
                                {state.safeStorageList.map((s: any) => (
                                    <SelectItem key={s.id} value={s.storage}>
                                        <div className="flex items-center gap-2">
                                            <Database className="h-3 w-3 text-muted-foreground" />
                                            <span>{s.storage}</span>
                                            <span className="text-xs text-muted-foreground">
                                                ({Math.round(s.free / 1024 / 1024 / 1024)}GB free)
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Name */}
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Name</Label>
                    <Input
                        id="name"
                        value={state.name}
                        onChange={(e) => actions.setName(meta.sanitizeDNSName(e.target.value))}
                        placeholder="my-vm-name (lowercase, hyphens only)"
                        pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
                        className="col-span-3"
                    />
                </div>
            </div>

            <div className="flex justify-end">
                <Button type="submit" disabled={state.isLoading || !state.sourceVmId || !state.targetNode}>
                    Clone
                </Button>
            </div>
        </form>
    );
}
