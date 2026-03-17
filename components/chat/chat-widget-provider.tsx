"use client";

import * as React from "react";
import { useDragControls } from "framer-motion";
import { useChatStore } from "@/store/chat-store";
import {
    ChatWidgetContext,
    type ChatWidgetState,
    type ChatWidgetActions,
    type ChatWidgetMeta,
} from "./chat-context";

const COMMON_EMOJIS = [
    "👍",
    "❤️",
    "😂",
    "😮",
    "😢",
    "😡",
    "🔥",
    "🎉",
    "👀",
    "🚀",
];

export function ChatWidgetProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    // ── Zustand store ─────────────────────────────────────────────
    const {
        currentUser,
        onlineUsers,
        chats,
        recentChats,
        loadRecentChats,
        loadChatHistory,
        unreadCounts,
        activeChatUser,
        activeChatType,
        setActiveChat,
        sendMessage,
        dnd,
        setDnd,
        blockedUsers,
        editMessage,
        deleteMessage,
        addReaction,
        groups,
        loadGroups,
        createGroup,
        typingUsers,
    } = useChatStore();

    // ── Widget-local state ────────────────────────────────────────
    const [isOpen, setIsOpen] = React.useState(false);
    const [view, setView] = React.useState<ChatWidgetState["view"]>("list");
    const [inputText, setInputText] = React.useState("");
    const [searchQuery, setSearchQuery] = React.useState("");
    const [searchResults, setSearchResults] = React.useState<any[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);

    // Modals
    const [deleteId, setDeleteId] = React.useState<string | null>(null);
    const [editId, setEditId] = React.useState<string | null>(null);
    const [editContent, setEditContent] = React.useState("");
    const [isEditOpen, setIsEditOpen] = React.useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

    // Group creation
    const [groupName, setGroupName] = React.useState("");
    const [selectedMembers, setSelectedMembers] = React.useState<string[]>([]);

    // Scroll
    const messagesEndRef = React.useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);

    // Drag
    const dragControls = useDragControls();
    const widgetRef = React.useRef<HTMLDivElement>(null);
    const [widgetPosition, setWidgetPosition] = React.useState({ x: 0, y: 0 });
    const [windowSize, setWindowSize] = React.useState({
        width: 0,
        height: 0,
    });

    // Notification
    const [notificationPreview, setNotificationPreview] = React.useState<{
        sender: string;
        content: string;
    } | null>(null);
    const prevUnreadCountRef = React.useRef(0);

    // ── Derived ───────────────────────────────────────────────────
    const totalUnread = Object.values(unreadCounts).reduce(
        (a, b) => a + b,
        0
    );

    // ── Drag helpers ──────────────────────────────────────────────
    const getClampedPosition = React.useCallback(
        (
            currentPos: { x: number; y: number },
            isWidgetOpen: boolean
        ) => {
            if (typeof window === "undefined") return currentPos;

            const WIDGET_WIDTH = isWidgetOpen ? 400 : 60;
            const WIDGET_HEIGHT = isWidgetOpen ? 600 : 60;
            const MARGIN_RIGHT = 24;
            const MARGIN_BOTTOM = 24;
            const SAFETY_MARGIN = 10;

            const { width: winW, height: winH } =
                windowSize.width > 0
                    ? windowSize
                    : { width: window.innerWidth, height: window.innerHeight };

            const minX =
                SAFETY_MARGIN - winW + MARGIN_RIGHT + WIDGET_WIDTH;
            const maxX = 0;
            const minY =
                SAFETY_MARGIN - winH + MARGIN_BOTTOM + WIDGET_HEIGHT;
            const maxY = 0;

            return {
                x: Math.max(minX, Math.min(maxX, currentPos.x)),
                y: Math.max(minY, Math.min(maxY, currentPos.y)),
            };
        },
        [windowSize]
    );

    // ── Effects ───────────────────────────────────────────────────

    // Load recent chats & groups on open
    React.useEffect(() => {
        if (isOpen && currentUser) {
            loadRecentChats();
            loadGroups();
        }
    }, [isOpen, currentUser]);

    // Load history when entering chat
    React.useEffect(() => {
        if (view === "chat" && activeChatUser) {
            loadChatHistory(activeChatUser, activeChatType === "group");
            setShouldAutoScroll(true);
        }
    }, [view, activeChatUser, activeChatType]);

    // Search users
    React.useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.trim().length > 0) {
                setIsSearching(true);
                try {
                    const res = await fetch(
                        `/api/users/search?q=${encodeURIComponent(searchQuery)}`
                    );
                    const data = await res.json();
                    setSearchResults(Array.isArray(data) ? data : []);
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Scroll to bottom on new messages
    const activeMessages = activeChatUser ? chats[activeChatUser] : [];
    const lastMessageId =
        activeMessages && activeMessages.length > 0
            ? activeMessages[activeMessages.length - 1].id
            : null;

    React.useEffect(() => {
        if (view === "chat") {
            if (shouldAutoScroll) {
                messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
                setShouldAutoScroll(false);
            } else {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
        }
    }, [lastMessageId, view, shouldAutoScroll]);

    // Notification preview
    React.useEffect(() => {
        if (totalUnread > prevUnreadCountRef.current && !isOpen) {
            const unreadChats = recentChats.filter(
                (c) => unreadCounts[c.username] > 0
            );
            if (unreadChats.length > 0) {
                unreadChats.sort(
                    (a, b) =>
                        new Date(b.lastMessage?.createdAt || 0).getTime() -
                        new Date(a.lastMessage?.createdAt || 0).getTime()
                );
                const latest = unreadChats[0];
                if (latest?.lastMessage) {
                    setNotificationPreview({
                        sender: latest.displayName || latest.username,
                        content: latest.lastMessage.content,
                    });
                    const timer = setTimeout(
                        () => setNotificationPreview(null),
                        5000
                    );
                    return () => clearTimeout(timer);
                }
            }
        }
        prevUnreadCountRef.current = totalUnread;
    }, [totalUnread, recentChats, unreadCounts, isOpen]);

    // Drag — load position + resize handler
    React.useEffect(() => {
        const saved = localStorage.getItem("chat_widget_position");
        if (saved) {
            try {
                setWidgetPosition(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse widget position", e);
            }
        }

        const handleResize = () => {
            setWindowSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
            setWidgetPosition((prev) => getClampedPosition(prev, isOpen));
        };

        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Re-check bounds when isOpen or windowSize changes
    React.useEffect(() => {
        setWidgetPosition((prev) => {
            const clamped = getClampedPosition(prev, isOpen);
            if (clamped.x !== prev.x || clamped.y !== prev.y) return clamped;
            return prev;
        });
    }, [isOpen, windowSize, getClampedPosition]);

    // ── Actions ───────────────────────────────────────────────────
    const actions: ChatWidgetActions = React.useMemo(() => {
        const toggle = () => setIsOpen((v) => !v);

        const handleOpenChat = (
            id: string,
            type: "user" | "group" = "user"
        ) => {
            setActiveChat(id, type);
            setView("chat");
            setSearchQuery("");
        };

        const handleBack = () => {
            setView("list");
            setActiveChat(null);
            loadRecentChats();
            loadGroups();
        };

        const handleSendMessage = () => {
            if (!inputText.trim() || !activeChatUser) return;
            sendMessage(
                activeChatUser,
                inputText,
                activeChatType === "group"
            );
            setInputText("");
            setShouldAutoScroll(true);
        };

        const openEditDialog = (id: string, content: string) => {
            setEditId(id);
            setEditContent(content);
            setIsEditOpen(true);
        };

        const closeEditDialog = () => setIsEditOpen(false);

        const confirmEdit = () => {
            if (editId && editContent.trim()) {
                editMessage(editId, editContent);
                setIsEditOpen(false);
            }
        };

        const openDeleteDialog = (id: string) => {
            setDeleteId(id);
            setIsDeleteOpen(true);
        };

        const closeDeleteDialog = () => setIsDeleteOpen(false);

        const confirmDelete = () => {
            if (deleteId) {
                deleteMessage(deleteId);
                setIsDeleteOpen(false);
            }
        };

        const handleCreateGroup = async () => {
            if (!groupName.trim()) return;
            const res = await createGroup(groupName, selectedMembers);
            if (res?.id) {
                setGroupName("");
                setSelectedMembers([]);
                handleOpenChat(res.id, "group");
            }
        };

        const dismissNotification = () => setNotificationPreview(null);

        const handleDragEnd = (_event: any, info: any) => {
            const potentialPos = {
                x: widgetPosition.x + info.offset.x,
                y: widgetPosition.y + info.offset.y,
            };
            const clamped = getClampedPosition(potentialPos, isOpen);
            setWidgetPosition(clamped);
            localStorage.setItem(
                "chat_widget_position",
                JSON.stringify(clamped)
            );
        };

        const sendTypingAction = (target: string, isTyping: boolean) => {
            useChatStore.getState().sendTyping(target, isTyping);
        };

        return {
            toggle,
            setIsOpen,
            setView,
            handleOpenChat,
            handleBack,
            handleSendMessage,
            setInputText,
            sendTyping: sendTypingAction,
            setSearchQuery,
            setDnd,
            openEditDialog,
            closeEditDialog,
            confirmEdit,
            setEditContent,
            openDeleteDialog,
            closeDeleteDialog,
            confirmDelete,
            addReaction,
            setGroupName,
            setSelectedMembers,
            handleCreateGroup,
            dismissNotification,
            handleDragEnd,
            getClampedPosition,
        };
    }, [
        inputText,
        activeChatUser,
        activeChatType,
        editId,
        editContent,
        deleteId,
        groupName,
        selectedMembers,
        widgetPosition,
        isOpen,
        sendMessage,
        setActiveChat,
        loadRecentChats,
        loadGroups,
        editMessage,
        deleteMessage,
        addReaction,
        createGroup,
        setDnd,
        getClampedPosition,
    ]);

    // ── Assemble context ──────────────────────────────────────────
    const state: ChatWidgetState = {
        currentUser,
        onlineUsers,
        chats,
        recentChats,
        unreadCounts,
        activeChatUser,
        activeChatType,
        dnd,
        blockedUsers,
        groups,
        typingUsers,
        isOpen,
        view,
        inputText,
        searchQuery,
        searchResults,
        isSearching,
        totalUnread,
        editId,
        editContent,
        isEditOpen,
        deleteId,
        isDeleteOpen,
        groupName,
        selectedMembers,
        notificationPreview,
        widgetPosition,
    };

    const metaValue: ChatWidgetMeta = {
        messagesEndRef,
        widgetRef,
        dragControls,
        COMMON_EMOJIS,
    };

    return (
        <ChatWidgetContext value={{ state, actions, meta: metaValue }}>
            {children}
        </ChatWidgetContext>
    );
}
