"use client";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { ImageUpload } from "@/components/admin/image-upload";

export default function CreateDocPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        subtitle: "",
        content: "",
        coverImage: "",
        published: true,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/admin/docs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (!res.ok) throw new Error("Failed to create doc");

            toast.success("Doc created successfully");
            router.push("/admin/docs");
        } catch (error) {
            console.error(error);
            toast.error("Failed to create doc");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/docs">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">Create Documentation</h1>
            </div>

            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Doc Details</CardTitle>
                        <CardDescription>
                            Create a new documentation article. Author will be set automatically.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="title">Title</Label>
                            <Input
                                id="title"
                                required
                                value={formData.title}
                                onChange={(e) =>
                                    setFormData({ ...formData, title: e.target.value })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="subtitle">Subtitle</Label>
                            <Input
                                id="subtitle"
                                value={formData.subtitle}
                                onChange={(e) =>
                                    setFormData({ ...formData, subtitle: e.target.value })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label>Cover Image</Label>
                            <ImageUpload
                                value={formData.coverImage}
                                onChange={(url) => setFormData({ ...formData, coverImage: url })}
                                placeholder="Upload cover image"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label>Content (Markdown)</Label>
                            <MarkdownEditor
                                value={formData.content}
                                onChange={(val) => setFormData({ ...formData, content: val })}
                            />
                        </div>

                        <div className="flex items-center space-x-2">
                            <Switch
                                id="published"
                                checked={formData.published}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, published: checked })
                                }
                            />
                            <Label htmlFor="published">Published</Label>
                        </div>

                        <div className="flex justify-end gap-4">
                            <Button type="button" variant="outline" asChild>
                                <Link href="/admin/docs">Cancel</Link>
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Doc
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    );
}
