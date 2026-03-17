"use client";

import { ArrowLeft, Settings, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatWidgetContext } from "./chat-context";

export function ChatHeader() {
    const { state, actions } = useChatWidgetContext();
    const { view, activeChatUser, onlineUsers } = state;

    return (
        <div className="p-3 border-b flex flex-row items-center justify-between space-y-0 text-sm bg-muted/30 cursor-grab active:cursor-grabbing select-none">
            <div className="flex items-center gap-2">
                {view !== "list" ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="-ml-2 h-7 w-7"
                        onClick={actions.handleBack}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                ) : null}

                <div className="font-semibold flex items-center gap-2 text-foreground">
                    {view === "chat" ? (
                        <span className="flex items-center gap-2">
                            <span
                                className={cn(
                                    "h-2 w-2 rounded-full",
                                    onlineUsers.has(activeChatUser!)
                                        ? "bg-green-500 shadow-[0_0_8px_rgb(34,197,94)]"
                                        : "bg-gray-400"
                                )}
                            />
                            {activeChatUser}
                        </span>
                    ) : view === "settings" ? (
                        "Settings"
                    ) : (
                        "Messages"
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                        actions.setView(
                            view === "settings" ? "list" : "settings"
                        )
                    }
                >
                    {view === "settings" ? (
                        <X className="h-4 w-4" />
                    ) : (
                        <Settings className="h-4 w-4" />
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive"
                    onClick={() => actions.setIsOpen(false)}
                >
                    <Minimize2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
