"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { CanvasDrawingBoard } from "@/components/whiteboard/excalidraw-wrapper";
import { Loader2 } from "lucide-react";

export function WhiteboardPanel() {
    const { socket } = useChatStore();
    const [initialStrokes, setInitialStrokes] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchState = async () => {
            try {
                const res = await fetch("/api/whiteboard");
                if (res.ok) {
                    const data = await res.json();
                    setInitialStrokes(Array.isArray(data.strokes) ? data.strokes : []);
                } else {
                    setInitialStrokes([]);
                }
            } catch (e) {
                console.error("Failed to fetch whiteboard state:", e);
                setInitialStrokes([]);
            } finally {
                setLoading(false);
            }
        };

        fetchState();
    }, []);

    if (loading || initialStrokes === null) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading whiteboard...
            </div>
        );
    }

    return (
        <CanvasDrawingBoard
            initialStrokes={initialStrokes}
            socket={socket}
        />
    );
}
