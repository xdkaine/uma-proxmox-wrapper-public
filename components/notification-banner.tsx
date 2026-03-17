'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, AlertTriangle, XCircle, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Notification {
    id: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    isActive: boolean;
    priority: number;
}

export function NotificationBanner() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchNotifications();

        // Poll for new notifications every 30 seconds
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications');
            const data = await res.json();
            setNotifications(data.notifications || []);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    const handleDismiss = (id: string) => {
        setDismissed(prev => new Set([...prev, id]));
    };

    const visibleNotifications = notifications.filter(n => !dismissed.has(n.id));

    if (visibleNotifications.length === 0) {
        return null;
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'info':
                return <Info className="h-4 w-4" />;
            case 'warning':
                return <AlertTriangle className="h-4 w-4" />;
            case 'error':
                return <XCircle className="h-4 w-4" />;
            case 'success':
                return <CheckCircle className="h-4 w-4" />;
            default:
                return <Info className="h-4 w-4" />;
        }
    };

    const getAlertVariant = (type: string): "default" | "destructive" => {
        return type === 'error' ? 'destructive' : 'default';
    };

    return (
        <div className="bg-background">
            <div className="w-full px-8 py-3 space-y-2">
                {visibleNotifications.map((notification) => (
                    <Alert
                        key={notification.id}
                        variant={getAlertVariant(notification.type)}
                        className="relative pr-12"
                    >
                        <div className="flex items-start gap-2">
                            {getIcon(notification.type)}
                            <AlertDescription className="flex-1">
                                {notification.message}
                            </AlertDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-2 h-6 w-6 rounded-full hover:bg-background/80"
                            onClick={() => handleDismiss(notification.id)}
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Dismiss notification</span>
                        </Button>
                    </Alert>
                ))}
            </div>
        </div>
    );
}
