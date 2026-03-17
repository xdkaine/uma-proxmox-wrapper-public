"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Message } from "@/store/chat-store";
import { useChatDataContext } from "@/components/chat/chat-data-context";
import { CustomLink } from "@/components/chat/message-renderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { safeFetch } from "@/lib/safe-fetch";

interface ChatSidebarProps {
    username: string;
}

export function ChatSidebar({ username }: ChatSidebarProps) {
    const { state, actions } = useChatDataContext();
    const { socket, chats, currentUser, publicChannelId } = state;
    const { sendMessage, loadChatHistory, setPublicChannelId } = actions;

    const [inputText, setInputText] = React.useState("");
    const [channelId, setChannelId] = React.useState<string | null>(publicChannelId);
    const [loading, setLoading] = React.useState(true);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    // Fetch public channel on mount
    React.useEffect(() => {
        const fetchChannel = async () => {
            try {
                const [_, res] = await Promise.all([
                    safeFetch("/api/user"),
                    safeFetch("/api/chat/public-channel", { method: "POST" })
                ]);
                if (res.ok) {
                    const data = await res.json();
                    setChannelId(data.channelId);
                    setPublicChannelId(data.channelId);

                    // Join the group room via socket
                    if (socket) {
                        socket.emit("join_group", data.channelId);
                    }

                    // Load history
                    await loadChatHistory(data.channelId, true);
                }
            } catch (e) {
                console.error("Failed to fetch public channel:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchChannel();
    }, [socket, loadChatHistory, setPublicChannelId]);

    // Auto-scroll on new messages
    const messages = channelId ? chats[channelId] || [] : [];
    const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : null;

    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [lastMessageId]);

    const handleSend = () => {
        if (!inputText.trim() || !channelId) return;
        sendMessage(channelId, inputText, true);
        setInputText("");
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Loading chat…
            </div>
        );
    }

    return (
        <>
            {/* Header */}
            <div className="p-3 border-b bg-muted/20 shrink-0">
                <h3 className="font-semibold text-sm">General Chat</h3>
                <p className="text-xs text-muted-foreground">Public channel for everyone</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground opacity-50">
                        No messages yet. Say hello!
                    </div>
                ) : (
                    messages.map((msg: Message) => {
                        const isMe = msg.sender?.username === username || msg.senderId === currentUser?.id;

                        return (
                            <div key={msg.id} className="flex gap-2">
                                {/* Avatar */}
                                <div className={cn(
                                    "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                                    isMe ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                                )}>
                                    {(msg.sender?.username || "?").slice(0, 2).toUpperCase()}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xs font-semibold truncate">
                                            {msg.sender?.displayName || msg.sender?.username || "Unknown"}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>
                                    <div className="text-sm prose prose-sm max-w-none dark:prose-invert break-words [&_p]:m-0 [&_p]:leading-relaxed">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{ a: CustomLink }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-2 border-t bg-background/60 shrink-0">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                    className="flex items-end gap-2 bg-muted/30 p-1.5 rounded-xl border focus-within:ring-2 focus-within:ring-primary/20 transition-all"
                >
                    <Textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Type a message…"
                        className="min-h-[36px] max-h-[80px] rounded-lg py-2 resize-none border-none focus-visible:ring-0 bg-transparent text-sm px-2"
                    />
                    <Button type="submit" size="icon" aria-label="Send message" className="h-8 w-8 rounded-lg shrink-0" disabled={!inputText.trim()}>
                        <Send className="h-3.5 w-3.5" />
                    </Button>
                </form>
            </div>
        </>
    );
}
