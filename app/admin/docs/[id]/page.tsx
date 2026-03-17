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
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import useSWR from "swr";
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
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { ImageUpload } from "@/components/admin/image-upload";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EditDocPage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;
    const { data: doc, error } = useSWR(id ? `/api/admin/docs/${id}` : null, fetcher);

    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        subtitle: "",
        author: "",
        content: "",
        coverImage: "",
        published: true,
    });

    useEffect(() => {
        if (doc) {
            setFormData({
                title: doc.title,
                subtitle: doc.subtitle || "",
                author: doc.author,
                content: doc.content,
                coverImage: doc.coverImage || "",
                published: doc.published,
            });
        }
    }, [doc]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch(`/api/admin/docs/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (!res.ok) throw new Error("Failed to update doc");

            toast.success("Doc updated successfully");
            router.push("/admin/docs");
        } catch (error) {
            console.error(error);
            toast.error("Failed to update doc");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        try {
            const res = await fetch(`/api/admin/docs/${id}`, {
                method: "DELETE",
            });

            if (!res.ok) throw new Error("Failed to delete doc");

            toast.success("Doc deleted successfully");
            router.push("/admin/docs");
        } catch (error) {
            console.error(error);
            toast.error("Failed to delete doc");
        }
    };

    if (error) return <div>Failed to load doc</div>;
    if (!doc) return <div>Loading...</div>;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/admin/docs">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold tracking-tight">Edit Documentation</h1>
                </div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete this
                                documentation article.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Doc Details</CardTitle>
                        <CardDescription>
                            Edit documentation article.
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="author">Author (Read-only)</Label>
                                <Input
                                    id="author"
                                    value={formData.author}
                                    disabled
                                    className="bg-muted"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Cover Image</Label>
                                <ImageUpload
                                    value={formData.coverImage}
                                    onChange={(url) => setFormData({ ...formData, coverImage: url })}
                                    placeholder="Upload cover image"
                                    docId={id}
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label>Content (Markdown)</Label>
                            <MarkdownEditor
                                value={formData.content}
                                onChange={(val) => setFormData({ ...formData, content: val })}
                                docId={id}
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
                                Save Changes
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    );
}
