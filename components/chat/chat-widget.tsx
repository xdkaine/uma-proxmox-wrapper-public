"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { ChatWidgetProvider } from "./chat-widget-provider";
import { ChatFAB } from "./chat-fab";
import { ChatHeader } from "./chat-header";
import { ChatListView } from "./chat-list-view";
import { ChatConversationView } from "./chat-conversation-view";
import { ChatSettingsView } from "./chat-settings-view";
import { ChatCreateGroupView } from "./chat-create-group-view";
import { ChatEditDialog } from "./chat-edit-dialog";
import { ChatDeleteDialog } from "./chat-delete-dialog";
import { ChatNotificationToast } from "./chat-notification-toast";
import { useChatWidgetContext } from "./chat-context";

/** Inner shell that reads context to render the panel + FAB */
function ChatWidgetShell() {
    const { state, actions, meta } = useChatWidgetContext();
    const { isOpen, view, widgetPosition } = state;

    return (
        <motion.div
            ref={meta.widgetRef}
            className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3"
            style={{ x: widgetPosition.x, y: widgetPosition.y }}
            drag
            dragControls={meta.dragControls}
            dragMomentum={false}
            dragElastic={0}
            onDragEnd={actions.handleDragEnd}
        >
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    >
                        <Card className="w-[380px] h-[520px] flex flex-col shadow-2xl border-border/50 bg-card/95 backdrop-blur-xl rounded-2xl overflow-hidden">
                            <ChatHeader />
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {view === "list" && <ChatListView />}
                                {view === "chat" && <ChatConversationView />}
                                {view === "settings" && <ChatSettingsView />}
                                {view === "create-group" && <ChatCreateGroupView />}
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <ChatEditDialog />
            <ChatDeleteDialog />
            <ChatFAB />
            <ChatNotificationToast />
        </motion.div>
    );
}

/** Public compound root — wraps provider around shell */
export function ChatWidget() {
    return (
        <ChatWidgetProvider>
            <ChatWidgetShell />
        </ChatWidgetProvider>
    );
}
