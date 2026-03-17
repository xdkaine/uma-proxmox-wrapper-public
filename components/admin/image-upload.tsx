"use client";

import { ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { PausableMedia } from "@/components/ui/pausable-media";
import { toast } from "sonner";

interface ImageUploadProps {
    value: string;
    onChange: (url: string) => void;
    placeholder?: string;
    docId?: string;
}

export function ImageUpload({ value, onChange, placeholder = "Upload an image", docId }: ImageUploadProps) {
    const [loading, setLoading] = useState(false);

    const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Basic validation
        if (!file.type.startsWith("image/")) {
            toast.error("Please upload an image file");
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast.error("Image size too large (max 5MB)");
            return;
        }

        setLoading(true);
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

            if (!res.ok) {
                if (res.status === 413) {
                    throw new Error("Image too large for server");
                }
                throw new Error("Upload failed");
            }

            const data = await res.json();
            onChange(data.url);
            toast.success("Image uploaded successfully");
        } catch (error) {
            console.error("Upload error:", error);
            toast.error("Failed to upload image");
        } finally {
            setLoading(false);
            // Reset input
            e.target.value = "";
        }
    };

    const handleRemove = () => {
        onChange("");
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <div className="relative">
                    {value ? (
                        <div className="relative h-40 w-40 rounded-lg overflow-hidden border bg-muted">
                            <PausableMedia
                                src={value}
                                alt="Preview"
                                fill
                                className="object-cover"
                            />
                            <div className="absolute top-1 right-1 z-10">
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-6 w-6 rounded-full"
                                    onClick={handleRemove}
                                    type="button"
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 w-40 rounded-lg border border-dashed bg-muted/50 text-muted-foreground">
                            <ImageIcon className="h-10 w-10 mb-2 opacity-50" />
                            <span className="text-xs">No image</span>
                        </div>
                    )}
                </div>

                <div className="flex-1 space-y-2">
                    {/* 
                        Isolate the file input to prevent "Node.insertBefore" errors.
                        Browser extensions often inject elements next to inputs. If the input is a sibling 
                        of a component that re-renders (like the Button below showing loading state),
                        React's reconciliation can fail.
                    */}
                    <div className="hidden">
                        <Input
                            type="file"
                            accept="image/*"
                            onChange={handleUpload}
                            disabled={loading}
                            id="image-upload-input"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={loading}
                            onClick={() => document.getElementById("image-upload-input")?.click()}
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Upload className="h-4 w-4 mr-2" />
                            )}
                            {value ? "Change Image" : "Upload Image"}
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Max file size: 5MB. Supports JPG, PNG, WEBP.
                    </div>

                    {/* Fallback URL input */}
                    <Input
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Or enter image URL..."
                        className="text-xs h-8 font-mono"
                    />
                </div>
            </div>
        </div>
    );
}
