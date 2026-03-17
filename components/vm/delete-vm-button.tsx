"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteVMButtonProps {
    vmid: string;
    node: string;
    type: string;
    poolId: string;
}

export function DeleteVMButton({ vmid, node, type, poolId }: DeleteVMButtonProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const handleDelete = async () => {
        if (confirmText !== vmid) {
            toast.error("Confirmation ID does not match");
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}?node=${node}&type=${type}`, {
                method: "DELETE",
            });
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || "Failed to delete VM");
                setIsLoading(false);
            } else {
                toast.success("VM Deletion initiated");
                setIsOpen(false);
                // Redirect back to pool immediately or wait?
                // Proxmox deletion is async.
                router.push(`/admin/pools/${poolId}`);
                router.refresh();
            }
        } catch (error) {
            toast.error("Failed to communicate with server");
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete VM
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Unknown Danger: Delete VM {vmid}?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                        <p>
                            This action cannot be undone. This will permanently delete the
                            Virtual Machine and all associated disks.
                        </p>
                        <div className="space-y-2 p-3 bg-muted rounded-md border border-destructive/20">
                            <Label htmlFor="confirm-id" className="text-xs font-semibold uppercase text-muted-foreground">
                                Type "{vmid}" to confirm
                            </Label>
                            <Input
                                id="confirm-id"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder={vmid}
                                className="font-mono"
                                autoComplete="off"
                            />
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleDelete();
                        }}
                        className="bg-destructive hover:bg-destructive/90"
                        disabled={confirmText !== vmid || isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                            </>
                        ) : (
                            "Delete Permanently"
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
