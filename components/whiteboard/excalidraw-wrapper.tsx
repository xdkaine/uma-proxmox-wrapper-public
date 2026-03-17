"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useTheme } from "next-themes";
import type { Socket } from "socket.io-client";

interface Stroke {
    points: { x: number; y: number }[];
    color: string;
    width: number;
}

interface CanvasDrawingBoardProps {
    initialStrokes?: Stroke[];
    socket: Socket | null;
}

const COLORS = [
    "#000000", "#ffffff", "#ef4444", "#f97316", "#eab308",
    "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

export function CanvasDrawingBoard({ initialStrokes, socket }: CanvasDrawingBoardProps) {
    const { resolvedTheme } = useTheme();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef = useRef(false);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const allStrokesRef = useRef<Stroke[]>([]);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSyncPointsRef = useRef<{ x: number; y: number }[]>([]);
    const lastEmitTimeRef = useRef(0);
    const [height, setHeight] = useState(0);
    const [color, setColor] = useState("#000000");
    const [brushSize, setBrushSize] = useState(3);
    const [isEraser, setIsEraser] = useState(false);

    const colorRef = useRef(color);
    const brushSizeRef = useRef(brushSize);
    const isEraserRef = useRef(isEraser);
    useEffect(() => { colorRef.current = color; }, [color]);
    useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
    useEffect(() => { isEraserRef.current = isEraser; }, [isEraser]);

    const isDark = resolvedTheme === "dark";
    const bgColor = isDark ? "#1e1e2e" : "#ffffff";

    useEffect(() => {
        const calcHeight = () => {
            const h = Math.max(window.innerHeight - 100, 600);
            setHeight(h);
        };
        calcHeight();
        window.addEventListener("resize", calcHeight);
        return () => window.removeEventListener("resize", calcHeight);
    }, []);

    const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    }, []);

    const redrawCanvas = useCallback(() => {
        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const stroke of allStrokesRef.current) {
            drawStroke(ctx, stroke);
        }
    }, [bgColor, drawStroke]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || height === 0) return;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctxRef.current = ctx;

        if (initialStrokes && initialStrokes.length > 0 && allStrokesRef.current.length === 0) {
            allStrokesRef.current = [...initialStrokes];
        }
        redrawCanvas();
    }, [height, initialStrokes, redrawCanvas]);

    useEffect(() => {
        redrawCanvas();
    }, [isDark, redrawCanvas]);

    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            redrawCanvas();
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [redrawCanvas]);

    const scheduleSave = useCallback(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            if (socket) {
                socket.emit("draw_save", { strokes: allStrokesRef.current });
            }
        }, 5000);
    }, [socket]);

    const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        isDrawingRef.current = true;
        const point = getCanvasPoint(e);
        const strokeColor = isEraserRef.current ? bgColor : colorRef.current;
        currentStrokeRef.current = {
            points: [point],
            color: strokeColor,
            width: isEraserRef.current ? brushSizeRef.current * 4 : brushSizeRef.current,
        };
        pendingSyncPointsRef.current = [point];
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current || !currentStrokeRef.current) return;
        const ctx = ctxRef.current;
        if (!ctx) return;

        const point = getCanvasPoint(e);
        const stroke = currentStrokeRef.current;
        const lastPoint = stroke.points[stroke.points.length - 1];

        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();

        stroke.points.push(point);
        pendingSyncPointsRef.current.push(point);

        const now = Date.now();
        if (socket && (now - lastEmitTimeRef.current > 30 || pendingSyncPointsRef.current.length > 20)) {
            socket.emit("draw_stroke", {
                points: [...pendingSyncPointsRef.current],
                color: stroke.color,
                width: stroke.width,
            });
            pendingSyncPointsRef.current = [point];
            lastEmitTimeRef.current = now;
        }
    };

    const handlePointerUp = () => {
        if (!isDrawingRef.current || !currentStrokeRef.current) return;
        isDrawingRef.current = false;

        if (socket && pendingSyncPointsRef.current.length > 1) {
            socket.emit("draw_stroke", {
                points: [...pendingSyncPointsRef.current],
                color: currentStrokeRef.current.color,
                width: currentStrokeRef.current.width,
            });
        }
        pendingSyncPointsRef.current = [];

        if (currentStrokeRef.current.points.length >= 2) {
            allStrokesRef.current.push(currentStrokeRef.current);
            scheduleSave();
        }
        currentStrokeRef.current = null;
    };

    useEffect(() => {
        if (!socket) return;

        const handleRemoteStroke = (data: Stroke) => {
            const ctx = ctxRef.current;
            if (!ctx || !data.points || data.points.length < 2) return;
            drawStroke(ctx, data);
        };

        const handleRemoteClear = () => {
            allStrokesRef.current = [];
            redrawCanvas();
        };

        const handleSync = (data: { strokes: Stroke[] }) => {
            if (data.strokes) {
                allStrokesRef.current = data.strokes;
                redrawCanvas();
            }
        };

        socket.on("draw_stroke", handleRemoteStroke);
        socket.on("draw_clear", handleRemoteClear);
        socket.on("draw_sync", handleSync);

        return () => {
            socket.off("draw_stroke", handleRemoteStroke);
            socket.off("draw_clear", handleRemoteClear);
            socket.off("draw_sync", handleSync);
        };
    }, [socket, drawStroke, redrawCanvas]);

    const handleClear = () => {
        allStrokesRef.current = [];
        redrawCanvas();
        if (socket) {
            socket.emit("draw_clear");
        }
    };

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, []);

    if (height === 0) return null;

    return (
        <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-3 flex-wrap px-1">
                <div className="flex items-center gap-1">
                    {COLORS.map((c) => (
                        <button
                            key={c}
                            onClick={() => { setColor(c); setIsEraser(false); }}
                            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                                backgroundColor: c,
                                borderColor: color === c && !isEraser ? (isDark ? "#fff" : "#3b82f6") : (isDark ? "#555" : "#d1d5db"),
                                transform: color === c && !isEraser ? "scale(1.2)" : undefined,
                            }}
                            title={c}
                        />
                    ))}
                </div>

                <div className="w-px h-6 bg-border" />

                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Size</span>
                    <input
                        type="range"
                        min={1}
                        max={20}
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-20 h-1 accent-blue-500"
                    />
                    <span className="text-xs text-muted-foreground w-4">{brushSize}</span>
                </div>

                {/* Separator */}
                <div className="w-px h-6 bg-border" />

                <button
                    onClick={() => setIsEraser(!isEraser)}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${isEraser
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-background text-foreground border-border hover:bg-muted"
                        }`}
                >
                    Eraser
                </button>

                <button
                    onClick={handleClear}
                    className="px-3 py-1 text-xs rounded border border-red-300 text-red-500 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-950 transition-colors"
                >
                    Clear All
                </button>
            </div>

            <canvas
                ref={canvasRef}
                style={{
                    width: "100%",
                    height,
                    cursor: isEraser ? "crosshair" : "default",
                    borderRadius: "0.5rem",
                    border: isDark ? "1px solid #333" : "1px solid #e5e7eb",
                    touchAction: "none",
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            />
        </div>
    );
}
