"use client";

import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useChatWidgetContext } from "./chat-context";

export function ChatNotificationToast() {
    const { state, actions } = useChatWidgetContext();
    const { notificationPreview, isOpen } = state;

    return (
        <AnimatePresence>
            {notificationPreview && !isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    className="absolute bottom-16 right-0 w-64 bg-card/95 backdrop-blur-md border border-border/50 shadow-xl rounded-xl p-3 z-40 cursor-pointer hover:bg-card/100 transition-colors"
                    onClick={() => actions.setIsOpen(true)}
                >
                    <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {notificationPreview.sender
                                .slice(0, 2)
                                .toUpperCase()}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-bold text-foreground truncate">
                                {notificationPreview.sender}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-tight mt-0.5">
                                {notificationPreview.content}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 -mr-1 -mt-1 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                actions.dismissNotification();
                            }}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
