import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';

export interface User {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
    settings?: any;
}

export interface Message {
    id: string;
    content: string;
    senderId: string;
    receiverId: string;
    sender?: User;
    createdAt: string; // ISO date
    read: boolean;
    editedAt?: string;
    deletedAt?: string;
    reactions?: Reaction[];
    type?: string;
    groupId?: string;
    receiver?: User;
}

export interface Reaction {
    id: string;
    emoji: string;
    userId: string;
    messageId: string;
}

interface ChatState {
    socket: Socket | null;
    isConnected: boolean;
    currentUser: User | null;

    // Roster
    onlineUsers: Map<string, string>; // username -> status

    // Messaging
    activeChatUser: string | null; // username we are talking to
    activeChatType: 'user' | 'group'; // active chat type
    chats: Record<string, Message[]>; // username -> messages
    recentChats: any[]; // List of recent conversations
    groups: any[]; // List of user's groups
    unreadCounts: Record<string, number>; // username -> count
    typingUsers: Record<string, boolean>; // username -> isTyping

    // Public channel
    publicChannelId: string | null;

    // Settings
    dnd: boolean;
    blockedUsers: string[];

    // Actions
    setPublicChannelId: (id: string | null) => void;
    setSocket: (socket: Socket | null) => void;
    initializeSocket: () => void;
    disconnectSocket: () => void;
    setCurrentUser: (user: User) => void;
    setActiveChat: (id: string | null, type?: 'user' | 'group') => void;
    sendMessage: (target: string, content: string, isGroup?: boolean) => void;
    sendTyping: (target: string, isTyping: boolean, isGroup?: boolean) => void;
    setTyping: (username: string, isTyping: boolean) => void; // Added based on diff
    setDnd: (enabled: boolean) => void;
    blockUser: (userId: string) => void; // Sync with backend needed

    // New Actions
    loadRecentChats: () => Promise<void>;
    loadChatHistory: (target: string, isGroup?: boolean) => Promise<void>;
    markMessagesAsRead: (target: string, isGroup?: boolean) => void;
    loadGroups: () => Promise<void>;
    createGroup: (name: string, memberIds: string[]) => Promise<any>;
    updateGroup: (groupId: string, data: any) => Promise<any>;

    editMessage: (messageId: string, content: string) => void;
    deleteMessage: (messageId: string) => void;
    addReaction: (messageId: string, emoji: string) => void;

    // Event Handlers (Internal/External use)
    addMessage: (message: Message, replace?: boolean) => void;
    updatePresence: (username: string, status: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
    socket: null,
    isConnected: false,
    currentUser: null,

    onlineUsers: new Map(),
    activeChatUser: null,
    activeChatType: 'user', // Added
    chats: {},
    recentChats: [],
    unreadCounts: {},
    typingUsers: {},
    groups: [], // Added
    publicChannelId: null,
    dnd: false,
    blockedUsers: [],

    setPublicChannelId: (id) => set({ publicChannelId: id }),

    setSocket: (socket) => set({ socket, isConnected: !!socket }), // Added
    initializeSocket: () => {
        if (get().socket) return;

        const socket = io({
            path: '/api/socket/io',
            addTrailingSlash: false,
        });

        socket.on('connect', () => {
            set({ isConnected: true });
            console.log('Socket connected');
            socket.emit('get_online_users');
        });

        socket.on('online_users_list', (users: string[]) => {
            set((state) => {
                const newOnline = new Map(state.onlineUsers);
                users.forEach(u => newOnline.set(u, 'online'));
                return { onlineUsers: newOnline };
            });
        });

        socket.on('disconnect', () => {
            set({ isConnected: false });
            console.log('Socket disconnected');
        });

        socket.on('presence', ({ username, status }: { username: string, status: string }) => {
            set((state) => {
                const newOnline = new Map(state.onlineUsers);
                if (status === 'offline') {
                    newOnline.delete(username);
                } else {
                    newOnline.set(username, status);
                }
                return { onlineUsers: newOnline };
            });
        });

        socket.on('new_message', (message: Message) => {
            // If we received a message, add it
            // Determine the chat key (username or groupId)
            let chatKey: string | undefined;
            if (message.groupId) {
                chatKey = message.groupId;
            } else if (message.sender?.username) {
                chatKey = message.sender.username;
            }

            if (!chatKey) return;

            const isActiveChat = get().activeChatUser === chatKey;

            get().addMessage(message);

            // If not active chat, increment unread
            if (!isActiveChat) {
                set(state => ({
                    unreadCounts: {
                        ...state.unreadCounts,
                        [chatKey!]: (state.unreadCounts[chatKey!] || 0) + 1
                    }
                }));

                // TODO: Sound effect if not DND
            }
        });

        socket.on('message_sent', (message: Message) => {
            // We sent a message, add it to our own view
            get().addMessage(message);
        });

        socket.on('error', (err: any) => {
            console.error('Socket error:', err);
            // Could enable a toast here
        });

        socket.on('user_typing', ({ from, isTyping }: { from: string, isTyping: boolean }) => {
            set(state => ({
                typingUsers: {
                    ...state.typingUsers,
                    [from]: isTyping
                }
            }));
        });

        socket.on('message_updated', (updatedMessage: Message) => {
            get().addMessage(updatedMessage, true); // replace = true
        });

        set({ socket });
    },

    disconnectSocket: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
            set({ socket: null, isConnected: false });
        }
    },

    setCurrentUser: (user) => set({ currentUser: user, dnd: user.settings?.dnd || false }),

    setActiveChat: (username, type = 'user') => {
        set({ activeChatUser: username, activeChatType: type });
        // Clear unread and mark as read
        if (username) {
            set(state => ({
                unreadCounts: { ...state.unreadCounts, [username]: 0 }
            }));

            // Trigger mark read logic
            const targetUser = get().recentChats.find(c => c.username === username);
            if (targetUser && targetUser.id) {
                get().markMessagesAsRead(targetUser.username);
            } else {
                // Fallback if we don't have ID yet
                const msgs = get().chats[username];
                if (msgs && msgs.length > 0) {
                    const partnerId = msgs[0].senderId === get().currentUser?.id ? msgs[0].receiverId : msgs[0].senderId;
                    if (partnerId) get().markMessagesAsRead(username); // Pass username, logic inside will resolve ID
                }
            }
        }
    },

    sendMessage: (target, content, isGroup = false) => {
        const { socket } = get();
        if (socket) {
            if (isGroup) {
                socket.emit('send_message', { groupId: target, content });
            } else {
                socket.emit('send_message', { to: target, content });
            }
        }
    },

    sendTyping: (to, isTyping) => {
        const { socket } = get();
        if (socket) {
            socket.emit('typing', { to, isTyping });
        }
    },

    editMessage: (messageId, content) => {
        const { socket } = get();
        if (socket) {
            socket.emit('edit_message', { messageId, content });
        }
    },

    deleteMessage: (messageId) => {
        const { socket } = get();
        if (socket) {
            socket.emit('delete_message', { messageId });
        }
    },

    addReaction: (messageId, emoji) => {
        const { socket } = get();
        if (socket) {
            socket.emit('add_reaction', { messageId, emoji });
        }
    },

    loadRecentChats: async () => {
        try {
            const res = await fetch('/api/chat/recent');
            if (res.ok) {
                const data = await res.json();

                // Update unread counts
                const newUnreadCounts: Record<string, number> = {};
                data.forEach((c: any) => {
                    if (c.unreadCount > 0) newUnreadCounts[c.username] = c.unreadCount;
                });

                set({ recentChats: data, unreadCounts: newUnreadCounts });
            }
        } catch (e) {
            console.error("Failed to load recent chats", e);
        }
    },

    loadChatHistory: async (target, isGroup = false) => {
        try {
            const url = isGroup
                ? `/api/chat/history/group?groupId=${target}`
                : `/api/chat/history?username=${target}`;
            const res = await fetch(url);
            if (res.ok) {
                const messages = await res.json();
                set(state => ({
                    chats: {
                        ...state.chats,
                        [target]: messages
                    }
                }));
            }
        } catch (e) {
            console.error("Failed to load chat history", e);
        }
    },

    markMessagesAsRead: (senderUsername) => {
        const { socket, currentUser } = get();

        // Find user ID from recent chats or message history
        let senderId = null;

        // Try to find in recent chats
        const contact = get().recentChats.find(c => c.username === senderUsername);
        if (contact) senderId = contact.id;

        // Try to find in existing messages
        if (!senderId) {
            const msgs = get().chats[senderUsername];
            if (msgs && msgs.length > 0) {
                // Or the 'receiver' if I sent it.
                const msg = msgs.find(m => m.sender?.username === senderUsername);
                if (msg) senderId = msg.senderId;
                else {
                    // If I only sent messages, I can grab receiverId from one of my sent messages
                    const myMsg = msgs.find(m => m.sender?.username === currentUser?.username);
                    if (myMsg) senderId = myMsg.receiverId;
                }
            }
        }

        if (socket && senderId) {
            socket.emit('mark_read', { senderId });

            // Update local state to show as read? (Optional, but good for UI)
        }
    },

    addMessage: (message: any, replace = false) => {
        set((state) => {
            let chatKey = "";

            // Group messages use groupId as the chat key
            if (message.groupId) {
                chatKey = message.groupId;
            } else if (message.sender?.username === state.currentUser?.username) {
                // DM: If I am the sender, the chat is with the RECEIVER
                chatKey = message.receiver?.username;
            } else {
                // DM: If I am the receiver, the chat is with the SENDER
                chatKey = message.sender?.username;
            }

            if (!chatKey) return {};

            const existing = state.chats[chatKey] || [];

            if (replace) {
                return {
                    chats: {
                        ...state.chats,
                        [chatKey]: existing.map(m => m.id === message.id ? message : m)
                    }
                };
            }

            // Verify it's not a duplicate
            if (existing.some(m => m.id === message.id)) return {};

            // UPDATE RECENT CHATS ORDER
            const newRecentChats = [...state.recentChats];
            const chatIndex = newRecentChats.findIndex(c => c.username === chatKey);

            let chatEntry;
            if (chatIndex > -1) {
                // Remove existing to re-insert at top
                chatEntry = { ...newRecentChats[chatIndex] };
                newRecentChats.splice(chatIndex, 1);
            } else {
                // Create new entry from message data
                const otherUser = message.sender.username === state.currentUser?.username ? message.receiver : message.sender;
                chatEntry = {
                    id: otherUser?.id,
                    username: otherUser?.username || chatKey,
                    displayName: otherUser?.displayName || otherUser?.username || chatKey,
                    avatar: otherUser?.avatar,
                    lastMessage: null
                };
            }

            // Update last message info
            chatEntry.lastMessage = {
                content: message.content,
                createdAt: message.createdAt
            };

            // Add to top
            newRecentChats.unshift(chatEntry);

            return {
                chats: {
                    ...state.chats,
                    [chatKey]: [...existing, message]
                },
                recentChats: newRecentChats
            };
        });
    },

    setDnd: (enabled) => {
        set({ dnd: enabled });
        // TODO: Emit to backend to persist
    },

    blockUser: (userId) => {
        // TODO: Backend call
    },

    updatePresence: (username, status) => {
        set((state) => {
            const newOnline = new Map(state.onlineUsers);
            if (status === 'offline') {
                newOnline.delete(username);
            } else {
                newOnline.set(username, status);
            }
            return { onlineUsers: newOnline };
        });
    },

    setTyping: (username, isTyping) => set(state => ({
        typingUsers: { ...state.typingUsers, [username]: isTyping }
    })),

    loadGroups: async () => {
        try {
            const res = await fetch('/api/groups');
            if (res.ok) {
                const groups = await res.json();
                set({ groups });
            }
        } catch (e) {
            console.error("Failed to load groups", e);
        }
    },

    createGroup: async (name, memberIds) => {
        try {
            const res = await fetch('/api/groups', {
                method: 'POST',
                body: JSON.stringify({ name, memberIds }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                const group = await res.json();
                set(state => ({ groups: [...state.groups, group] }));
                return group;
            }
        } catch (e) {
            console.error("Failed to create group", e);
        }
    },

    updateGroup: async (groupId, data) => {
        try {
            const res = await fetch(`/api/groups/${groupId}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                const updated = await res.json();
                set(state => ({
                    groups: state.groups.map((g: any) => g.id === groupId ? { ...g, ...updated } : g)
                }));
                return updated;
            }
        } catch (e) {
            console.error("Failed to update group", e);
        }
    }

}));
