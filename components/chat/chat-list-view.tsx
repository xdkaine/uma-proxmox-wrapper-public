"use client";

import { Users, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChatWidgetContext } from "./chat-context";

export function ChatListView() {
    const { state, actions } = useChatWidgetContext();
    const {
        searchQuery,
        searchResults,
        isSearching,
        onlineUsers,
        currentUser,
        recentChats,
        unreadCounts,
        groups,
    } = state;

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Search & Actions */}
            <div className="p-3 border-b bg-background/50 flex gap-2">
                <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => actions.setSearchQuery(e.target.value)}
                    className="h-9 bg-muted/50 border-none focus-visible:ring-1 flex-1"
                />
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    onClick={() => actions.setView("create-group")}
                    title="Create New Group"
                >
                    <Plus className="h-5 w-5" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* SEARCH RESULTS */}
                {searchQuery.length > 0 && (
                    <div className="mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2 mt-2">
                            {isSearching ? "Searching..." : "Results"}
                        </p>
                        {searchResults.map((user) => (
                            <div
                                key={user.id}
                                onClick={() =>
                                    actions.handleOpenChat(
                                        user.username,
                                        "user"
                                    )
                                }
                                className="flex items-center p-3 rounded-xl hover:bg-muted cursor-pointer transition-colors bg-card hover:text-accent-foreground text-card-foreground border border-border/40 mb-1"
                            >
                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold mr-3 text-primary border border-primary/10">
                                    {user.username.slice(0, 2).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium">
                                    {user.username}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* LIST CONTENT */}
                {searchQuery.length === 0 && (
                    <>
                        {/* Online Users Section */}
                        {(() => {
                            const onlineList = Array.from(
                                onlineUsers.keys()
                            ).filter((u) => u !== currentUser?.username);
                            if (onlineList.length === 0) return null;

                            return (
                                <div className="mb-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2 mt-2">
                                        Online Now
                                    </p>
                                    {onlineList.map((username) => {
                                        const profile = recentChats.find(
                                            (c) => c.username === username
                                        );
                                        const displayName =
                                            profile?.displayName || username;

                                        return (
                                            <div
                                                key={username}
                                                onClick={() =>
                                                    actions.handleOpenChat(
                                                        username,
                                                        "user"
                                                    )
                                                }
                                                className="flex items-center p-2.5 rounded-xl hover:bg-muted cursor-pointer transition-colors bg-card/50 text-card-foreground border border-border/20 mb-1"
                                            >
                                                <div className="relative h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold mr-3 text-primary border border-primary/10 shrink-0">
                                                    {username
                                                        .slice(0, 2)
                                                        .toUpperCase()}
                                                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background shadow-[0_0_4px_rgb(34,197,94)]" />
                                                </div>
                                                <span className="text-sm font-medium truncate">
                                                    {displayName}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        {/* Groups Section */}
                        {groups.length > 0 && (
                            <div className="mb-4">
                                <div className="flex items-center justify-between px-2 mb-2 mt-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Groups
                                    </p>
                                </div>
                                {groups.map((group: any) => (
                                    <div
                                        key={group.id}
                                        onClick={() =>
                                            actions.handleOpenChat(
                                                group.id,
                                                "group"
                                            )
                                        }
                                        className="flex items-center justify-between p-3 rounded-xl hover:bg-muted cursor-pointer transition-colors group relative overflow-hidden bg-card text-card-foreground border border-border/40 mb-1"
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold border border-primary/20">
                                                <Users className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="font-semibold text-sm truncate">
                                                    {group.name}
                                                </span>
                                                <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                                                    {group.lastMessage
                                                        ?.content ||
                                                        "No messages"}
                                                </span>
                                            </div>
                                        </div>
                                        {unreadCounts[group.id] > 0 && (
                                            <Badge className="h-5 min-w-[20px] rounded-full px-1.5 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
                                                {unreadCounts[group.id]}
                                            </Badge>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Direct Messages */}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2">
                                Direct Messages
                            </p>
                            {recentChats.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-24 text-muted-foreground opacity-50">
                                    <p className="text-xs">No recent DMs</p>
                                </div>
                            ) : (
                                recentChats.map((chat: any) => (
                                    <div
                                        key={chat.username}
                                        onClick={() =>
                                            actions.handleOpenChat(
                                                chat.username,
                                                "user"
                                            )
                                        }
                                        className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/80 cursor-pointer transition-colors group relative overflow-hidden"
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden relative z-10">
                                            <div className="relative shrink-0">
                                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-sm font-bold shadow-md">
                                                    {chat.username
                                                        .slice(0, 2)
                                                        .toUpperCase()}
                                                </div>
                                                {onlineUsers.has(
                                                    chat.username
                                                ) && (
                                                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background shadow-[0_0_4px_rgb(34,197,94)]" />
                                                )}
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="font-semibold text-sm truncate">
                                                    {chat.displayName ||
                                                        chat.username}
                                                </span>
                                                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                                                    {chat.lastMessage
                                                        ?.senderId ===
                                                        currentUser?.id &&
                                                        "You: "}
                                                    {chat.lastMessage
                                                        ?.content ||
                                                        "Sent an attachment"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-1 shrink-0 relative z-10">
                                            <span className="text-[10px] text-muted-foreground">
                                                {new Date(
                                                    chat.lastMessage?.createdAt
                                                ).toLocaleDateString() ===
                                                new Date().toLocaleDateString()
                                                    ? new Date(
                                                          chat.lastMessage?.createdAt
                                                      ).toLocaleTimeString(
                                                          [],
                                                          {
                                                              hour: "2-digit",
                                                              minute: "2-digit",
                                                          }
                                                      )
                                                    : new Date(
                                                          chat.lastMessage?.createdAt
                                                      ).toLocaleDateString()}
                                            </span>
                                            {unreadCounts[chat.username] >
                                                0 && (
                                                <Badge className="h-5 min-w-[20px] rounded-full px-1.5 flex items-center justify-center text-[10px] bg-red-500 hover:bg-red-600 shadow-sm animate-pulse">
                                                    {
                                                        unreadCounts[
                                                            chat.username
                                                        ]
                                                    }
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
