'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DeleteResourceDialog } from "@/components/admin/delete-resource-dialog";

interface AclsClientProps {
    initialAcls: any[];
}

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
});

export function AclsClient({ initialAcls }: AclsClientProps) {
    const { mutate } = useSWRConfig();
    const { data } = useSWR<{ acls: any[] }>('/api/proxmox/access/acl', fetcher, {
        fallbackData: { acls: initialAcls },
        refreshInterval: 15000,
    });

    const acls = data?.acls || [];
    const appAcls = acls.filter(a => a.path.startsWith('/pool/DEV_') || a.path.startsWith('/sdn/vnets/DEV'));

    const [deleteDialog, setDeleteDialog] = useState<{
        open: boolean;
        acl: any | null;
    }>({ open: false, acl: null });

    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!deleteDialog.acl) return;
        setIsDeleting(true);
        try {
            const response = await fetch('/api/proxmox/pools/acl', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: deleteDialog.acl.path,
                    ugid: deleteDialog.acl.ugid,
                    roleid: deleteDialog.acl.roleid,
                }),
            });

            if (response.ok) {
                toast.success(`ACL Entry deleted successfully`);
                mutate('/api/proxmox/access/acl');
            } else {
                const error = await response.json();
                toast.error(`Failed to delete: ${error?.error || 'Unknown error'}`);
            }
        } catch (error: any) {
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
            setDeleteDialog({ open: false, acl: null });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Access Control Lists</h1>
                <p className="text-muted-foreground">Manage permissions and access rights.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>ACLs</CardTitle>
                    <CardDescription>
                        Shows ACLs for paths starting with <code>/pool/DEV_</code> or <code>/sdn/vnets/DEV</code>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[600px] overflow-auto border rounded-md">
                        <Table>
                            <TableHeader className="sticky top-0 bg-secondary">
                                <TableRow>
                                    <TableHead>Path</TableHead>
                                    <TableHead>User/Group</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Propagate</TableHead>
                                    <TableHead className="w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {appAcls.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center">No application ACLs found</TableCell>
                                    </TableRow>
                                ) : (
                                    appAcls.map((acl, i) => (
                                        <TableRow key={`${acl.path}-${acl.ugid}-${acl.roleid}-${i}`}>
                                            <TableCell className="font-mono text-sm">{acl.path}</TableCell>
                                            <TableCell>{acl.ugid}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{acl.type}</Badge>
                                            </TableCell>
                                            <TableCell>{acl.roleid}</TableCell>
                                            <TableCell>{acl.propagate ? 'Yes' : 'No'}</TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeleteDialog({ open: true, acl })}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
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

            <DeleteResourceDialog
                open={deleteDialog.open}
                onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
                onConfirm={handleDelete}
                resourceName={deleteDialog.acl ? `${deleteDialog.acl.path} - ${deleteDialog.acl.ugid}` : null}
                resourceType="ACL Entry"
                isDeleting={isDeleting}
            />
        </div>
    );
}
