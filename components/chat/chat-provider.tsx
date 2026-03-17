"use client";

import { useEffect, useMemo } from 'react';
import { useChatStore } from '@/store/chat-store';
import { useUser } from '@/lib/swr-hooks';
import { ChatDataContext, type ChatDataContextValue } from './chat-data-context';

export function ChatProvider({ children }: { children: React.ReactNode }) {
    const {
        initializeSocket,
        disconnectSocket,
        setCurrentUser,
        currentUser,
        onlineUsers,
        chats,
        socket,
        sendMessage,
        loadChatHistory,
        publicChannelId,
        setPublicChannelId,
    } = useChatStore();
    const { user, isLoggedIn } = useUser();

    useEffect(() => {
        if (isLoggedIn && user) {
            // Initialize store with current user
            setCurrentUser({
                id: user.username, // Using username as ID for simplicity/consistency with existing auth
                username: user.username,
                displayName: user.displayName,
                settings: {},
            });

            initializeSocket();
        } else {
            disconnectSocket();
        }

        // Cleanup on unmount (though this provider is usually root)
        return () => {
            // disconnectSocket(); // Keep alive for navigation? Usually yes.
        };
    }, [user, isLoggedIn, initializeSocket, disconnectSocket, setCurrentUser]);

    const contextValue = useMemo<ChatDataContextValue>(() => ({
        state: {
            currentUser,
            onlineUsers,
            chats,
            socket,
            publicChannelId,
        },
        actions: {
            initializeSocket,
            sendMessage,
            loadChatHistory,
            setPublicChannelId,
        },
    }), [currentUser, onlineUsers, chats, socket, publicChannelId, initializeSocket, sendMessage, loadChatHistory, setPublicChannelId]);

    return (
        <ChatDataContext.Provider value={contextValue}>
            {children}
        </ChatDataContext.Provider>
    );
}
