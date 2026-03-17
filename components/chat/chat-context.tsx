"use client";

import { createContext, use } from "react";
import type { User, Message, Reaction } from "@/store/chat-store";
import type { DragControls } from "framer-motion";

// ── State ──────────────────────────────────────────────────────────

export interface ChatWidgetState {
    // From store
    currentUser: User | null;
    onlineUsers: Map<string, string>;
    chats: Record<string, Message[]>;
    recentChats: any[];
    unreadCounts: Record<string, number>;
    activeChatUser: string | null;
    activeChatType: "user" | "group";
    dnd: boolean;
    blockedUsers: string[];
    groups: any[];
    typingUsers: Record<string, boolean>;

    // Widget-local
    isOpen: boolean;
    view: "list" | "chat" | "settings" | "create-group";
    inputText: string;
    searchQuery: string;
    searchResults: any[];
    isSearching: boolean;
    totalUnread: number;

    // Modals
    editId: string | null;
    editContent: string;
    isEditOpen: boolean;
    deleteId: string | null;
    isDeleteOpen: boolean;

    // Group creation
    groupName: string;
    selectedMembers: string[];

    // Notification
    notificationPreview: { sender: string; content: string } | null;

    // Widget position
    widgetPosition: { x: number; y: number };
}

// ── Actions ────────────────────────────────────────────────────────

export interface ChatWidgetActions {
    // Widget control
    toggle: () => void;
    setIsOpen: (open: boolean) => void;
    setView: (view: ChatWidgetState["view"]) => void;

    // Chat navigation
    handleOpenChat: (id: string, type?: "user" | "group") => void;
    handleBack: () => void;

    // Messaging
    handleSendMessage: () => void;
    setInputText: (text: string) => void;
    sendTyping: (target: string, isTyping: boolean) => void;

    // Search
    setSearchQuery: (query: string) => void;

    // Settings
    setDnd: (enabled: boolean) => void;

    // Edit message
    openEditDialog: (id: string, content: string) => void;
    closeEditDialog: () => void;
    confirmEdit: () => void;
    setEditContent: (content: string) => void;

    // Delete message
    openDeleteDialog: (id: string) => void;
    closeDeleteDialog: () => void;
    confirmDelete: () => void;

    // Reactions
    addReaction: (messageId: string, emoji: string) => void;

    // Groups
    setGroupName: (name: string) => void;
    setSelectedMembers: (members: string[]) => void;
    handleCreateGroup: () => Promise<void>;

    // Notification
    dismissNotification: () => void;

    // Drag
    handleDragEnd: (event: any, info: any) => void;
    getClampedPosition: (
        pos: { x: number; y: number },
        isWidgetOpen: boolean
    ) => { x: number; y: number };
}

// ── Meta ───────────────────────────────────────────────────────────

export interface ChatWidgetMeta {
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    widgetRef: React.RefObject<HTMLDivElement | null>;
    dragControls: DragControls;
    COMMON_EMOJIS: string[];
}

// ── Context ────────────────────────────────────────────────────────

export interface ChatWidgetContextValue {
    state: ChatWidgetState;
    actions: ChatWidgetActions;
    meta: ChatWidgetMeta;
}

export const ChatWidgetContext =
    createContext<ChatWidgetContextValue | null>(null);

export function useChatWidgetContext(): ChatWidgetContextValue {
    const ctx = use(ChatWidgetContext);
    if (!ctx) {
        throw new Error(
            "useChatWidgetContext must be used within a <ChatWidgetProvider>"
        );
    }
    return ctx;
}
