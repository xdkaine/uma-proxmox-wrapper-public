"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatWidgetContext } from "./chat-context";

export function ChatEditDialog() {
    const { state, actions } = useChatWidgetContext();
    const { isEditOpen, editContent } = state;

    return (
        <Dialog open={isEditOpen} onOpenChange={actions.closeEditDialog}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Message</DialogTitle>
                    <DialogDescription>
                        Make changes to your message here.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Textarea
                        value={editContent}
                        onChange={(e) =>
                            actions.setEditContent(e.target.value)
                        }
                        className="min-h-[100px]"
                        placeholder="Type your message..."
                    />
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={actions.closeEditDialog}
                    >
                        Cancel
                    </Button>
                    <Button onClick={actions.confirmEdit}>
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
