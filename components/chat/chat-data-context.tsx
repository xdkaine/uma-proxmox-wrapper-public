"use client";

import { createContext, use } from "react";
import type { User, Message } from "@/store/chat-store";
import type { Socket } from "socket.io-client";

// ── Chat Data Context ──────────────────────────────────────────────
// A thin, store-level context exposed by ChatProvider at the app root.
// Used by components outside the ChatWidget that need chat data
// (e.g. ChatSidebar, HomeContent) without coupling to useChatStore.

export interface ChatDataState {
    currentUser: User | null;
    onlineUsers: Map<string, string>;
    chats: Record<string, Message[]>;
    socket: Socket | null;
    publicChannelId: string | null;
}

export interface ChatDataActions {
    initializeSocket: () => void;
    sendMessage: (target: string, content: string, isGroup?: boolean) => void;
    loadChatHistory: (target: string, isGroup?: boolean) => Promise<void>;
    setPublicChannelId: (id: string) => void;
}

export interface ChatDataContextValue {
    state: ChatDataState;
    actions: ChatDataActions;
}

export const ChatDataContext =
    createContext<ChatDataContextValue | null>(null);

export function useChatDataContext(): ChatDataContextValue {
    const ctx = use(ChatDataContext);
    if (!ctx) {
        throw new Error(
            "useChatDataContext must be used within a <ChatProvider>"
        );
    }
    return ctx;
}
