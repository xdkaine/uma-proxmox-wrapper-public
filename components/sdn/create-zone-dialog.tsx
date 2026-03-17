"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
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
import { toast } from "sonner";


export function CreateZoneDialog() {
    const [open, setOpen] = useState(false);
    const [zone, setZone] = useState("");
    const [type, setType] = useState("simple");
    const [mtu, setMtu] = useState("");
    const [loading, setLoading] = useState(false);
    const { mutate } = useSWRConfig();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/proxmox/sdn/zones", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ zone, type, mtu: mtu ? parseInt(mtu) : undefined }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Failed to create zone");

            toast.success(`Zone ${zone} created successfully`);

            setOpen(false);
            setZone("");
            setMtu("");
            mutate("/api/proxmox/sdn/zones");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">Create Zone</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Create SDN Zone</DialogTitle>
                        <DialogDescription>
                            Create a new Simple or VLAN zone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="zone" className="text-right">
                                Zone ID
                            </Label>
                            <Input
                                id="zone"
                                value={zone}
                                onChange={(e) => setZone(e.target.value)}
                                className="col-span-3"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="type" className="text-right">
                                Type
                            </Label>
                            {/* Using native select for now to avoid installing select component if risky, but plan implies premium UI. I should install select. */}
                            <select
                                id="type"
                                className="col-span-3 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                            >
                                <option value="simple">Simple</option>
                                <option value="vlan">VLAN</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="mtu" className="text-right">
                                MTU
                            </Label>
                            <Input
                                id="mtu"
                                type="number"
                                value={mtu}
                                onChange={(e) => setMtu(e.target.value)}
                                className="col-span-3"
                                placeholder="Optional"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Creating..." : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
