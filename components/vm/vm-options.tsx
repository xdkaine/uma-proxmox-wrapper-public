"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Pencil, RotateCw } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface VMOptionsProps {
    vmid: string;
    node: string;
}

interface OptionItem {
    key: string;
    label: string;
    value: any;
    displayValue: string;
    type: "boolean" | "string" | "number" | "select";
    options?: { label: string; value: string }[]; // For select type
    description?: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Definition of supported options and their metadata
const OPTION_DEFINITIONS: Record<string, Omit<OptionItem, "value" | "displayValue" | "key">> = {
    name: {
        label: "Name",
        type: "string",
        description: "The name of the VM."
    },
    onboot: {
        label: "Start at boot",
        type: "boolean",
        description: "Start VM automatically when the node starts."
    },
    startup: {
        label: "Start/Shutdown order",
        type: "string",
        description: "Order=any,up=any,down=any (e.g., order=1,up=60,down=60)"
    },
    ostype: {
        label: "OS Type",
        type: "select",
        options: [
            { label: "Linux 2.4 Kernel", value: "l24" },
            { label: "Linux 2.6 - 6.x Kernel", value: "l26" },
            { label: "Other", value: "other" },
            { label: "Microsoft Windows 11/2022", value: "win11" },
            { label: "Microsoft Windows 10/2016/2019", value: "win10" },
            { label: "Microsoft Windows 8.x/2012/2012r2", value: "win8" },
            { label: "Microsoft Windows 7/2008r2", value: "win7" },
            { label: "Microsoft Windows Vista/2008", value: "wxp" }, // map to closest
            { label: "Microsoft Windows XP/2003", value: "w2k" }, // map to closest
            { label: "Solaris Kernel", value: "solaris" },
        ],
        description: "Operating System type used for optimization."
    },
    boot: {
        label: "Boot Order",
        type: "string", // Complex string in Proxmox, keep as string for now or parse later
        description: "Boot device order."
    },
    tablet: {
        label: "Use tablet for pointer",
        type: "boolean",
        description: "Use tablet input device (better mouse sync)."
    },
    hotplug: {
        label: "Hotplug",
        type: "string", // technically a comma-separated list like 'disk,network,usb'
        description: "Allow hotplugging devices (disk, network, usb)."
    },
    acpi: {
        label: "ACPI support",
        type: "boolean",
        description: "Advanced Configuration and Power Interface."
    },
    kvm: {
        label: "KVM hardware virtualization",
        type: "boolean",
        description: "Enable KVM hardware virtualization."
    },
    freeze: {
        label: "Freeze CPU at startup",
        type: "boolean",
        description: "Start the VM in a paused state."
    },
    localtime: {
        label: "Use local time for RTC",
        type: "boolean",
        description: "Set the Real Time Clock to local time."
    },
    startdate: {
        label: "RTC start date",
        type: "string",
        description: "Set the initial date of the RTC (now | YYYY-MM-DD)."
    },
    agent: {
        label: "QEMU Guest Agent",
        type: "boolean",
        description: "Enable QEMU Guest Agent communication."
    },
    protection: {
        label: "Protection",
        type: "boolean",
        description: "Prevent VM from being removed."
    },
    spice_enhancements: {
        label: "Spice Enhancements",
        type: "string",
        description: "Spice foldersharing, videostreaming."
    },
    vmstatestorage: {
        label: "VM State storage",
        type: "string",
        description: "Storage for VM state (snapshots/suspend)."
    },
    description: {
        label: "Description",
        type: "string", // Multiline normally, but simple string for basic edit
        description: "Notes about the VM."
    }
};

export function VMOptions({ vmid, node }: VMOptionsProps) {
    const { data: config, error, isLoading, mutate } = useSWR(
        `/api/proxmox/vm/${vmid}/config?node=${node}`,
        fetcher
    );

    const [editItem, setEditItem] = useState<OptionItem | null>(null);
    const [editValue, setEditValue] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Parse config into option items
    const options: OptionItem[] = Object.keys(OPTION_DEFINITIONS).map((key) => {
        const def = OPTION_DEFINITIONS[key];
        let value = config ? config[key] : undefined;
        let displayValue = "-";

        if (def.type === "boolean") {
            // Proxmox often returns 1/0 for boolean
            value = value === 1 || value === "1" || value === true;
            displayValue = value ? "Yes" : "No";
            // Default handling
            if (config && config[key] === undefined) {
                // Some defaults:
                if (key === "acpi" || key === "kvm" || key === "tablet") {
                    value = true;
                    displayValue = "Yes (Default)";
                } else {
                    value = false;
                    displayValue = "No (Default)";
                }
            }
        } else if (def.type === "select") {
            const result = def.options?.find(opt => opt.value === value);
            displayValue = result ? result.label : (value || "Default");
        } else {
            // String/Number
            displayValue = value !== undefined ? String(value) : "Default";
            if (value === undefined) value = "";
        }

        return {
            key,
            ...def,
            value,
            displayValue,
        };
    });

    const handleEdit = (item: OptionItem) => {
        setEditItem(item);
        setEditValue(item.value);
    };

    const handleSave = async () => {
        if (!editItem) return;
        setIsSaving(true);
        try {
            const payload: any = { node };

            // Format value based on type
            if (editItem.type === "boolean") {
                payload[editItem.key] = editValue ? 1 : 0;
            } else {
                payload[editItem.key] = editValue;
            }

            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: "PUT", // Using existing PUT endpoint which merges options
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Failed to update option");
            } else {
                toast.success(`${editItem.label} updated`);
                mutate();
                setEditItem(null);
            }
        } catch (err) {
            toast.error("Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <p className="text-sm text-muted-foreground">
                        Double-click an option to edit it.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => mutate()}>
                    <RotateCw className="mr-2 h-4 w-4" />
                    Reload
                </Button>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[200px]">Option</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead className="w-[100px] text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : options.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                    No options found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            options.map((item) => (
                                <TableRow
                                    key={item.key}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onDoubleClick={() => handleEdit(item)}
                                >
                                    <TableCell className="font-medium">{item.label}</TableCell>
                                    <TableCell className="font-mono text-sm truncate max-w-[400px]" title={item.displayValue}>
                                        {item.displayValue}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit {editItem?.label}</DialogTitle>
                        <DialogDescription>
                            {editItem?.description}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        {editItem?.type === "boolean" && (
                            <div className="flex items-center space-x-2">
                                <Switch
                                    checked={!!editValue}
                                    onCheckedChange={setEditValue}
                                    id="option-switch"
                                />
                                <Label htmlFor="option-switch">
                                    {editValue ? "Enabled" : "Disabled"}
                                </Label>
                            </div>
                        )}
                        {editItem?.type === "string" && (
                            <Input
                                value={editValue || ""}
                                onChange={(e) => setEditValue(e.target.value)}
                                placeholder={`Enter ${editItem.label}`}
                            />
                        )}
                        {editItem?.type === "select" && (
                            <Select value={editValue || ""} onValueChange={setEditValue}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select an option" />
                                </SelectTrigger>
                                <SelectContent>
                                    {editItem.options?.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditItem(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
