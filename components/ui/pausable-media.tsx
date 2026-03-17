"use client";

import React, { useState, useRef, useEffect } from "react";
import Image, { ImageProps } from "next/image";
import { cn } from "@/lib/utils";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger
} from "@/components/ui/context-menu";
import { EyeOff, Pause, Play } from "lucide-react";

interface PausableMediaProps extends Omit<ImageProps, 'src'> {
    src: string;
    alt: string;
}

export function PausableMedia({ src, alt, className, ...props }: PausableMediaProps) {
    const [isPaused, setIsPaused] = useState(false);
    const [isHidden, setIsHidden] = useState(false);
    const [mediaType, setMediaType] = useState<"image" | "video">("image");

    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Detect if src is video
    useEffect(() => {
        if (src.match(/\.(mp4|webm|ogg)$/i)) {
            setMediaType("video");
        }
    }, [src]);

    const handlePauseToggle = () => {
        if (mediaType === "video") {
            if (videoRef.current) {
                if (isPaused) videoRef.current.play();
                else videoRef.current.pause();
                setIsPaused(!isPaused);
            }
        } else {
            // Logic for GIF/Image pausing
            if (!isPaused) {
                // Determine dimensions
                const img = imageRef.current;
                const canvas = canvasRef.current;

                if (img && canvas) {
                    canvas.width = img.clientWidth;
                    canvas.height = img.clientHeight;
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    }
                }
            }
            setIsPaused(!isPaused);
        }
    };

    const handleHideToggle = () => {
        setIsHidden(!isHidden);
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className={cn("relative group overflow-hidden", (props as any).fill && "w-full h-full", className)}>
                    
                    {/* Media Layer (visually hidden when isHidden is true, but NOT unmounted to preserve pause canvas state) */}
                    <div className={cn("w-full h-full absolute inset-0 transition-opacity duration-200", isHidden ? "opacity-0 pointer-events-none" : "opacity-100")}>
                        {mediaType === "video" ? (
                            <video
                                ref={videoRef}
                                src={src}
                                className={cn("object-cover w-full h-full")}
                                loop
                                muted
                                autoPlay
                                playsInline
                                {...(props as any)}
                            />
                        ) : (
                            <>
                                {/* The Real Image */}
                                <Image
                                    ref={imageRef}
                                    src={src}
                                    alt={alt}
                                    className={cn("w-full h-full object-cover", isPaused ? "invisible opacity-0 absolute top-0 left-0" : "")}
                                    {...props}
                                    unoptimized={!!src.endsWith('.gif') || src.startsWith('/uploads')} // Unoptimize local uploads and GIFs
                                />

                                {/* The "Paused" Canvas */}
                                <canvas
                                    ref={canvasRef}
                                    className={cn("w-full h-full object-cover", !isPaused ? "hidden" : "block")}
                                />
                            </>
                        )}
                    </div>

                    {/* Hidden Message Overlay */}
                    {isHidden && (
                        <div
                            className="bg-muted w-full h-full flex flex-col items-center justify-center text-muted-foreground text-xs italic cursor-pointer absolute inset-0 z-10"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsHidden(false);
                            }}
                        >
                            <div className="flex flex-col items-center gap-2">
                                <EyeOff className="h-4 w-4" />
                                <span>Media Hidden (Click to Show)</span>
                            </div>
                        </div>
                    )}

                    {/* Status Indicator (Optional, appears on hover if paused) */}
                    {isPaused && !isHidden && (
                        <div className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full backdrop-blur-sm pointer-events-none z-10">
                            <Pause className="h-3 w-3" />
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent 
                onClick={(e) => e.stopPropagation()} 
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
            >
                <ContextMenuItem 
                    onSelect={(e) => {
                        handlePauseToggle();
                        // Let the menu close automatically
                    }}
                >
                    {isPaused ? (
                        <>
                            <Play className="h-4 w-4 mr-2" /> Play
                        </>
                    ) : (
                        <>
                            <Pause className="h-4 w-4 mr-2" /> Pause
                        </>
                    )}
                </ContextMenuItem>
                <ContextMenuItem 
                    onSelect={(e) => {
                        handleHideToggle();
                    }}
                >
                    <EyeOff className="h-4 w-4 mr-2" /> {isHidden ? "Show" : "Hide"}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
