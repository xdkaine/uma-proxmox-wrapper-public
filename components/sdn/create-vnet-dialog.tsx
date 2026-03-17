"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useSWRConfig } from "swr";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ProxmoxZone } from "@/lib/proxmox-api";
import { useNextVnetTag } from "@/lib/swr-hooks";

interface CreateVnetDialogProps {
    zones: ProxmoxZone[];
    username: string;
}

export function CreateVnetDialog({ zones, username }: CreateVnetDialogProps) {
    const [open, setOpen] = useState(false);

    const [selectedZone, setSelectedZone] = useState("");

    const [vnet, setVnet] = useState(`DEV${username}`.slice(0, 8));
    const [tag, setTag] = useState("");
    const [alias, setAlias] = useState("");
    const [vlanaware, setVlanaware] = useState(true);

    const [isLoading, setIsLoading] = useState(false);
    const { mutate } = useSWRConfig();


    const { nextTag, suggestedName, isLoading: isLoadingNextTag, mutate: mutateNextTag } = useNextVnetTag(
        open && selectedZone ? selectedZone : null
    );


    useEffect(() => {
        if (open && zones.length > 0) {

            const userlabsZone = zones.find(z => z.zone.toLowerCase().includes('userlab'));
            const initialZone = userlabsZone ? userlabsZone.zone : (selectedZone || zones[0].zone);

            if (initialZone !== selectedZone) setSelectedZone(initialZone);
        }
    }, [open, zones]);


    useEffect(() => {
        if (nextTag !== undefined) {
            setTag(nextTag.toString());
        }
    }, [nextTag]);

    useEffect(() => {
        if (suggestedName) {
            setVnet(suggestedName);
        }
    }, [suggestedName]);


    useEffect(() => {
        setAlias(`${tag || '0'}_DEV_${username}`);
    }, [tag, username]);


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch("/api/proxmox/sdn/vnets", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    vnet,
                    zone: selectedZone,
                    tag: tag ? parseInt(tag) : undefined,
                    alias,
                    vlanaware,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to create VNET");
            }

            toast.success("VNET created successfully");
            mutate("/api/proxmox/sdn/vnets");
            mutateNextTag(); // Refresh next tag after creation
            setOpen(false);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Create VNET
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create VNET</DialogTitle>
                    <DialogDescription>
                        Add a new VNET. Select a zone and configure details.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="zone" className="text-right">Zone</Label>
                            <Select
                                value={selectedZone}
                                onValueChange={setSelectedZone}
                                required
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select a zone" />
                                </SelectTrigger>
                                <SelectContent>
                                    {zones.map((z) => (
                                        <SelectItem key={z.zone} value={z.zone}>
                                            {z.zone}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="vnet" className="text-right">
                                VNET Name
                            </Label>
                            <div className="col-span-3 space-y-1">
                                <Input
                                    id="vnet"
                                    value={vnet}
                                    onChange={(e) => setVnet(e.target.value.slice(0, 8))}
                                    placeholder={isLoadingNextTag ? "Loading..." : `DEV${username}`.slice(0, 8)}
                                    maxLength={8}
                                    required
                                />
                                <p className="text-xs text-muted-foreground">
                                    Format: DEV + username (8 chars max). Multiple VNETs: DEVtpha1, DEVtpha2, etc.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="tag" className="text-right">
                                Tag (VLAN)
                            </Label>
                            <Input
                                id="tag"
                                type="number"
                                value={tag}
                                onChange={(e) => setTag(e.target.value)}
                                className="col-span-3"
                                placeholder={isLoadingNextTag ? "Loading..." : "Auto-assigned"}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="alias" className="text-right">
                                Alias
                            </Label>
                            <Input
                                id="alias"
                                value={alias}
                                onChange={(e) => setAlias(e.target.value)}
                                className="col-span-3"
                                placeholder={`${tag}_DEV_${username}`}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="vlanaware" className="text-right">
                                VLAN Aware
                            </Label>
                            <div className="col-span-3 flex items-center">
                                <input
                                    id="vlanaware"
                                    type="checkbox"
                                    checked={vlanaware}
                                    onChange={(e) => setVlanaware(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                <span className="ml-2 text-sm text-muted-foreground">
                                    Allow VMs to handle their own VLAN tagging
                                </span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isLoading || !selectedZone || isLoadingNextTag}>
                            {isLoading ? "Creating..." : "Create VNET"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
