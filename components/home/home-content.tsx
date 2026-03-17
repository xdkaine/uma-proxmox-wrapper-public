"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatDataContext } from "@/components/chat/chat-data-context";
import { WhiteboardPanel } from "./whiteboard-panel";
import { ChatSidebar } from "./chat-sidebar";

interface HomeContentProps {
    username: string;
    displayName: string;
}

export function HomeContent({ username, displayName }: HomeContentProps) {
    const { state, actions } = useChatDataContext();
    const { onlineUsers, socket } = state;

    useEffect(() => {
        if (!socket) {
            actions.initializeSocket();
        }
    }, [socket, actions]);

    const onlineCount = onlineUsers.size;

    return (
        <div className="flex flex-col h-[calc(100vh-5rem)] gap-4">
            {/* Welcome Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center justify-between"
            >
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Welcome back, {displayName}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Collaborative workspace
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <span>{onlineCount} online</span>
                    </div>
                    <Button asChild variant="default" size="sm">
                        <Link href="/dashboard" className="flex items-center gap-1.5">
                            Dashboard
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </motion.div>

            {/* Main Content: Whiteboard + Chat */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 min-h-0"
            >
                {/* Whiteboard Panel */}
                <div className="border rounded-xl overflow-hidden bg-card h-full">
                    <WhiteboardPanel />
                </div>

                {/* Chat Sidebar */}
                <div className="border rounded-xl overflow-hidden bg-card flex flex-col h-full">
                    <ChatSidebar username={username} />
                </div>
            </motion.div>
        </div>
    );
}
