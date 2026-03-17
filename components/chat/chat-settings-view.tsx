"use client";

import { Bell, BellOff, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useChatWidgetContext } from "./chat-context";

export function ChatSettingsView() {
    const { state, actions } = useChatWidgetContext();
    const { dnd } = state;

    return (
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center transition-colors",
                            dnd
                                ? "bg-destructive/10 text-destructive"
                                : "bg-primary/10 text-primary"
                        )}
                    >
                        {dnd ? (
                            <BellOff className="h-5 w-5" />
                        ) : (
                            <Bell className="h-5 w-5" />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                            Do Not Disturb
                        </span>
                        <span className="text-xs text-muted-foreground">
                            Mute all notifications
                        </span>
                    </div>
                </div>
                <Button
                    variant={dnd ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => actions.setDnd(!dnd)}
                >
                    {dnd ? "Enabled" : "Disabled"}
                </Button>
            </div>

            <div className="space-y-2">
                <h4 className="text-sm font-semibold px-1">
                    Privacy & Safety
                </h4>

                {/* Blocked Words */}
                <div className="p-3 rounded-xl border bg-card">
                    <div className="mb-2">
                        <label className="text-xs font-medium">
                            Blocked Words (Auto-hide)
                        </label>
                        <p className="text-[10px] text-muted-foreground">
                            Messages containing these words will be hidden.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Add a word..."
                            className="h-8 text-xs"
                        />
                        <Button size="sm" variant="secondary" className="h-8">
                            Add
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                        <Badge
                            variant="outline"
                            className="text-[10px] gap-1 px-1.5 py-0"
                        >
                            badword{" "}
                            <X className="h-2 w-2 cursor-pointer" />
                        </Badge>
                        <Badge
                            variant="outline"
                            className="text-[10px] gap-1 px-1.5 py-0"
                        >
                            spam{" "}
                            <X className="h-2 w-2 cursor-pointer" />
                        </Badge>
                    </div>
                </div>

                {/* Blocked Users */}
                <div className="rounded-xl border border-dashed p-4 flex flex-col items-center justify-center text-center space-y-2 bg-muted/10">
                    <UserX className="h-8 w-8 text-muted-foreground mb-1" />
                    <h4 className="text-sm font-semibold">Blocked Users</h4>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-1 h-7 text-xs"
                        disabled
                    >
                        Manage Blocklist
                    </Button>
                </div>
            </div>
        </div>
    );
}
