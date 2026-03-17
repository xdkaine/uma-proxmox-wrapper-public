"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Save, Download, Trash2, Share2, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface HardwareTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    config: any;
    owner: string;
    shared: boolean;
    createdAt: string;
    updatedAt: string;
}

interface HardwareTemplatesProps {
    vmid: string;
    node: string;
    currentConfig?: any;
    onApply?: () => void;
}

export function HardwareTemplates({ vmid, node, currentConfig, onApply }: HardwareTemplatesProps) {
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showLibrary, setShowLibrary] = useState(false);
    const [showApplyDialog, setShowApplyDialog] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<HardwareTemplate | null>(null);

    const [templateName, setTemplateName] = useState("");
    const [templateDescription, setTemplateDescription] = useState("");
    const [templateCategory, setTemplateCategory] = useState("custom");
    const [isSaving, setIsSaving] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    const { data: templatesData, mutate } = useSWR('/api/hardware-templates', fetcher);
    const templates: HardwareTemplate[] = templatesData?.templates || [];

    const handleSaveTemplate = async () => {
        if (!templateName || !currentConfig) {
            toast.error("Template name and config are required");
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch('/api/hardware-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: templateName,
                    description: templateDescription,
                    category: templateCategory,
                    config: currentConfig
                })
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to save template");
            } else {
                toast.success("Template saved successfully");
                setShowSaveDialog(false);
                setTemplateName("");
                setTemplateDescription("");
                setTemplateCategory("custom");
                mutate();
            }
        } catch (e) {
            toast.error("Failed to save template");
        } finally {
            setIsSaving(false);
        }
    };

    const handleApplyTemplate = async () => {
        if (!selectedTemplate) return;

        setIsApplying(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...selectedTemplate.config, node })
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to apply template");
            } else {
                toast.success("Template applied successfully");
                setShowApplyDialog(false);
                setSelectedTemplate(null);
                if (onApply) onApply();
            }
        } catch (e) {
            toast.error("Failed to apply template");
        } finally {
            setIsApplying(false);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            const res = await fetch(`/api/hardware-templates/${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to delete template");
            } else {
                toast.success("Template deleted");
                mutate();
            }
        } catch (e) {
            toast.error("Failed to delete template");
        }
    };

    const categoryTemplates = {
        custom: templates.filter(t => t.category === 'custom'),
        prebuilt: templates.filter(t => t.category === 'prebuilt'),
        shared: templates.filter(t => t.shared && t.owner !== 'current_user')
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSaveDialog(true)}
                    disabled={!currentConfig}
                >
                    <Save className="h-4 w-4 mr-2" />
                    Save as Template
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLibrary(true)}
                >
                    <FileText className="h-4 w-4 mr-2" />
                    Templates Library
                </Button>
            </div>

            {/* Save Template Dialog */}
            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save Hardware Template</DialogTitle>
                        <DialogDescription>
                            Create a reusable template from current hardware configuration
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Template Name</Label>
                            <Input
                                id="name"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="My Custom Template"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={templateDescription}
                                onChange={(e) => setTemplateDescription(e.target.value)}
                                placeholder="Optional description..."
                                rows={3}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="category">Category</Label>
                            <Select value={templateCategory} onValueChange={setTemplateCategory}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="custom">Custom</SelectItem>
                                    <SelectItem value="webserver">Web Server</SelectItem>
                                    <SelectItem value="database">Database</SelectItem>
                                    <SelectItem value="development">Development</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveTemplate} disabled={isSaving || !templateName}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Templates Library Dialog */}
            <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Hardware Templates Library</DialogTitle>
                        <DialogDescription>
                            Select a template to apply to this VM
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {Object.entries(categoryTemplates).map(([category, temps]) => (
                            temps.length > 0 && (
                                <div key={category}>
                                    <h3 className="font-semibold capitalize mb-2">{category}</h3>
                                    <div className="grid gap-2">
                                        {temps.map((template) => (
                                            <Card key={template.id} className="cursor-pointer hover:bg-muted/50">
                                                <CardHeader className="p-4">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <CardTitle className="text-base">{template.name}</CardTitle>
                                                            <CardDescription className="text-sm mt-1">
                                                                {template.description || 'No description'}
                                                            </CardDescription>
                                                            <p className="text-xs text-muted-foreground mt-2">
                                                                By {template.owner} • {new Date(template.createdAt).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    setSelectedTemplate(template);
                                                                    setShowApplyDialog(true);
                                                                }}
                                                            >
                                                                <Download className="h-4 w-4 mr-1" />
                                                                Apply
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteTemplate(template.id)}
                                                            >
                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )
                        ))}
                        {templates.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">
                                No templates found. Save your first template!
                            </p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Apply Confirmation Dialog */}
            <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Apply Template: {selectedTemplate?.name}</DialogTitle>
                        <DialogDescription>
                            This will overwrite the current hardware configuration with the template settings.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">
                            Template will apply the following configuration:
                        </p>
                        <div className="mt-2 p-3 bg-muted rounded-md text-sm font-mono">
                            <div>Memory: {selectedTemplate?.config?.memory || 'N/A'} MiB</div>
                            <div>Cores: {selectedTemplate?.config?.cores || 'N/A'}</div>
                            <div>Sockets: {selectedTemplate?.config?.sockets || 'N/A'}</div>
                            <div>CPU: {selectedTemplate?.config?.cpu || 'N/A'}</div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleApplyTemplate} disabled={isApplying}>
                            {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Apply Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
