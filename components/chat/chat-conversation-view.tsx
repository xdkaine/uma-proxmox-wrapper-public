"use client";

import * as React from "react";
import {
    MessageCircle,
    Send,
    Smile,
    Edit2,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CustomLink } from "@/components/chat/message-renderer";
import { useChatStore } from "@/store/chat-store";
import { useChatWidgetContext } from "./chat-context";

export function ChatConversationView() {
    const { state, actions, meta } = useChatWidgetContext();
    const {
        chats,
        activeChatUser,
        currentUser,
        typingUsers,
        inputText,
    } = state;

    if (!activeChatUser) return null;

    const activeMessages = chats[activeChatUser] || [];

    return (
        <>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {activeMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-50">
                        <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                            <MessageCircle className="h-8 w-8 text-primary" />
                        </div>
                        <div className="text-sm">
                            Start of your history with{" "}
                            <span className="font-semibold">
                                {activeChatUser}
                            </span>
                        </div>
                    </div>
                ) : (
                    activeMessages.map((msg, i) => {
                        const isMe =
                            msg.sender?.username === currentUser?.username ||
                            msg.senderId === currentUser?.id;
                        return (
                            <div
                                key={msg.id || i}
                                className={cn(
                                    "flex w-full group",
                                    isMe ? "justify-end" : "justify-start"
                                )}
                            >
                                <div
                                    className={cn(
                                        "relative max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                                        isMe
                                            ? "bg-primary text-primary-foreground rounded-tr-none"
                                            : "bg-card text-card-foreground rounded-tl-none border border-border/50"
                                    )}
                                >
                                    {/* Message Content */}
                                    <div
                                        className={cn(
                                            "prose prose-sm max-w-none break-words leading-relaxed",
                                            isMe
                                                ? "text-primary-foreground [&_a]:text-blue-600 [&_a]:underline [&_a]:font-bold"
                                                : "dark:prose-invert text-foreground [&_a]:text-blue-500 hover:[&_a]:text-blue-600 [&_a]:underline"
                                        )}
                                    >
                                        {(() => {
                                            const BLOCKED_WORDS = [
                                                "badword",
                                                "spam",
                                            ];
                                            const hasBlockedWord =
                                                BLOCKED_WORDS.some((word) =>
                                                    msg.content
                                                        .toLowerCase()
                                                        .includes(
                                                            word.toLowerCase()
                                                        )
                                                );

                                            if (hasBlockedWord && !isMe) {
                                                return (
                                                    <span className="italic opacity-50 text-xs">
                                                        Message hidden (contains
                                                        blocked term)
                                                    </span>
                                                );
                                            }

                                            return (
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        a: CustomLink,
                                                        img: ({
                                                            node,
                                                            ...props
                                                        }) => (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                {...props}
                                                                className="rounded-lg my-2 max-h-[300px] object-cover border shadow-sm"
                                                                alt={
                                                                    props.alt ||
                                                                    "image"
                                                                }
                                                            />
                                                        ),
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            );
                                        })()}
                                    </div>

                                    {/* Metadata */}
                                    <div
                                        className={cn(
                                            "flex items-center gap-1.5 mt-1.5 opacity-70 text-[10px]",
                                            isMe
                                                ? "justify-end text-primary-foreground/80"
                                                : "justify-start text-muted-foreground"
                                        )}
                                    >
                                        <span>
                                            {new Date(
                                                msg.createdAt
                                            ).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                        {msg.editedAt && (
                                            <span className="italic">
                                                (edited)
                                            </span>
                                        )}
                                        {isMe && (
                                            <span className="flex items-center gap-0.5">
                                                {msg.read
                                                    ? "• Read"
                                                    : "• Sent"}
                                            </span>
                                        )}
                                    </div>

                                    {/* Hover Actions */}
                                    <div
                                        className={cn(
                                            "absolute -top-8 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-background/90 border-border/40 rounded-full shadow-md border p-1 flex items-center gap-1 backdrop-blur-sm z-10 text-foreground",
                                            isMe ? "right-0" : "left-0"
                                        )}
                                    >
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 rounded-full hover:bg-muted"
                                                >
                                                    <Smile className="h-3 w-3" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="center"
                                                className="w-[180px] p-2"
                                            >
                                                <div className="grid grid-cols-5 gap-1">
                                                    {meta.COMMON_EMOJIS.map(
                                                        (emoji) => (
                                                            <DropdownMenuItem
                                                                key={emoji}
                                                                asChild
                                                            >
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 hover:bg-muted cursor-pointer"
                                                                    onClick={() =>
                                                                        actions.addReaction(
                                                                            msg.id,
                                                                            emoji
                                                                        )
                                                                    }
                                                                >
                                                                    {emoji}
                                                                </Button>
                                                            </DropdownMenuItem>
                                                        )
                                                    )}
                                                </div>
                                            </DropdownMenuContent>
                                        </DropdownMenu>

                                        {isMe && !msg.deletedAt && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 rounded-full hover:bg-muted"
                                                    onClick={() =>
                                                        actions.openEditDialog(
                                                            msg.id,
                                                            msg.content
                                                        )
                                                    }
                                                >
                                                    <Edit2 className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive"
                                                    onClick={() =>
                                                        actions.openDeleteDialog(
                                                            msg.id
                                                        )
                                                    }
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </>
                                        )}
                                    </div>

                                    {/* Reactions Display */}
                                    {msg.reactions &&
                                        msg.reactions.length > 0 && (
                                            <div className="absolute -bottom-3 right-0 bg-background/90 border-border/40 text-[10px] px-1.5 py-0.5 rounded-full border shadow-sm flex items-center gap-0.5 backdrop-blur-sm z-10 text-foreground">
                                                {msg.reactions
                                                    .slice(0, 3)
                                                    .map((r) => r.emoji)
                                                    .join("")}
                                                {msg.reactions.length > 3 && (
                                                    <span className="font-bold ml-1">
                                                        +
                                                        {msg.reactions.length -
                                                            3}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={meta.messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-3 border-t bg-background/60 backdrop-blur-md sticky bottom-0">
                {/* Typing Indicator */}
                {typingUsers[activeChatUser] && (
                    <div className="text-xs text-muted-foreground ml-4 mb-1.5 flex items-center gap-1 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce delay-0" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce delay-75" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce delay-150" />
                        <span className="ml-1">
                            {activeChatUser} is typing...
                        </span>
                    </div>
                )}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        actions.handleSendMessage();
                    }}
                    className="flex items-end gap-2 bg-background p-1.5 rounded-3xl border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all"
                >
                    <Textarea
                        value={inputText}
                        onChange={(e) => {
                            const newVal = e.target.value;
                            actions.setInputText(newVal);

                            if (
                                newVal.length > 0 &&
                                inputText.length === 0
                            ) {
                                actions.sendTyping(activeChatUser, true);
                            } else if (
                                newVal.length === 0 &&
                                inputText.length > 0
                            ) {
                                actions.sendTyping(activeChatUser, false);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                actions.handleSendMessage();
                            }
                        }}
                        onBlur={() => {
                            if (inputText.length > 0) {
                                actions.sendTyping(activeChatUser, false);
                            }
                        }}
                        placeholder="Type a message..."
                        className="min-h-[36px] max-h-[120px] rounded-2xl py-2 resize-none border-none focus-visible:ring-0 bg-background text-foreground px-3 scrollbar-hide"
                        autoFocus
                    />
                    <Button
                        type="submit"
                        size="icon"
                        className="h-9 w-9 rounded-full shrink-0 shadow-sm"
                        disabled={!inputText.trim()}
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>
        </>
    );
}
