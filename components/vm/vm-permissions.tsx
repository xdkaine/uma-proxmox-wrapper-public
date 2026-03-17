"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RotateCw, Trash2, Key, User, Users } from "lucide-react";
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
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface VMPermissionsProps {
    vmid: string;
    node: string;
}

interface ACL {
    path: string;
    type: string;
    ugid: string;
    roleid: string;
    propagate: number;
}

interface User {
    userid: string;
}

interface Role {
    roleid: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function VMPermissions({ vmid }: VMPermissionsProps) {
    const { data: aclsData, isLoading: isLoadingACLs, mutate } = useSWR<{ acls: ACL[] }>(
        `/api/proxmox/access/acl`,
        fetcher
    );
    const { data: users } = useSWR<User[]>(`/api/proxmox/access/users`, fetcher);
    const { data: roles } = useSWR<Role[]>(`/api/proxmox/access/roles`, fetcher);

    // Filter ACLs for this VM
    const vmPath = `/vms/${vmid}`;
    const vmACLs = aclsData?.acls?.filter(acl => acl.path === vmPath) || [];

    const [isCreating, setIsCreating] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    const [selectedUser, setSelectedUser] = useState("");
    const [selectedRole, setSelectedRole] = useState("");
    const [type, setType] = useState("user"); // user or group

    const handleAdd = async () => {
        if (!selectedUser || !selectedRole) {
            toast.error("User and Role are required");
            return;
        }

        setIsCreating(true);
        try {
            const body: any = {
                path: vmPath,
                roles: selectedRole,
            };
            if (type === 'user') body.users = selectedUser;


            const res = await fetch(`/api/proxmox/access/acl`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success("Permission added");
            setDialogOpen(false);
            setSelectedUser("");
            setSelectedRole("");
            mutate();
        } catch (err: any) {
            toast.error(err.message || "Failed to add permission");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (acl: ACL) => {
        if (!confirm(`Remove permission for ${acl.ugid}?`)) return;
        try {
            const body: any = {
                path: acl.path,
                roles: acl.roleid,
                remove: true
            };
            if (acl.type === 'user') body.users = acl.ugid;
            if (acl.type === 'group') body.groups = acl.ugid;
            if (acl.type === 'token') body.users = acl.ugid; 

            const res = await fetch(`/api/proxmox/access/acl`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast.success("Permission removed");
            mutate();
        } catch (err: any) {
            toast.error(err.message || "Failed to remove permission");
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Permissions</CardTitle>
                    <CardDescription>
                        Manage user access to this VM.
                    </CardDescription>
                </div>
                <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => mutate()}>
                        <RotateCw className="mr-2 h-4 w-4" />
                        Reload
                    </Button>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="mr-2 h-4 w-4" />
                                Add Permission
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add Permission</DialogTitle>
                                <DialogDescription>
                                    Grant access to a user.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label>User</Label>
                                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                                        <SelectTrigger><SelectValue placeholder="Select User" /></SelectTrigger>
                                        <SelectContent>
                                            {users?.map(u => (
                                                <SelectItem key={u.userid} value={u.userid}>{u.userid}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Role</Label>
                                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                                        <SelectTrigger><SelectValue placeholder="Select Role" /></SelectTrigger>
                                        <SelectContent>
                                            {roles?.map(r => (
                                                <SelectItem key={r.roleid} value={r.roleid}>{r.roleid}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleAdd} disabled={isCreating}>
                                    {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Add
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>User/Group</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoadingACLs ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : vmACLs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                        No explicit permissions found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                vmACLs.map((acl, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>
                                            <div className="flex items-center">
                                                {acl.type === 'user' ? <User className="mr-2 h-4 w-4" /> :
                                                    acl.type === 'group' ? <Users className="mr-2 h-4 w-4" /> : <Key className="mr-2 h-4 w-4" />}
                                                {acl.type}
                                            </div>
                                        </TableCell>
                                        <TableCell>{acl.ugid}</TableCell>
                                        <TableCell>{acl.roleid}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(acl)} className="text-destructive hover:text-destructive">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
