"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal, ExternalLink, Loader2, MonitorPlay, Maximize2, Minimize2, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { VncDisplay, VncDisplayHandle } from "./vnc-display";

// X11 keysyms used by noVNC
const XK = {
    Tab: 0xff09,
    Escape: 0xff1b,
    Control_L: 0xffe3,
    Alt_L: 0xffe9,
    Delete: 0xffff,
    F1: 0xffbe,
    F2: 0xffbf,
    F3: 0xffc0,
    F4: 0xffc1,
    F5: 0xffc2,
    F6: 0xffc3,
    F7: 0xffc4,
    F8: 0xffc5,
    F9: 0xffc6,
    F10: 0xffc7,
    F11: 0xffc8,
    F12: 0xffc9,
} as const;

interface VMConsoleProps {
    vmid: string;
    node: string;
    type: string;
}

type QualityPreset = "low" | "balanced" | "high" | "performance";

export function VMConsole({ vmid, node, type }: VMConsoleProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [ticketData, setTicketData] = useState<any>(null);
    const [proxmoxHost, setProxmoxHost] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [scaleToFit, setScaleToFit] = useState(true);
    const [resizeSession, setResizeSession] = useState(true);
    const [viewOnly, setViewOnly] = useState(false);
    const [qualityPreset, setQualityPreset] = useState<QualityPreset>("balanced");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const viewerRef = useRef<HTMLDivElement>(null);
    const vncRef = useRef<VncDisplayHandle>(null);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    const handleGetTicket = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/proxmox/vm/${vmid}/vnc`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node, type }),
            });
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || "Failed to generate VNC ticket");
            } else {
                setTicketData(data);
                if (data.proxmoxHost) {
                    setProxmoxHost(data.proxmoxHost);
                }
                toast.success("VNC Ticket generated successfully");
            }
        } catch (e) {
            toast.error("Failed to contact server");
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = () => {
        if (!proxmoxHost) {
            toast.error("Please enter the Proxmox Node IP/Hostname");
            return;
        }
        if (!ticketData) {
            toast.error("Generate a VNC ticket first");
            return;
        }
        setIsConnected(true);
    };

    const handleDisconnect = () => {
        setIsConnected(false);
    };

    const handleToggleFullscreen = async () => {
        if (!viewerRef.current) {
            return;
        }

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await viewerRef.current.requestFullscreen();
            }
        } catch (error) {
            toast.error("Failed to toggle fullscreen");
        }
    };


    // Construct WebSocket URL
    // Use local proxy to bypass Auth/SSL issues
    // Match the WebSocket protocol to the page protocol (http -> ws, https -> wss)
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? "wss" : "ws";
    const wsUrl = ticketData && typeof window !== 'undefined'
        ? `${protocol}://${window.location.host}/api/proxy/vnc?node=${node}&type=${type}&vmid=${vmid}&port=${ticketData.port}&ticket=${encodeURIComponent(ticketData.ticket)}`
        : "";


    return (
        <Card className="flex flex-col h-[calc(100vh-14rem)] min-h-[600px]">
            <CardHeader className="py-4 space-y-3">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Console Access</CardTitle>
                        <CardDescription>
                            Remote VNC access to {vmid}.
                        </CardDescription>
                    </div>
                    {ticketData && !isConnected && (
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="host" className="whitespace-nowrap">Node Host:</Label>
                                <Input
                                    id="host"
                                    className="w-48 h-8"
                                    placeholder="192.168.x.x"
                                    value={proxmoxHost}
                                    onChange={(e) => setProxmoxHost(e.target.value)}
                                />
                            </div>
                            <Button size="sm" onClick={handleConnect}>
                                <MonitorPlay className="mr-2 h-4 w-4" /> Connect
                            </Button>
                        </div>
                    )}
                    {isConnected && (
                        <div className="flex items-center gap-2">
                            <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="sm" variant="outline" onClick={() => { vncRef.current?.sendCtrlAltDel(); vncRef.current?.focus(); }}>
                                            Ctrl+Alt+Del
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Send Ctrl+Alt+Delete to guest</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">
                                        <Keyboard className="mr-2 h-4 w-4" /> Keys
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { vncRef.current?.sendKey(XK.Tab, "Tab"); vncRef.current?.focus(); }}>
                                        Tab
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { vncRef.current?.sendKey(XK.Escape, "Escape"); vncRef.current?.focus(); }}>
                                        Escape
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const).map((n) => (
                                        <DropdownMenuItem key={n} onClick={() => { vncRef.current?.sendKey(XK[`F${n}` as keyof typeof XK], `F${n}`); vncRef.current?.focus(); }}>
                                            F{n}
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => {
                                        vncRef.current?.sendKeys([
                                            { keysym: XK.Control_L, code: "ControlLeft" },
                                            { keysym: XK.Alt_L, code: "AltLeft" },
                                            { keysym: XK.F1, code: "F1" },
                                        ]);
                                        vncRef.current?.focus();
                                    }}>
                                        Ctrl+Alt+F1 (TTY1)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                        vncRef.current?.sendKeys([
                                            { keysym: XK.Control_L, code: "ControlLeft" },
                                            { keysym: XK.Alt_L, code: "AltLeft" },
                                            { keysym: XK.F2, code: "F2" },
                                        ]);
                                        vncRef.current?.focus();
                                    }}>
                                        Ctrl+Alt+F2 (TTY2)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                        vncRef.current?.sendKeys([
                                            { keysym: XK.Control_L, code: "ControlLeft" },
                                            { keysym: XK.Alt_L, code: "AltLeft" },
                                            { keysym: XK.F7, code: "F7" },
                                        ]);
                                        vncRef.current?.focus();
                                    }}>
                                        Ctrl+Alt+F7 (GUI)
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button size="sm" variant="outline" onClick={handleToggleFullscreen}>
                                {isFullscreen ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
                                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={handleDisconnect}>
                                Disconnect
                            </Button>
                        </div>
                    )}
                </div>
                {isConnected && (
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Switch id="scale-to-fit" checked={scaleToFit} onCheckedChange={setScaleToFit} />
                            <Label htmlFor="scale-to-fit">Scale to fit</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="resize-session" checked={resizeSession} onCheckedChange={setResizeSession} />
                            <Label htmlFor="resize-session">Resize guest</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="view-only" checked={viewOnly} onCheckedChange={setViewOnly} />
                            <Label htmlFor="view-only">View only</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="quality">Quality</Label>
                            <Select value={qualityPreset} onValueChange={(value) => setQualityPreset(value as QualityPreset)}>
                                <SelectTrigger id="quality" className="h-8 w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low bandwidth</SelectItem>
                                    <SelectItem value="balanced">Balanced</SelectItem>
                                    <SelectItem value="high">High quality</SelectItem>
                                    <SelectItem value="performance">Fast / Low delay</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
            </CardHeader>
            <CardContent className="flex-1 p-0 relative bg-black">
                {!isConnected ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6 text-white bg-slate-900/50">
                        {!ticketData ? (
                            <div className="text-center space-y-4 p-6 bg-background/90 rounded-lg text-foreground shadow-lg border">
                                <Terminal className="h-16 w-16 text-muted-foreground mx-auto" />
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">No Active Session</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto">
                                        Generate a VNC ticket to secure a connection to the console.
                                    </p>
                                </div>
                                <Button onClick={handleGetTicket} disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                                    Generate Access Ticket
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center space-y-4 p-6 bg-background/90 rounded-lg text-foreground shadow-lg border max-w-md">
                                <Alert className="text-left">
                                    <Terminal className="h-4 w-4" />
                                    <AlertTitle>Ticket Ready</AlertTitle>
                                    <AlertDescription>
                                        Enter the Proxmox Node IP (where port 8006 is reachable) above and click Connect.
                                    </AlertDescription>
                                </Alert>
                                <div className="text-xs text-muted-foreground text-left">
                                    <p><strong>Node:</strong> {node}</p>
                                    <p><strong>Port:</strong> {ticketData.port}</p>
                                    <p><strong>Ticket:</strong> Ends with ...{ticketData.ticket?.slice(-10)}</p>
                                    <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/50 rounded text-yellow-500">
                                        <p>Connection failed? You may need to trust the certificate.</p>
                                        <a
                                            href={`https://${proxmoxHost}:8006`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline font-semibold hover:text-yellow-400"
                                        >
                                            Click here to open Node & accept cert
                                        </a>
                                    </div>
                                </div>
                                <Button variant="outline" onClick={() => setTicketData(null)}>
                                    Cancel / Reset
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <VncDisplay
                        ref={vncRef}
                        url={wsUrl}
                        password={ticketData?.ticket}
                        scaleViewport={scaleToFit}
                        resizeSession={resizeSession}
                        viewOnly={viewOnly}
                        qualityPreset={qualityPreset}
                        containerRef={viewerRef}
                        onDisconnect={handleDisconnect}
                    />
                )}
            </CardContent>
        </Card>
    );
}
