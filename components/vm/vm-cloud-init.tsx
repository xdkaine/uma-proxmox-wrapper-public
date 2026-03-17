"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; // Assuming we have this or use Input
import { toast } from "sonner";
import { Loader2, Pencil, RotateCw, Save } from "lucide-react";
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

interface VMCloudInitProps {
    vmid: string;
    node: string;
}

interface CloudInitItem {
    key: string;
    label: string;
    value: string;
    type: "string" | "password" | "textarea";
    description?: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const CI_DEFINITIONS: Record<string, Omit<CloudInitItem, "value" | "key">> = {
    ciuser: {
        label: "User",
        type: "string",
        description: "Cloud-Init User. Defaults to default OS user if not set."
    },
    cipassword: {
        label: "Password",
        type: "password",
        description: "Cloud-Init User Password."
    },
    sshkeys: {
        label: "SSH Public Key",
        type: "textarea",
        description: "Public keys to add to authorized_keys."
    },
    searchdomain: {
        label: "DNS Domain",
        type: "string",
        description: "DNS Search Domain."
    },
    nameserver: {
        label: "DNS Servers",
        type: "string",
        description: "DNS Nameservers (space separated)."
    },
    ipconfig0: {
        label: "IP Config (net0)",
        type: "string",
        description: "IP configuration for net0. Format: ip=CIDR,gw=gateway (e.g., ip=dhcp or ip=192.168.1.5/24,gw=192.168.1.1)"
    },
    ipconfig1: {
        label: "IP Config (net1)",
        type: "string",
        description: "IP configuration for net1."
    }
};

export function VMCloudInit({ vmid, node }: VMCloudInitProps) {
    const { data: config, error, isLoading, mutate } = useSWR(
        `/api/proxmox/vm/${vmid}/config?node=${node}`,
        fetcher
    );

    const [editItem, setEditItem] = useState<CloudInitItem | null>(null);
    const [editValue, setEditValue] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Parse items
    const items: CloudInitItem[] = Object.keys(CI_DEFINITIONS).map(key => {
        const def = CI_DEFINITIONS[key];
        const value = config ? (config[key] || "") : "";
        return {
            key,
            ...def,
            value: value === "********" ? "********" : value // API might mask password
        };
    });

    // Also include dynamic ipconfig items if they exist beyond 0/1, but for now stick to static list or just 0

    const handleEdit = (item: CloudInitItem) => {
        setEditItem(item);
        // If it's a password, clear it on edit so user enters new one. 
        // Proxmox API doesn't return the actaul password usually.
        setEditValue(item.type === "password" ? "" : item.value);
    };

    const handleSave = async () => {
        if (!editItem) return;
        setIsSaving(true);
        try {
            const payload: any = { node };
            payload[editItem.key] = editValue;

            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Failed to update Cloud-Init");
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
                        Configure Cloud-Init settings.
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
                            <TableHead className="w-[200px]">Setting</TableHead>
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
                        ) : (
                            items.map((item) => (
                                <TableRow
                                    key={item.key}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onDoubleClick={() => handleEdit(item)}
                                >
                                    <TableCell className="font-medium">{item.label}</TableCell>
                                    <TableCell className="font-mono text-sm truncate max-w-[400px]">
                                        {item.type === "password" && item.value ? "********" : (item.value || "-")}
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
                        <DialogDescription>{editItem?.description}</DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        {editItem?.type === "textarea" ? (
                            <Textarea
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="font-mono min-h-[150px]"
                                placeholder="Enter public keys..."
                            />
                        ) : (
                            <Input
                                type={editItem?.type === "password" ? "password" : "text"}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                placeholder={editItem?.type === "password" ? "Enter new password" : `Enter ${editItem?.label}`}
                            />
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
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
