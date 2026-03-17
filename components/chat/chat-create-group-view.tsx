"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useChatWidgetContext } from "./chat-context";

export function ChatCreateGroupView() {
    const { state, actions } = useChatWidgetContext();
    const {
        groupName,
        selectedMembers,
        searchQuery,
        searchResults,
    } = state;

    return (
        <div className="flex-1 flex flex-col h-full bg-background/50">
            <div className="p-4 border-b">
                <h3 className="font-semibold">Create New Group</h3>
                <p className="text-xs text-muted-foreground">
                    Name your group and add members
                </p>
            </div>
            <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium">
                            Group Name
                        </label>
                        <Input
                            placeholder="e.g. Project Alpha"
                            value={groupName}
                            onChange={(e) =>
                                actions.setGroupName(e.target.value)
                            }
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium">
                            Add Members
                        </label>

                        {/* Selected Members */}
                        {selectedMembers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2 p-2 bg-muted/30 rounded-lg border border-border/50">
                                {selectedMembers.map((mid) => {
                                    const user = searchResults.find(
                                        (u) => u.id === mid
                                    ) || { username: mid.slice(0, 8) };
                                    return (
                                        <Badge
                                            key={mid}
                                            variant="secondary"
                                            className="pl-1 pr-2 py-0.5 h-7 flex items-center gap-1"
                                        >
                                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold">
                                                {mid
                                                    .slice(0, 1)
                                                    .toUpperCase()}
                                            </div>
                                            <span className="max-w-[100px] truncate">
                                                {mid}
                                            </span>
                                            <button
                                                className="ml-1 hover:bg-destructive/10 hover:text-destructive rounded-full p-0.5"
                                                onClick={() =>
                                                    actions.setSelectedMembers(
                                                        selectedMembers.filter(
                                                            (id) => id !== mid
                                                        )
                                                    )
                                                }
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    );
                                })}
                            </div>
                        )}

                        <Input
                            placeholder="Search users to add..."
                            value={searchQuery}
                            onChange={(e) =>
                                actions.setSearchQuery(e.target.value)
                            }
                        />

                        {/* Search Results */}
                        {searchQuery && (
                            <div className="border rounded-lg overflow-hidden bg-background shadow-sm mt-2">
                                <div className="max-h-[200px] overflow-y-auto">
                                    {searchResults.length === 0 ? (
                                        <div className="p-3 text-center text-xs text-muted-foreground">
                                            No users found
                                        </div>
                                    ) : (
                                        searchResults.map((user) => {
                                            const isSelected =
                                                selectedMembers.includes(
                                                    user.id
                                                );
                                            return (
                                                <div
                                                    key={user.id}
                                                    className={cn(
                                                        "flex items-center justify-between p-2.5 cursor-pointer transition-colors",
                                                        isSelected
                                                            ? "bg-primary/5 hover:bg-primary/10"
                                                            : "hover:bg-muted"
                                                    )}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            actions.setSelectedMembers(
                                                                selectedMembers.filter(
                                                                    (id) =>
                                                                        id !==
                                                                        user.id
                                                                )
                                                            );
                                                        } else {
                                                            actions.setSelectedMembers(
                                                                [
                                                                    ...selectedMembers,
                                                                    user.id,
                                                                ]
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                                                            {user.username
                                                                .slice(0, 2)
                                                                .toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">
                                                                {user.username}
                                                            </span>
                                                            {user.displayName && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {
                                                                        user.displayName
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {isSelected ? (
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            className="h-7 text-xs bg-primary/20 text-primary hover:bg-primary/30"
                                                        >
                                                            Added
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 text-xs border"
                                                        >
                                                            <Plus className="h-3 w-3 mr-1" />
                                                            Add
                                                        </Button>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="p-4 border-t">
                <Button
                    className="w-full"
                    onClick={actions.handleCreateGroup}
                    disabled={!groupName.trim()}
                >
                    Create Group
                </Button>
            </div>
        </div>
    );
}
