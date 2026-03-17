"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface NumaNode {
    id: number;
    cpus: string;
    memory: number;
    hostnodes?: string;
    policy?: string;
}

interface NUMAEditorProps {
    vmid: string;
    node: string;
    currentConfig?: any;
    onSave: () => void;
}

export function NUMAEditor({ vmid, node, currentConfig, onSave }: NUMAEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Parse existing NUMA config
    const parseNUMANodes = (): NumaNode[] => {
        const nodes: NumaNode[] = [];
        let nodeId = 0;

        while (currentConfig?.[`numa${nodeId}`]) {
            const numaStr = currentConfig[`numa${nodeId}`];
            const node: NumaNode = { id: nodeId, cpus: '', memory: 0 };

            const cpusMatch = numaStr.match(/cpus=([^,]+)/);
            const memoryMatch = numaStr.match(/memory=(\d+)/);
            const hostnodesMatch = numaStr.match(/hostnodes=([^,]+)/);
            const policyMatch = numaStr.match(/policy=([^,]+)/);

            if (cpusMatch) node.cpus = cpusMatch[1];
            if (memoryMatch) node.memory = parseInt(memoryMatch[1]);
            if (hostnodesMatch) node.hostnodes = hostnodesMatch[1];
            if (policyMatch) node.policy = policyMatch[1];

            nodes.push(node);
            nodeId++;
        }

        return nodes.length > 0 ? nodes : [{ id: 0, cpus: '0-1', memory: 2048 }];
    };

    const [numaNodes, setNumaNodes] = useState<NumaNode[]>(parseNUMANodes);

    const updateNode = (index: number, field: keyof NumaNode, value: any) => {
        const newNodes = [...numaNodes];
        newNodes[index] = { ...newNodes[index], [field]: value };
        setNumaNodes(newNodes);
    };

    const addNode = () => {
        setNumaNodes([...numaNodes, {
            id: numaNodes.length,
            cpus: `${numaNodes.length * 2}-${numaNodes.length * 2 + 1}`,
            memory: 2048
        }]);
    };

    const removeNode = (index: number) => {
        setNumaNodes(numaNodes.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const config: any = { node };

            // Build NUMA config
            numaNodes.forEach((numaNode, idx) => {
                const parts = [`cpus=${numaNode.cpus}`, `memory=${numaNode.memory}`];
                if (numaNode.hostnodes) parts.push(`hostnodes=${numaNode.hostnodes}`);
                if (numaNode.policy) parts.push(`policy=${numaNode.policy}`);
                config[`numa${idx}`] = parts.join(',');
            });

            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to update NUMA config");
            } else {
                toast.success("NUMA configuration updated");
                setIsOpen(false);
                onSave();
            }
        } catch (e) {
            toast.error("Failed to update NUMA config");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
                <Cpu className="h-4 w-4 mr-2" />
                NUMA Config
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>NUMA Configuration</DialogTitle>
                        <DialogDescription>
                            Configure NUMA topology for CPU and memory optimization
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {numaNodes.map((numaNode, index) => (
                            <div key={index} className="p-4 border rounded space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-semibold">NUMA Node {index}</h4>
                                    {numaNodes.length > 1 && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => removeNode(index)}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label>CPUs (e.g., 0-1 or 0,2,4)</Label>
                                        <Input
                                            value={numaNode.cpus}
                                            onChange={(e) => updateNode(index, 'cpus', e.target.value)}
                                            placeholder="0-1"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Memory (MiB)</Label>
                                        <Input
                                            type="number"
                                            value={numaNode.memory}
                                            onChange={(e) => updateNode(index, 'memory', parseInt(e.target.value))}
                                            placeholder="2048"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Host Nodes (optional)</Label>
                                        <Input
                                            value={numaNode.hostnodes || ''}
                                            onChange={(e) => updateNode(index, 'hostnodes', e.target.value)}
                                            placeholder="0-1"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Policy (optional)</Label>
                                        <Input
                                            value={numaNode.policy || ''}
                                            onChange={(e) => updateNode(index, 'policy', e.target.value)}
                                            placeholder="preferred, bind, interleave"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                        <Button variant="outline" onClick={addNode} className="w-full">
                            Add NUMA Node
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Configuration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
