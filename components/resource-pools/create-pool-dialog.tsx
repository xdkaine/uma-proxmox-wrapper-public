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

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { User, Users } from "lucide-react";

interface CreatePoolDialogProps {
    username?: string;
    userGroups?: string[];
}

export function CreatePoolDialog({ username, userGroups = [] }: CreatePoolDialogProps) {
    const [open, setOpen] = useState(false);
    const [comment, setComment] = useState("");
    const [ownerType, setOwnerType] = useState<"user" | "group">("user");
    const [selectedGroup, setSelectedGroup] = useState<string>("");

    const [loading, setLoading] = useState(false);
    const { mutate } = useSWRConfig();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const owner = ownerType === "user"
                ? { type: "user", name: username }
                : { type: "group", name: selectedGroup };

            const res = await fetch("/api/proxmox/pools", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    comment,
                    owner
                }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Failed to create pool");

            toast.success(`Pool ${data.poolid} created successfully`);

            setOpen(false);
            setComment("");
            setOwnerType("user");
            setSelectedGroup("");
            mutate("/api/proxmox/pools"); // Refresh the list immediately
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>Create Pool</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Create Resource Pool</DialogTitle>
                        <DialogDescription>
                            Add a new resource pool to your Proxmox cluster.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="owner" className="text-right">
                                Owner
                            </Label>
                            <div className="col-span-3">
                                <Select
                                    value={ownerType === "user" ? "myself" : selectedGroup}
                                    onValueChange={(val) => {
                                        if (val === "myself") {
                                            setOwnerType("user");
                                            setSelectedGroup("");
                                        } else {
                                            setOwnerType("group");
                                            setSelectedGroup(val);
                                        }
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Owner" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="myself">
                                            <div className="flex items-center gap-2">
                                                <User className="h-4 w-4" />
                                                <span>Myself ({username})</span>
                                            </div>
                                        </SelectItem>
                                        {userGroups.map((group) => (
                                            <SelectItem key={group} value={group}>
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4" />
                                                    <span>{group}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="comment" className="text-right">
                                Comment
                            </Label>
                            <Input
                                id="comment"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                className="col-span-3"
                                placeholder="Optional description"
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
