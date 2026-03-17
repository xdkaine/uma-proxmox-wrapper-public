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
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Users, Loader2, ChevronsUpDown, Check, Info, Trash2, UserCircle, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import useSWR from "swr";
import { useDebounce } from "@/lib/swr-hooks";
import { Badge } from "@/components/ui/badge";

interface ManageUsersDialogProps {
    poolId: string;
    description?: string;
}

import { fetcher } from "@/lib/fetcher";

export function ManageUsersDialog({ poolId, description }: ManageUsersDialogProps) {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Permission type: 'user' or 'group'
    const [permissionType, setPermissionType] = useState<'user' | 'group'>('user');

    // User state
    const [username, setUsername] = useState("");
    const [role, setRole] = useState("PVEVMUser");

    // Group state
    const [groupName, setGroupName] = useState("");

    // User autocomplete state
    const [openUserCombobox, setOpenUserCombobox] = useState(false);
    const [userQuery, setUserQuery] = useState("");
    const debouncedUserQuery = useDebounce(userQuery, 500);

    // Group autocomplete state
    const [openGroupCombobox, setOpenGroupCombobox] = useState(false);
    const [groupQuery, setGroupQuery] = useState("");
    const debouncedGroupQuery = useDebounce(groupQuery, 500);

    const { data: userSearchResults, isLoading: isSearchingUsers } = useSWR(
        debouncedUserQuery && debouncedUserQuery.length > 1 ? `/api/auth/users?q=${debouncedUserQuery}` : null,
        fetcher
    );

    const { data: groupSearchResults, isLoading: isSearchingGroups } = useSWR(
        debouncedGroupQuery && debouncedGroupQuery.length > 1 ? `/api/auth/groups?q=${debouncedGroupQuery}` : null,
        fetcher
    );

    const { data: meData } = useSWR("/api/auth/me", fetcher);
    const currentUser = meData?.user?.username;

    const { data: aclsData, isLoading: isLoadingAcls, mutate: mutateAcls } = useSWR(
        open ? `/api/proxmox/pools/${poolId}/acl` : null,
        fetcher
    );
    const acls = aclsData?.acls || [];

    const { mutate } = useSWRConfig();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (permissionType === 'user' && !username) return;
        if (permissionType === 'group' && !groupName) return;

        setIsLoading(true);

        try {
            const body: any = {
                poolId,
                role,
                type: permissionType,
            };

            if (permissionType === 'user') {
                body.username = username;
            } else {
                body.groupName = groupName;
            }

            const res = await fetch("/api/proxmox/pools/acl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to add permission");
            }

            const target = permissionType === 'user' ? username : groupName;
            toast.success(`Successfully added ${target} to ${poolId}`);
            mutateAcls(); // Refresh the list
            setOpen(false);
            setUsername("");
            setGroupName("");
            setUserQuery("");
            setGroupQuery("");
            setRole("PVEVMUser");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveAcl = async (targetUser: string, targetRole: string, aclType: string) => {
        if (!confirm(`Are you sure you want to remove ${targetRole} from ${targetUser}?`)) return;

        try {
            const body: any = {
                poolId,
                role: targetRole,
                type: aclType,
            };

            if (aclType === 'group') {
                body.groupName = targetUser;
            } else {
                body.username = targetUser;
            }

            const res = await fetch("/api/proxmox/pools/acl", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to remove permission");
            }

            toast.success(`Removed ${targetRole} from ${targetUser}`);
            mutateAcls();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const isSubmitDisabled = isLoading ||
        (permissionType === 'user' && !username) ||
        (permissionType === 'group' && !groupName);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Manage Permissions">
                    <Users className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Manage Permissions</DialogTitle>
                    <DialogDescription>
                        Add users or groups to pool <strong>{poolId}</strong>.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <Tabs value={permissionType} onValueChange={(v: string) => setPermissionType(v as 'user' | 'group')}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="user" className="flex items-center gap-2">
                                    <UserCircle className="h-4 w-4" />
                                    User
                                </TabsTrigger>
                                <TabsTrigger value="group" className="flex items-center gap-2">
                                    <UsersRound className="h-4 w-4" />
                                    Group
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="user" className="mt-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="username" className="text-right">
                                        Username
                                    </Label>
                                    <div className="col-span-3">
                                        <Popover open={openUserCombobox} onOpenChange={setOpenUserCombobox}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={openUserCombobox}
                                                    className="justify-between w-full"
                                                >
                                                    {username ? username : "Search users..."}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                                <Command shouldFilter={false}>
                                                    <CommandInput
                                                        placeholder="Search AD..."
                                                        value={userQuery}
                                                        onValueChange={setUserQuery}
                                                    />
                                                    <CommandList>
                                                        {isSearchingUsers && <CommandEmpty>Searching...</CommandEmpty>}
                                                        {!isSearchingUsers && (!userSearchResults || userSearchResults.users?.length === 0) && (
                                                            <CommandEmpty>No users found.</CommandEmpty>
                                                        )}
                                                        {userSearchResults?.users?.map((user: any) => (
                                                            <CommandItem
                                                                key={user.username}
                                                                value={user.username}
                                                                onSelect={(currentValue) => {
                                                                    setUsername(currentValue);
                                                                    setUserQuery("");
                                                                    setOpenUserCombobox(false);
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        username === user.username ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span>{user.cn}</span>
                                                                    <span className="text-xs text-muted-foreground">{user.username}</span>
                                                                </div>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="group" className="mt-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="groupName" className="text-right">
                                        Group
                                    </Label>
                                    <div className="col-span-3">
                                        <Popover open={openGroupCombobox} onOpenChange={setOpenGroupCombobox}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={openGroupCombobox}
                                                    className="justify-between w-full"
                                                >
                                                    {groupName ? groupName : "Search groups..."}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                                <Command shouldFilter={false}>
                                                    <CommandInput
                                                        placeholder="Search groups..."
                                                        value={groupQuery}
                                                        onValueChange={setGroupQuery}
                                                    />
                                                    <CommandList>
                                                        {isSearchingGroups && <CommandEmpty>Searching...</CommandEmpty>}
                                                        {!isSearchingGroups && (!groupSearchResults || groupSearchResults.groups?.length === 0) && (
                                                            <CommandEmpty>No groups found.</CommandEmpty>
                                                        )}
                                                        {groupSearchResults?.groups?.map((group: any) => (
                                                            <CommandItem
                                                                key={group.cn}
                                                                value={group.cn}
                                                                onSelect={(currentValue) => {
                                                                    setGroupName(currentValue);
                                                                    setGroupQuery("");
                                                                    setOpenGroupCombobox(false);
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        groupName === group.cn ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span>{group.cn}</span>
                                                                    {group.description && (
                                                                        <span className="text-xs text-muted-foreground">{group.description}</span>
                                                                    )}
                                                                </div>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>

                        <div className="grid grid-cols-4 items-center gap-4">
                            <div className="text-right flex items-center justify-end gap-2">
                                <Label htmlFor="role">
                                    Role
                                </Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Info className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-4">
                                        <div className="space-y-2">
                                            <h4 className="font-medium leading-none">Role Permissions</h4>
                                            <div className="text-sm text-muted-foreground space-y-2">
                                                <div><span className="font-semibold text-foreground">PVEPoolUser:</span> Read-only access to the pool properties.</div>
                                                <div><span className="font-semibold text-foreground">PVEAdmin:</span> Full Proxmox administration rights.</div>
                                                <div><span className="font-semibold text-foreground">PVEVMUser:</span> View and access VM consoles.</div>
                                                <div><span className="font-semibold text-foreground">PVEVMAdmin:</span> Manage VM lifecycle (Start, Stop, Config).</div>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <Select value={role} onValueChange={setRole}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PVEPoolUser">PvePoolUser</SelectItem>
                                    <SelectItem value="PVEAdmin">PveAdmin</SelectItem>
                                    <SelectItem value="PVEVMUser">PveVMUser</SelectItem>
                                    <SelectItem value="PVEVMAdmin">PvEVMAdmin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="mb-4">
                        <Label className="mb-2 block">Existing Permissions</Label>
                        <div className="border rounded-md p-2 text-sm max-h-40 overflow-y-auto">
                            {isLoadingAcls ? (
                                <div className="flex items-center justify-center p-2">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Loading...
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {acls && acls.length > 0 ? (
                                        acls.map((acl: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center border-b pb-1 last:border-0 last:pb-0 group">
                                                <div className="flex items-center gap-2">
                                                    {acl.type === 'group' ? (
                                                        <UsersRound className="h-3 w-3 text-muted-foreground" />
                                                    ) : (
                                                        <UserCircle className="h-3 w-3 text-muted-foreground" />
                                                    )}
                                                    <span className="font-medium">{acl.user}</span>
                                                    <Badge variant="outline" className="text-xs">
                                                        {acl.type}
                                                    </Badge>
                                                    <span className="text-muted-foreground text-xs bg-secondary px-2 py-0.5 rounded">
                                                        {acl.role}
                                                    </span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={cn(
                                                        "h-6 w-6 text-muted-foreground transition-opacity",
                                                        (currentUser && (acl.user === currentUser || acl.user.startsWith(`${currentUser}@`)))
                                                            ? "opacity-50 cursor-not-allowed"
                                                            : "hover:text-destructive opacity-0 group-hover:opacity-100"
                                                    )}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        const isSelf = currentUser && (acl.user === currentUser || acl.user.startsWith(`${currentUser}@`));
                                                        if (isSelf) return;
                                                        handleRemoveAcl(acl.ugid || acl.user, acl.roleid || acl.role, acl.type);
                                                    }}
                                                    disabled={currentUser && (acl.user === currentUser || acl.user.startsWith(`${currentUser}@`))}
                                                    title={
                                                        currentUser && (acl.user === currentUser || acl.user.startsWith(`${currentUser}@`))
                                                            ? "You cannot remove your own permissions"
                                                            : "Remove Permission"
                                                    }
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-muted-foreground text-center p-2">No specific permissions found.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={isSubmitDisabled}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add Permission
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

