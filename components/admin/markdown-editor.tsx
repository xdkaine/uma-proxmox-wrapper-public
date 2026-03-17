"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Bold,
    Italic,
    List,
    Heading1,
    Heading2,
    Heading3,
    Link as LinkIcon,
    Image as ImageIcon,
    Code,
    Quote,
    Loader2,
    Eye,
    Edit2
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PausableMedia } from "@/components/ui/pausable-media";

interface MarkdownEditorProps {
    value: string;
    onChange: (value: string) => void;
    minHeight?: string;
    docId?: string;
}

export function MarkdownEditor({ value, onChange, minHeight = "400px", docId }: MarkdownEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [uploading, setUploading] = useState(false);
    const [tab, setTab] = useState("write");

    const insertText = (before: string, after: string = "") => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = value.substring(start, end);

        const newText = value.substring(0, start) + before + selectedText + after + value.substring(end);

        onChange(newText);

        // Reset selection/cursor
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + before.length, end + before.length);
        }, 0);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            toast.error("Please upload an image file");
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        if (docId) {
            formData.append("docId", docId);
        }

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) throw new Error("Upload failed");

            const data = await res.json();
            insertText(`![${file.name}](${data.url})`);
            toast.success("Image uploaded!");
        } catch (error) {
            console.error("Upload error:", error);
            toast.error("Failed to upload image");
        } finally {
            setUploading(false);
            e.target.value = ""; // Reset
        }
    };

    return (
        <div className="border rounded-lg overflow-hidden bg-background flex flex-col">
            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
                <div className="flex items-center justify-between border-b bg-muted/30 px-2">
                    {/* Toolbar - Only visible in Write mode */}
                    <div className={`flex items-center gap-1 p-2 overflow-x-auto ${tab === 'preview' ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("**", "**")} title="Bold">
                            <Bold className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("_", "_")} title="Italic">
                            <Italic className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-4 bg-border mx-1" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("# ")} title="H1">
                            <Heading1 className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("## ")} title="H2">
                            <Heading2 className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("### ")} title="H3">
                            <Heading3 className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-4 bg-border mx-1" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("- ")} title="List">
                            <List className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("> ")} title="Quote">
                            <Quote className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("`", "`")} title="Inline Code">
                            <Code className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-4 bg-border mx-1" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => insertText("[", "](url)")} title="Link">
                            <LinkIcon className="h-4 w-4" />
                        </Button>

                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                onChange={handleImageUpload}
                                disabled={uploading}
                                title="Upload Image"
                            />
                            <Button type="button" variant="ghost" size="sm" disabled={uploading}>
                                {uploading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <ImageIcon className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>

                    <TabsList className="h-9">
                        <TabsTrigger value="write" className="text-xs">
                            <Edit2 className="h-3.5 w-3.5 mr-1" /> Write
                        </TabsTrigger>
                        <TabsTrigger value="preview" className="text-xs">
                            <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="write" className="mt-0 flex-1 relative">
                    <Textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="border-0 focus-visible:ring-0 rounded-none font-mono resize-y p-4 min-h-[400px]"
                        style={{ minHeight: minHeight }}
                        placeholder="# Start writing your documentation here..."
                    />
                </TabsContent>

                <TabsContent value="preview" className="mt-0 flex-1 p-6 prose dark:prose-invert max-w-none overflow-y-auto min-h-[400px]" style={{ minHeight: minHeight }}>
                    {value ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                img: ({ node, src, alt, ...props }) => {
                                    // Helper to ensure paths are absolute
                                    const normalizeSrc = (s: string | null | undefined) => {
                                        if (!s) return "";
                                        if (s.startsWith("http") || s.startsWith("/")) return s;
                                        return `/${s}`;
                                    };

                                    return (
                                        <PausableMedia
                                            src={normalizeSrc(src as string)}
                                            alt={alt || ""}
                                            {...props}
                                            width={800}
                                            height={400}
                                            className="rounded-lg border"
                                        />
                                    );
                                }
                            }}
                        >
                            {value}
                        </ReactMarkdown>
                    ) : (
                        <div className="text-muted-foreground text-sm italic">Nothing to preview</div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
