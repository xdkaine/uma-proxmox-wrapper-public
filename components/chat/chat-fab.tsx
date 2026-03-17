"use client";

import { MessageCircle, X } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatWidgetContext } from "./chat-context";

export function ChatFAB() {
    const { state, actions } = useChatWidgetContext();
    const { isOpen, totalUnread } = state;

    return (
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
                size="lg"
                className={cn(
                    "h-14 w-14 rounded-full shadow-2xl transition-all duration-300",
                    isOpen
                        ? "bg-muted text-foreground hover:bg-muted/80"
                        : "bg-primary hover:bg-primary/90"
                )}
                onClick={actions.toggle}
            >
                {isOpen ? (
                    <X className="h-6 w-6" />
                ) : (
                    <div className="relative">
                        <MessageCircle className="h-6 w-6" />
                        {totalUnread > 0 && (
                            <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-background animate-in zoom-in">
                                {totalUnread}
                            </span>
                        )}
                    </div>
                )}
            </Button>
        </motion.div>
    );
}
