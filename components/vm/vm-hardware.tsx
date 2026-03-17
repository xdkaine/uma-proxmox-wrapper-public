"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
    Loader2,
    Cpu,
    HardDrive,
    Monitor,
    MemoryStick,
    Network,
    Disc,
    Settings2,
    Trash2,
    Plus,
    Pencil,
    Undo2,
    Scaling
} from "lucide-react";
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
import { HardwareTemplates } from "./hardware-templates";
import { NUMAEditor } from "./numa-editor";
import { BootOrderEditor } from "./boot-order-editor";
import { UnusedDisksManager } from "./unused-disks-manager";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface VMHardwareProps {
    vmid: string;
    node: string;
    adminView?: boolean;
}

interface HardwareItem {
    key: string;
    type: string;
    value: string;
    icon: React.ElementType;
    sortOrder: number;
    rawKey: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function VMHardware({ vmid, node, adminView }: VMHardwareProps) {
    const { data: config, error, isLoading, mutate } = useSWR(
        `/api/proxmox/vm/${vmid}/config?node=${node}`,
        fetcher
    );

    const [items, setItems] = useState<HardwareItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isResizeDialogOpen, setIsResizeDialogOpen] = useState(false);
    const [addType, setAddType] = useState<string>("");

    const [editForm, setEditForm] = useState<any>({});
    const [addForm, setAddForm] = useState<any>({});
    const [resizeForm, setResizeForm] = useState<any>({});

    const [isoList, setIsoList] = useState<any[]>([]);

    // Fetch ISOs when storage is selected in edit dialog OR add dialog (if checking for ISOs)
    // We reuse the same query for simplicity, although it relies on either editForm.storage or addForm.storage
    const activeStorage = (isEditDialogOpen ? editForm.storage : null) || (isAddDialogOpen ? addForm.storage : null);

    const { data: storageContent } = useSWR(
        activeStorage ? `/api/proxmox/storage/${activeStorage}/content?node=${node}&content=iso` : null,
        fetcher
    );

    // Fetch storage list for Edit dialog as well
    const { data: storageList } = useSWR(
        (isAddDialogOpen && addType === 'disk') || (isEditDialogOpen && selectedItem && items.find(i => i.key === selectedItem)?.type.includes('CD/DVD'))
            ? `/api/proxmox/storage?node=${node}`
            : null,
        fetcher
    );

    // Fetch vnets for network device bridge selection (filtered to AltZone/Userlabs/AllZone for non-admins, unfiltered for admin view)
    const vnetsUrl = adminView ? '/api/proxmox/sdn/vnets' : '/api/proxmox/sdn/vnets?includeAll=true';
    const { data: vnetsData } = useSWR(
        (isEditDialogOpen && selectedItem && items.find(i => i.key === selectedItem)?.type.includes('Network Device')) ||
            (isAddDialogOpen && addType === 'net')
            ? vnetsUrl
            : null,
        fetcher
    );

    // Build bridge options from vnets
    const availableBridges = vnetsData?.vnets?.map((v: any) => ({
        value: v.vnet,
        label: `${v.vnet} (${v.zone})${v.alias ? ` - ${v.alias}` : ''}`
    })) || [];

    useEffect(() => {
        if (config) {
            setItems(parseConfigToItems(config));
        }
    }, [config]);

    const parseConfigToItems = (config: any): HardwareItem[] => {
        const list: HardwareItem[] = [];

        // Memory
        if (config.memory) {
            list.push({
                key: 'memory',
                rawKey: 'memory',
                type: 'Memory',
                value: `${(parseInt(config.memory) / 1024).toFixed(2)} GiB`,
                icon: MemoryStick,
                sortOrder: 1
            });
        }

        // Processors
        const sockets = config.sockets || 1;
        const cores = config.cores || 1;
        const cpu = config.cpu || 'kvm64';
        list.push({
            key: 'processors',
            rawKey: 'cores',
            type: 'Processors',
            value: `${sockets} (${sockets} sockets, ${cores} cores) [${cpu}]`,
            icon: Cpu,
            sortOrder: 2
        });

        // BIOS
        list.push({
            key: 'bios',
            rawKey: 'bios',
            type: 'BIOS',
            value: config.bios === 'ovmf' ? 'OVMF (UEFI)' : 'Default (SeaBIOS)',
            icon: Settings2,
            sortOrder: 3
        });

        // Display
        list.push({
            key: 'display',
            rawKey: 'vga',
            type: 'Display',
            value: config.vga || 'Default',
            icon: Monitor,
            sortOrder: 4
        });

        // Disks & Networks
        Object.keys(config).forEach(key => {
            if (key.match(/^(scsi|sata|ide|virtio)\d+$/)) {
                const value = config[key];
                if (value.includes('media=cdrom')) {
                    list.push({
                        key: key,
                        rawKey: key,
                        type: `CD/DVD Drive (${key})`,
                        value: value,
                        icon: Disc,
                        sortOrder: 10
                    });
                } else {
                    list.push({
                        key: key,
                        rawKey: key,
                        type: `Hard Disk (${key})`,
                        value: value,
                        icon: HardDrive,
                        sortOrder: 20
                    });
                }
            }
            else if (key.match(/^net\d+$/)) {
                list.push({
                    key: key,
                    rawKey: key,
                    type: `Network Device (${key})`,
                    value: config[key],
                    icon: Network,
                    sortOrder: 30
                });
            }
        });

        return list.sort((a, b) => a.sortOrder - b.sortOrder);
    };

    const getNextFreeId = (prefix: string): string => {
        if (!config) return `${prefix}0`;
        let i = 0;
        while (config[`${prefix}${i}`] && i < 32) {
            i++;
        }
        return `${prefix}${i}`;
    };

    const handleRefresh = () => {
        mutate();
    };

    const handleEdit = () => {
        if (!selectedItem || !config) return;
        const item = items.find(i => i.key === selectedItem);
        if (!item) return;

        setEditForm({}); // Reset

        if (item.key === 'memory') {
            setEditForm({ memory: parseInt(config.memory) });
        } else if (item.key === 'processors') {
            setEditForm({
                sockets: parseInt(config.sockets || 1),
                cores: parseInt(config.cores || 1)
            });
        } else if (item.key === 'bios') {
            setEditForm({ bios: config.bios || 'seabios' });
        } else if (item.key === 'display') {
            setEditForm({ vga: config.vga || 'std' });
        } else if (item.type.includes('CD/DVD')) {
            // Parse existing value: local:iso/ubuntu.iso,media=cdrom,size=...
            // or none,media=cdrom
            const val = config[item.key];
            if (val.startsWith('none')) {
                setEditForm({ isoMode: 'none', storage: '', iso: '' });
            } else {
                // local:iso/filename.iso
                // split by comma first to remove media=cdrom etc
                const path = val.split(',')[0];
                if (path.includes(':')) {
                    const [storage, iso] = path.split(':');
                    setEditForm({ isoMode: 'iso', storage, iso });
                } else {
                    setEditForm({ isoMode: 'none', storage: '', iso: '' });
                }
            }
        } else if (item.type.includes('Network Device')) {
            // Parse network config: model=virtio,bridge=vmbr0,firewall=1,macaddr=XX:XX:XX:XX:XX:XX
            const val = config[item.key];
            const parsed: any = { model: 'virtio', bridge: '', firewall: false, macaddr: '' };

            val.split(',').forEach((part: string) => {
                const [key, value] = part.split('=');
                if (key === 'model') parsed.model = value;
                else if (key === 'bridge') parsed.bridge = value;
                else if (key === 'firewall') parsed.firewall = value === '1';
                else if (key === 'macaddr') parsed.macaddr = value;
            });

            setEditForm(parsed);
        } else if (item.key === 'cpu') {
            // Parse CPU config: host,flags=+aes;+pcid or just kvm64
            const cpuConfig = config.cpu || 'kvm64';
            if (cpuConfig.includes(',flags=')) {
                const [cpuType, flagsPart] = cpuConfig.split(',flags=');
                const flags = flagsPart.split(';').map((f: string) => f.replace(/^[+-]/, ''));
                setEditForm({ cpuType, flags });
            } else {
                setEditForm({ cpuType: cpuConfig, flags: [] });
            }
        } else {
            toast.info("Editing this item is not yet supported via this UI.");
            return;
        }
        setIsEditDialogOpen(true);
    };

    const saveEdit = async () => {
        setActionLoading(true);
        try {
            let payload: any = { ...editForm, node };

            // Special handling for CD/DVD
            if (selectedItem && items.find(i => i.key === selectedItem)?.type.includes('CD/DVD')) {
                if (editForm.isoMode === 'none') {
                    payload = { node, [selectedItem]: 'none,media=cdrom' };
                } else {
                    if (!editForm.storage || !editForm.iso) {
                        toast.error("Please select storage and ISO image");
                        setActionLoading(false);
                        return;
                    }
                    // e.g. ide2: local:iso/filename.iso,media=cdrom
                    payload = { node, [selectedItem]: `${editForm.storage}:${editForm.iso},media=cdrom` };
                }
            }

            // Special handling for Network Device
            if (selectedItem && items.find(i => i.key === selectedItem)?.type.includes('Network Device')) {
                if (!editForm.model || !editForm.bridge) {
                    toast.error("Please select model and bridge");
                    setActionLoading(false);
                    return;
                }
                // Build config string: model=virtio,bridge=vmbr0,firewall=1,macaddr=XX:XX:XX:XX:XX:XX
                let val = `model=${editForm.model},bridge=${editForm.bridge}`;
                if (editForm.firewall) val += ',firewall=1';
                if (editForm.macaddr && editForm.macaddr.trim()) val += `,macaddr=${editForm.macaddr.trim()}`;
                payload = { node, [selectedItem]: val };
            }

            // Special handling for CPU
            if (selectedItem === 'cpu') {
                if (!editForm.cpuType) {
                    toast.error("Please select a CPU type");
                    setActionLoading(false);
                    return;
                }
                let cpuValue = editForm.cpuType;
                if (editForm.flags && editForm.flags.length > 0) {
                    const flagsStr = editForm.flags.map((f: string) => `+${f}`).join(';');
                    cpuValue = `${editForm.cpuType},flags=${flagsStr}`;
                }
                payload = { node, cpu: cpuValue };
            }

            // Remove temporary fields
            delete payload.isoMode;
            delete payload.storage;
            delete payload.iso;
            delete payload.model;
            delete payload.bridge;
            delete payload.firewall;
            delete payload.macaddr;

            await updateConfig(payload);
            setIsEditDialogOpen(false);
            toast.success("Updated successfully");
            mutate();
        } catch (e) {
            toast.error("Failed to update");
        } finally {
            setActionLoading(false);
        }
    };

    const handleRemove = async () => {
        if (!selectedItem) return;
        if (!confirm(`Are you sure you want to remove ${selectedItem}?`)) return;

        setActionLoading(true);
        try {
            await updateConfig({ delete: selectedItem, node });
            toast.success("Item removed");
            setSelectedItem(null);
            mutate();
        } catch (e) {
            toast.error("Failed to remove item");
        } finally {
            setActionLoading(false);
        }
    };

    const handleAdd = (type: string) => {
        setAddType(type);
        if (type === 'net') {
            setAddForm({
                model: 'virtio',
                bridge: 'vmbr0',
                firewall: true
            });
        } else if (type === 'disk') {
            const storage = storageList && storageList.length > 0 ? storageList[0].storage : 'local-lvm';
            setAddForm({
                bus: 'scsi',
                storage: storage,
                size: 32,
                format: 'qcow2'
            });
        } else if (type === 'cdrom') {
            setAddForm({
                bus: 'ide',
                isoMode: 'iso',
                storage: '',
                iso: ''
            });
        }
        setIsAddDialogOpen(true);
    };

    const saveAdd = async () => {
        setActionLoading(true);
        try {
            const payload: any = { node };

            if (addType === 'net') {
                const nextId = getNextFreeId('net');
                let val = `model=${addForm.model},bridge=${addForm.bridge}`;
                if (addForm.firewall) val += `,firewall=1`;
                payload[nextId] = val;
            } else if (addType === 'disk') {
                const nextId = getNextFreeId(addForm.bus);
                let val = `${addForm.storage}:${addForm.size}`;
                // Optional format appending if specific logic required, skipping for MVP/Proxmox defaults
                payload[nextId] = val;
            } else if (addType === 'cdrom') {
                const nextId = getNextFreeId('ide');
                let val = '';
                if (addForm.isoMode === 'none') {
                    val = 'none,media=cdrom';
                } else {
                    if (!addForm.storage || !addForm.iso) {
                        toast.error("Please select storage and ISO image");
                        setActionLoading(false);
                        return;
                    }
                    val = `${addForm.storage}:${addForm.iso},media=cdrom`;
                }
                payload[nextId] = val;
            }

            await updateConfig(payload);
            setIsAddDialogOpen(false);
            toast.success("Device added successfully");
            mutate();
        } catch (e: any) {
            toast.error(`Failed to add device: ${e.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const handleResize = () => {
        if (!selectedItem) return;
        setResizeForm({ sizeIncrement: 1 });
        setIsResizeDialogOpen(true);
    };

    const saveResize = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/resize`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node,
                    disk: selectedItem,
                    size: `+${resizeForm.sizeIncrement}G`
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to resize');

            setIsResizeDialogOpen(false);
            toast.success("Disk resized successfully");
            mutate();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setActionLoading(false);
        }
    };

    const updateConfig = async (payload: any) => {
        const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed');
        }
        return res.json();
    };

    if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;
    if (error) return <div className="text-destructive">Failed to load hardware.</div>;

    const selectedHardware = items.find(i => i.key === selectedItem);
    const canEdit = selectedItem && (
        selectedItem === 'memory' ||
        selectedItem === 'processors' ||
        selectedItem === 'bios' ||
        selectedItem === 'display' ||
        selectedItem === 'cpu' ||
        (selectedHardware?.type.includes('CD/DVD')) ||
        (selectedHardware?.type.includes('Network Device'))
    );
    const isDisk = selectedItem && !!selectedItem.match(/^(scsi|sata|virtio|ide)\d+$/) && !items.find(i => i.key === selectedItem)?.value.includes('media=cdrom');
    const canRemove = selectedItem && (!!selectedItem.match(/^(net|scsi|sata|virtio|ide|unused)\d+$/) && !items.find(i => i.key === selectedItem)?.value.includes('media=cdrom'));

    console.log("VMHardware Rendered via New Code");

    return (
        <div className="space-y-4">
            <HardwareTemplates vmid={vmid} node={node} currentConfig={config} onApply={() => mutate()} />

            <div className="flex items-center gap-2 p-1 bg-muted/20 rounded-lg border">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-1">
                            <Plus className="h-4 w-4" /> Add
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Add Hardware</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleAdd('disk')}>
                            <HardDrive className="mr-2 h-4 w-4" /> Hard Disk
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAdd('net')}>
                            <Network className="mr-2 h-4 w-4" /> Network Device
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAdd('cdrom')}>
                            <Disc className="mr-2 h-4 w-4" /> CD/DVD Drive
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <BootOrderEditor vmid={vmid} node={node} currentBoot={config?.boot} onSave={() => mutate()} />
                <NUMAEditor vmid={vmid} node={node} currentConfig={config} onSave={() => mutate()} />
                <UnusedDisksManager vmid={vmid} node={node} config={config} onUpdate={() => mutate()} />

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1"
                    disabled={!selectedItem || !canRemove}
                    onClick={handleRemove}
                >
                    <Trash2 className="h-4 w-4 text-destructive" /> Remove
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1"
                    disabled={!selectedItem || !canEdit}
                    onClick={handleEdit}
                >
                    <Pencil className="h-4 w-4" /> Edit
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-1" disabled={!selectedItem || !isDisk}>
                            Disk Action <Scaling className="ml-1 h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={handleResize}>
                            Resize
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex-1" />

                <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={handleRefresh}>
                    <Undo2 className="h-4 w-4" /> Reload
                </Button>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead className="w-[200px]">Type</TableHead>
                            <TableHead>Value</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                    No hardware found.
                                </TableCell>
                            </TableRow>
                        ) : (items.map((item) => (
                            <TableRow
                                key={item.key}
                                className={`cursor-pointer ${selectedItem === item.key ? "bg-muted" : ""}`}
                                onClick={() => setSelectedItem(item.key === selectedItem ? null : item.key)}
                            >
                                <TableCell>
                                    <item.icon className="h-4 w-4 text-muted-foreground" />
                                </TableCell>
                                <TableCell className="font-medium">{item.type}</TableCell>
                                <TableCell className="font-mono text-sm text-muted-foreground break-all">{item.value}</TableCell>
                            </TableRow>
                        )))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit {selectedHardware?.type}</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {selectedItem === 'memory' && (
                            <div className="grid gap-2">
                                <Label htmlFor="memory">Memory (MiB)</Label>
                                <Input
                                    id="memory"
                                    type="number"
                                    value={editForm.memory}
                                    onChange={(e) => setEditForm({ ...editForm, memory: parseInt(e.target.value) })}
                                />
                            </div>
                        )}
                        {selectedItem === 'processors' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="sockets">Sockets</Label>
                                    <Input
                                        id="sockets"
                                        type="number"
                                        value={editForm.sockets}
                                        onChange={(e) => setEditForm({ ...editForm, sockets: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="cores">Cores</Label>
                                    <Input
                                        id="cores"
                                        type="number"
                                        value={editForm.cores}
                                        onChange={(e) => setEditForm({ ...editForm, cores: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                        )}
                        {selectedItem === 'bios' && (
                            <div className="grid gap-2">
                                <Label htmlFor="bios">BIOS</Label>
                                <Select
                                    value={editForm.bios}
                                    onValueChange={(val) => setEditForm({ ...editForm, bios: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="seabios">SeaBIOS (Default)</SelectItem>
                                        <SelectItem value="ovmf">OVMF (UEFI)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {selectedItem === 'display' && (
                            <div className="grid gap-2">
                                <Label htmlFor="display">Graphic Card</Label>
                                <Select
                                    value={editForm.vga}
                                    onValueChange={(val) => setEditForm({ ...editForm, vga: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="std">Standard VGA</SelectItem>
                                        <SelectItem value="vmware">VMware Compatible</SelectItem>
                                        <SelectItem value="qxl">SPICE (QXL)</SelectItem>
                                        <SelectItem value="serial0">Serial Terminal 0</SelectItem>
                                        <SelectItem value="virtio-gpu">VirtIO-GPU</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {selectedItem === 'cpu' && (
                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="cpuType">CPU Type</Label>
                                    <Select
                                        value={editForm.cpuType || 'kvm64'}
                                        onValueChange={(val) => setEditForm({ ...editForm, cpuType: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select CPU type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="host">host (Best Performance)</SelectItem>
                                            <SelectItem value="kvm64">kvm64 (Default)</SelectItem>
                                            <SelectItem value="qemu64">qemu64 (Compatibility)</SelectItem>
                                            <SelectItem value="Haswell">Haswell</SelectItem>
                                            <SelectItem value="Skylake-Client">Skylake-Client</SelectItem>
                                            <SelectItem value="EPYC">EPYC</SelectItem>
                                            <SelectItem value="EPYC-Rome">EPYC-Rome</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        'host' provides best performance by passing through host CPU features
                                    </p>
                                </div>

                                <div className="grid gap-2">
                                    <Label>CPU Flags</Label>
                                    <div className="space-y-2">
                                        {['aes', 'pcid', 'spec-ctrl', 'ssbd', 'pdpe1gb'].map(flag => (
                                            <div key={flag} className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id={`flag-${flag}`}
                                                    checked={editForm.flags?.includes(flag) || false}
                                                    onChange={(e) => {
                                                        const newFlags = e.target.checked
                                                            ? [...(editForm.flags || []), flag]
                                                            : (editForm.flags || []).filter((f: string) => f !== flag);
                                                        setEditForm({ ...editForm, flags: newFlags });
                                                    }}
                                                />
                                                <Label htmlFor={`flag-${flag}`} className="text-sm font-normal cursor-pointer">
                                                    {flag.toUpperCase()}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Enable CPU features like AES encryption, PCID for performance
                                    </p>
                                </div>
                            </div>
                        )}
                        {selectedHardware?.type.includes('CD/DVD') && (
                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>Image</Label>
                                    <div className="flex gap-4">
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="radio"
                                                id="mode-iso"
                                                name="iso"
                                                checked={editForm.isoMode === 'iso'}
                                                onChange={() => setEditForm({ ...editForm, isoMode: 'iso' })}
                                            />
                                            <Label htmlFor="mode-iso">Use ISO image</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="radio"
                                                id="mode-none"
                                                name="iso"
                                                checked={editForm.isoMode === 'none'}
                                                onChange={() => setEditForm({ ...editForm, isoMode: 'none' })}
                                            />
                                            <Label htmlFor="mode-none">Do not use any media</Label>
                                        </div>
                                    </div>
                                </div>

                                {editForm.isoMode === 'iso' && (
                                    <>
                                        <div className="grid gap-2">
                                            <Label>Storage</Label>
                                            <Select
                                                value={editForm.storage || ''}
                                                onValueChange={(val) => setEditForm({ ...editForm, storage: val, iso: '' })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Storage" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {storageList?.filter((s: any) => s.content.includes('iso'))?.map((s: any) => (
                                                        <SelectItem key={s.storage} value={s.storage}>
                                                            {s.storage}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>ISO Image</Label>
                                            <Select
                                                value={editForm.iso || ''}
                                                onValueChange={(val) => setEditForm({ ...editForm, iso: val })}
                                                disabled={!editForm.storage}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder={!editForm.storage ? "Select storage first" : "Select ISO"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {storageContent?.map((f: any) => (
                                                        <SelectItem key={f.volid} value={f.volid.split('/').pop()}>
                                                            {f.volid.split('/').pop()}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {selectedHardware?.type.includes('Network Device') && (
                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>Bridge</Label>
                                    <Select value={editForm.bridge || ''} onValueChange={(val) => setEditForm({ ...editForm, bridge: val })}>
                                        <SelectTrigger><SelectValue placeholder="Select Bridge" /></SelectTrigger>
                                        <SelectContent>
                                            {availableBridges.length === 0 ? (
                                                <SelectItem value="none" disabled>Loading...</SelectItem>
                                            ) : (
                                                availableBridges.map((bridge: any) => (
                                                    <SelectItem key={bridge.value} value={bridge.value}>{bridge.label}</SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Model</Label>
                                    <Select value={editForm.model} onValueChange={(val) => setEditForm({ ...editForm, model: val })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="virtio">VirtIO (paravirtualized)</SelectItem>
                                            <SelectItem value="e1000">Intel E1000</SelectItem>
                                            <SelectItem value="rtl8139">Realtek RTL8139</SelectItem>
                                            <SelectItem value="vmxnet3">VMware vmxnet3</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="macaddr">MAC Address (optional)</Label>
                                    <Input id="macaddr" value={editForm.macaddr || ''} onChange={(e) => setEditForm({ ...editForm, macaddr: e.target.value })} placeholder="Auto-generated if empty" />
                                    <p className="text-xs text-muted-foreground">Format: XX:XX:XX:XX:XX:XX</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" id="fw-edit" checked={editForm.firewall || false} onChange={(e) => setEditForm({ ...editForm, firewall: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                                    <Label htmlFor="fw-edit">Enable Firewall</Label>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                        <Button onClick={saveEdit} disabled={actionLoading}>
                            {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add {addType === 'net' ? 'Network Device' : addType === 'disk' ? 'Hard Disk' : 'Hardware'}</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {addType === 'net' && (
                            <>
                                <div className="grid gap-2">
                                    <Label>Bridge</Label>
                                    <Select value={addForm.bridge} onValueChange={(val) => setAddForm({ ...addForm, bridge: val })}>
                                        <SelectTrigger><SelectValue placeholder="Select Bridge" /></SelectTrigger>
                                        <SelectContent>
                                            {availableBridges.length === 0 ? (
                                                <SelectItem value="none" disabled>Loading...</SelectItem>
                                            ) : (
                                                availableBridges.map((bridge: any) => (
                                                    <SelectItem key={bridge.value} value={bridge.value}>{bridge.label}</SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Model</Label>
                                    <Select
                                        value={addForm.model}
                                        onValueChange={(val) => setAddForm({ ...addForm, model: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="virtio">VirtIO (paravirtualized)</SelectItem>
                                            <SelectItem value="e1000">Intel E1000</SelectItem>
                                            <SelectItem value="rtl8139">Realtek RTL8139</SelectItem>
                                            <SelectItem value="vmxnet3">VMware vmxnet3</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="firewall"
                                        checked={addForm.firewall}
                                        onChange={(e) => setAddForm({ ...addForm, firewall: e.target.checked })}
                                        className="h-4 w-4 rounded border-gray-300"
                                    />
                                    <Label htmlFor="firewall">Firewall</Label>
                                </div>
                            </>
                        )}
                        {addType === 'disk' && (
                            <>
                                <div className="grid gap-2">
                                    <Label>Bus/Device</Label>
                                    <Select
                                        value={addForm.bus}
                                        onValueChange={(val) => setAddForm({ ...addForm, bus: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="scsi">SCSI</SelectItem>
                                            <SelectItem value="virtio">VirtIO Block</SelectItem>
                                            <SelectItem value="sata">SATA</SelectItem>
                                            <SelectItem value="ide">IDE</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Storage</Label>
                                    {storageList ? (
                                        <Select
                                            value={addForm.storage}
                                            onValueChange={(val) => setAddForm({ ...addForm, storage: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select Storage" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {storageList.map((s: any) => (
                                                    <SelectItem key={s.storage} value={s.storage}>
                                                        {s.storage} ({s.type})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin" /> Loading storage...
                                        </div>
                                    )}
                                </div>
                                <div className="grid gap-2">
                                    <Label>Disk Size (GiB)</Label>
                                    <Input
                                        type="number"
                                        value={addForm.size}
                                        onChange={(e) => setAddForm({ ...addForm, size: parseInt(e.target.value) })}
                                        min={1}
                                    />
                                </div>
                            </>
                        )}
                        {addType === 'cdrom' && (
                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>Image</Label>
                                    <div className="flex gap-4">
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="radio"
                                                id="add-mode-iso"
                                                name="add-iso"
                                                checked={addForm.isoMode === 'iso'}
                                                onChange={() => setAddForm({ ...addForm, isoMode: 'iso' })}
                                            />
                                            <Label htmlFor="add-mode-iso">Use ISO image</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="radio"
                                                id="add-mode-none"
                                                name="add-iso"
                                                checked={addForm.isoMode === 'none'}
                                                onChange={() => setAddForm({ ...addForm, isoMode: 'none' })}
                                            />
                                            <Label htmlFor="add-mode-none">Do not use any media</Label>
                                        </div>
                                    </div>
                                </div>

                                {addForm.isoMode === 'iso' && (
                                    <>
                                        <div className="grid gap-2">
                                            <Label>Storage</Label>
                                            <Select
                                                value={addForm.storage || ''}
                                                onValueChange={(val) => setAddForm({ ...addForm, storage: val, iso: '' })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Storage" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {storageList?.filter((s: any) => s.content.includes('iso'))?.map((s: any) => (
                                                        <SelectItem key={s.storage} value={s.storage}>
                                                            {s.storage}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>ISO Image</Label>
                                            <Select
                                                value={addForm.iso || ''}
                                                onValueChange={(val) => setAddForm({ ...addForm, iso: val })}
                                                disabled={!addForm.storage}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder={!addForm.storage ? "Select storage first" : "Select ISO"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {isAddDialogOpen && addForm.storage && storageContent?.map((f: any) => (
                                                        <SelectItem key={f.volid} value={f.volid.split('/').pop()}>
                                                            {f.volid.split('/').pop()}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                        <Button onClick={saveAdd} disabled={actionLoading}>
                            {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Add
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isResizeDialogOpen} onOpenChange={setIsResizeDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Resize Disk {selectedItem}</DialogTitle>
                        <DialogDescription>
                            Increase size of the disk. (Increment only)
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Size Increment (GiB)</Label>
                            <Input
                                type="number"
                                value={resizeForm.sizeIncrement}
                                onChange={(e) => setResizeForm({ ...resizeForm, sizeIncrement: parseInt(e.target.value) })}
                                min={1}
                            />
                            <p className="text-sm text-muted-foreground">Enter the amount to add (e.g. 10 for +10G).</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsResizeDialogOpen(false)}>Cancel</Button>
                        <Button onClick={saveResize} disabled={actionLoading}>
                            {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Resize Disk
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
