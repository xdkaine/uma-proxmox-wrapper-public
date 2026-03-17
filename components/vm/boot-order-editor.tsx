"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface BootOrderEditorProps {
    vmid: string;
    node: string;
    currentBoot?: string;
    onSave: () => void;
}

interface BootDevice {
    id: string;
    type: string;
    name: string;
    enabled: boolean;
}

export function BootOrderEditor({ vmid, node, currentBoot, onSave }: BootOrderEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [bootDevices, setBootDevices] = useState<BootDevice[]>(() => {
        // Parse boot order: "order=scsi0;ide2;net0"
        if (currentBoot) {
            const orderMatch = currentBoot.match(/order=([^;]+(?:;[^;]+)*)/);
            if (orderMatch) {
                const devices = orderMatch[1].split(';');
                return devices.map((dev, idx) => ({
                    id: dev,
                    type: dev.match(/^[a-z]+/)?.[0] || 'unknown',
                    name: dev,
                    enabled: true
                }));
            }
        }
        return [];
    });

    const moveDevice = (index: number, direction: 'up' | 'down') => {
        const newDevices = [...bootDevices];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= newDevices.length) return;

        [newDevices[index], newDevices[targetIndex]] = [newDevices[targetIndex], newDevices[index]];
        setBootDevices(newDevices);
    };

    const toggleDevice = (index: number) => {
        const newDevices = [...bootDevices];
        newDevices[index].enabled = !newDevices[index].enabled;
        setBootDevices(newDevices);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const enabledDevices = bootDevices.filter(d => d.enabled).map(d => d.id);
            const bootOrder = `order=${enabledDevices.join(';')}`;

            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ node, boot: bootOrder })
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to update boot order");
            } else {
                toast.success("Boot order updated");
                setIsOpen(false);
                onSave();
            }
        } catch (e) {
            toast.error("Failed to update boot order");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
                Boot Order
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Boot Order</DialogTitle>
                        <DialogDescription>
                            Drag devices to reorder boot priority
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        {bootDevices.map((device, index) => (
                            <div
                                key={device.id}
                                className="flex items-center gap-2 p-2 border rounded"
                            >
                                <input
                                    type="checkbox"
                                    checked={device.enabled}
                                    onChange={() => toggleDevice(index)}
                                    className="h-4 w-4"
                                />
                                <span className="flex-1 font-mono text-sm">{device.name}</span>
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => moveDevice(index, 'up')}
                                        disabled={index === 0}
                                    >
                                        ↑
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => moveDevice(index, 'down')}
                                        disabled={index === bootDevices.length - 1}
                                    >
                                        ↓
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {bootDevices.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No boot devices configured
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
