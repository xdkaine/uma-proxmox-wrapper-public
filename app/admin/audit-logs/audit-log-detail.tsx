"use client";

import { X } from "lucide-react";

type AuditLogRecord = {
    id: string;
    userId: string | null;
    username: string;
    action: string;
    resource: string;
    details: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    status: string;
    createdAt: string | Date;
};

interface AuditLogDetailProps {
    log: AuditLogRecord;
    onClose: () => void;
}

export default function AuditLogDetail({ log, onClose }: AuditLogDetailProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50 rounded-t-lg">
                    <h3 className="text-lg font-semibold text-foreground">{log.action} Details</h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">User</span>
                            <div className="text-foreground font-medium">{log.username}</div>
                            {log.userId && <div className="text-xs text-muted-foreground font-mono">{log.userId}</div>}
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Resource</span>
                            <div className="text-foreground font-medium">{log.resource}</div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Source</span>
                            <div className="text-foreground">{log.ipAddress || "Unknown IP"}</div>
                            {log.userAgent && <div className="text-xs text-muted-foreground truncate" title={log.userAgent}>{log.userAgent}</div>}
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
                            <div className={`${log.status === "SUCCESS" ? "text-green-500" :
                                log.status === "FAILURE" ? "text-red-500" : "text-yellow-500"
                                } font-medium`}>{log.status}</div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Raw Details</span>
                        <div className="bg-muted rounded-md p-4 border border-border font-mono text-xs overflow-x-auto text-foreground">
                            <pre>{JSON.stringify(log.details, null, 2)}</pre>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-border bg-muted/50 rounded-b-lg flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md text-sm transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
