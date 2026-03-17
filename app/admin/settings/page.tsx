'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Trash2, Plus, Search, ArrowLeft, Edit, Bell, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface AccessConfig {
    adminGroups: string[];
    allowedGroups: string[];
}

interface GroupResult {
    cn: string;
    dn: string;
    description?: string;
}

interface Notification {
    id: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    isActive: boolean;
    priority: number;
    createdAt: string;
    updatedAt: string;
}

interface NotificationFormData {
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    priority: number;
    isActive: boolean;
}

export default function SettingsPage() {
    const [config, setConfig] = useState<AccessConfig>({ adminGroups: [], allowedGroups: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSuccessAlert, setShowSuccessAlert] = useState(false);

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<GroupResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchType, setSearchType] = useState<'admin' | 'allowed' | null>(null);

    // Notification State
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [showNotificationDialog, setShowNotificationDialog] = useState(false);
    const [editingNotification, setEditingNotification] = useState<Notification | null>(null);
    const [notificationForm, setNotificationForm] = useState<NotificationFormData>({
        message: '',
        type: 'info',
        priority: 0,
        isActive: true
    });

    useEffect(() => {
        fetchConfig();
        fetchNotifications();

        // Poll for notification updates every 10 seconds when on notifications tab
        const interval = setInterval(() => {
            fetchNotifications();
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await fetch('/api/settings/access');
            if (res.ok) {
                const data = await res.json();
                setConfig(data);
            } else {
                toast.error("Error", { description: "Failed to load settings" });
            }
        } catch (error) {
            toast.error("Error", { description: "Failed to load settings" });
        } finally {
            setLoading(false);
        }
    };

    const fetchNotifications = async () => {
        setNotificationsLoading(true);
        try {
            const res = await fetch('/api/notifications');
            const data = await res.json();
            // Fetch all notifications (not just active ones for admin view)
            setNotifications(data.notifications || []);
        } catch (error) {
            toast.error("Error", { description: "Failed to load notifications" });
        } finally {
            setNotificationsLoading(false);
        }
    };

    const handleSearch = async () => {
        if (searchQuery.length < 2) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/auth/groups?q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setSearchResults(data.groups || []);
        } catch (error) {
            toast.error("Error", { description: "Failed to search groups" });
        } finally {
            setSearching(false);
        }
    };

    const addGroup = (groupCn: string, type: 'admin' | 'allowed') => {
        setConfig(prev => {
            const list = type === 'admin' ? prev.adminGroups : prev.allowedGroups;
            if (list.includes(groupCn)) return prev;

            return {
                ...prev,
                [type === 'admin' ? 'adminGroups' : 'allowedGroups']: [...list, groupCn]
            };
        });
        setSearchType(null);
        setSearchQuery("");
        setSearchResults([]);
        toast.success("Group added", { description: `Added ${groupCn} to ${type} list. Don't forget to save.` });
    };

    const removeGroup = (groupCn: string, type: 'admin' | 'allowed') => {
        setConfig(prev => {
            const list = type === 'admin' ? prev.adminGroups : prev.allowedGroups;
            return {
                ...prev,
                [type === 'admin' ? 'adminGroups' : 'allowedGroups']: list.filter(g => g !== groupCn)
            };
        });
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/settings/access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (res.ok) {
                toast.success("Success", { description: "Settings saved successfully" });
                setShowSuccessAlert(true);
                setTimeout(() => setShowSuccessAlert(false), 5000);
            } else {
                toast.error("Error", { description: "Failed to save settings" });
            }
        } catch (error) {
            toast.error("Error", { description: "Failed to save settings" });
        } finally {
            setSaving(false);
        }
    };

    // Notification Management Functions
    const openNotificationDialog = (notification?: Notification) => {
        if (notification) {
            setEditingNotification(notification);
            setNotificationForm({
                message: notification.message,
                type: notification.type,
                priority: notification.priority,
                isActive: notification.isActive
            });
        } else {
            setEditingNotification(null);
            setNotificationForm({
                message: '',
                type: 'info',
                priority: 0,
                isActive: true
            });
        }
        setShowNotificationDialog(true);
    };

    const saveNotification = async () => {
        if (!notificationForm.message.trim()) {
            toast.error("Error", { description: "Message is required" });
            return;
        }

        try {
            const url = editingNotification
                ? `/api/notifications/${editingNotification.id}`
                : '/api/notifications';
            const method = editingNotification ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notificationForm)
            });

            if (res.ok) {
                toast.success("Success", {
                    description: editingNotification ? "Notification updated" : "Notification created"
                });
                setShowNotificationDialog(false);
                fetchNotifications();
            } else {
                toast.error("Error", { description: "Failed to save notification" });
            }
        } catch (error) {
            toast.error("Error", { description: "Failed to save notification" });
        }
    };

    const deleteNotification = async (id: string) => {
        if (!confirm("Are you sure you want to delete this notification?")) return;

        try {
            const res = await fetch(`/api/notifications/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                toast.success("Success", { description: "Notification deleted" });
                fetchNotifications();
            } else {
                toast.error("Error", { description: "Failed to delete notification" });
            }
        } catch (error) {
            toast.error("Error", { description: "Failed to delete notification" });
        }
    };

    const toggleNotificationStatus = async (notification: Notification) => {
        try {
            const res = await fetch(`/api/notifications/${notification.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !notification.isActive })
            });

            if (res.ok) {
                toast.success("Success", {
                    description: notification.isActive ? "Notification hidden" : "Notification visible"
                });
                fetchNotifications();
            } else {
                toast.error("Error", { description: "Failed to update notification" });
            }
        } catch (error) {
            toast.error("Error", { description: "Failed to update notification" });
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'info': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'warning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            case 'success': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-muted-foreground">Manage application configuration</p>
            </div>


            <Tabs defaultValue="access" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="access">
                        <Users className="mr-2 h-4 w-4" />
                        Access Control
                    </TabsTrigger>
                    <TabsTrigger value="notifications">
                        <Bell className="mr-2 h-4 w-4" />
                        Notifications
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="access" className="space-y-6">
                    {/* Success Alert */}
                    {showSuccessAlert && (
                        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <AlertTitle className="text-green-800 dark:text-green-200">Success!</AlertTitle>
                            <AlertDescription className="text-green-700 dark:text-green-300">
                                Access settings have been saved successfully.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Admin Access Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Admin Access</CardTitle>
                                <CardDescription>
                                    Users in these Active Directory groups have full administrative access to this dashboard.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    {config.adminGroups.map(group => (
                                        <Badge key={group} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1">
                                            {group}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
                                                onClick={() => removeGroup(group, 'admin')}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </Badge>
                                    ))}
                                    {config.adminGroups.length === 0 && <span className="text-sm text-muted-foreground italic">No groups configured from settings (falling back to ENV)</span>}
                                </div>
                                <Button variant="outline" size="sm" className="w-full" onClick={() => setSearchType('admin')}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Group
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Login Access Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Login Access</CardTitle>
                                <CardDescription>
                                    Users in these groups are allowed to log in.
                                    <span className="block mt-1 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                                        If empty, ALL users in the configured LDAP Base DN can log in.
                                    </span>
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    {config.allowedGroups.map(group => (
                                        <Badge key={group} variant="outline" className="pl-2 pr-1 py-1 flex items-center gap-1">
                                            {group}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive"
                                                onClick={() => removeGroup(group, 'allowed')}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </Badge>
                                    ))}
                                    {config.allowedGroups.length === 0 && <span className="text-sm text-muted-foreground italic">All LDAP users allowed</span>}
                                </div>
                                <Button variant="outline" size="sm" className="w-full" onClick={() => setSearchType('allowed')}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Group
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Group Search Overlay */}
                    {searchType && (
                        <Card className="border-primary/50 shadow-lg">
                            <CardHeader>
                                <CardTitle>Add Group to {searchType === 'admin' ? 'Admin' : 'Allowed'} List</CardTitle>
                                <CardDescription>Search for an Active Directory group by name</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Search group name..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    />
                                    <Button onClick={handleSearch} disabled={searching}>
                                        {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" onClick={() => { setSearchType(null); setSearchResults([]); setSearchQuery(""); }}>Cancel</Button>
                                </div>

                                {searchResults.length > 0 && (
                                    <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                                        {searchResults.map((group) => (
                                            <div key={group.dn} className="p-3 flex justify-between items-center hover:bg-accent/50">
                                                <div>
                                                    <p className="font-medium text-sm">{group.cn}</p>
                                                    <p className="text-xs text-muted-foreground truncate max-w-[300px]">{group.dn}</p>
                                                </div>
                                                <Button size="sm" onClick={() => addGroup(group.cn, searchType)}>Select</Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {searchResults.length === 0 && searchQuery.length > 1 && !searching && (
                                    <p className="text-sm text-muted-foreground text-center py-4">No groups found</p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Save Button */}
                    <div className="flex justify-end">
                        <Button onClick={saveConfig} disabled={saving} size="lg">
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Access Settings
                        </Button>
                    </div>
                </TabsContent>

                <TabsContent value="notifications" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>System Notifications</CardTitle>
                                    <CardDescription>
                                        Manage alerts and notifications displayed to all users
                                    </CardDescription>
                                </div>
                                <Button onClick={() => openNotificationDialog()}>
                                    <Plus className="mr-2 h-4 w-4" /> Create Notification
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {notificationsLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p>No notifications created yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            className="border rounded-lg p-4 flex items-start justify-between gap-4 hover:bg-accent/5"
                                        >
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Badge className={getTypeColor(notification.type)}>
                                                        {notification.type}
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground">
                                                        Priority: {notification.priority}
                                                    </span>
                                                    <Badge variant={notification.isActive ? "default" : "outline"}>
                                                        {notification.isActive ? "Active" : "Inactive"}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm">{notification.message}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Updated: {new Date(notification.updatedAt).toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={notification.isActive}
                                                    onCheckedChange={() => toggleNotificationStatus(notification)}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openNotificationDialog(notification)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => deleteNotification(notification.id)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Notification Dialog */}
            <Dialog open={showNotificationDialog} onOpenChange={setShowNotificationDialog}>
                <DialogContent className="sm:max-w-[525px]">
                    <DialogHeader>
                        <DialogTitle>{editingNotification ? 'Edit Notification' : 'Create Notification'}</DialogTitle>
                        <DialogDescription>
                            {editingNotification ? 'Update the notification details below' : 'Create a new system-wide notification'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="message">Message</Label>
                            <Textarea
                                id="message"
                                placeholder="Enter notification message..."
                                value={notificationForm.message}
                                onChange={(e) => setNotificationForm({ ...notificationForm, message: e.target.value })}
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="type">Type</Label>
                                <Select
                                    value={notificationForm.type}
                                    onValueChange={(value: any) => setNotificationForm({ ...notificationForm, type: value })}
                                >
                                    <SelectTrigger id="type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="info">Info</SelectItem>
                                        <SelectItem value="warning">Warning</SelectItem>
                                        <SelectItem value="error">Error</SelectItem>
                                        <SelectItem value="success">Success</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="priority">Priority</Label>
                                <Input
                                    id="priority"
                                    type="number"
                                    value={notificationForm.priority}
                                    onChange={(e) => setNotificationForm({ ...notificationForm, priority: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="active"
                                checked={notificationForm.isActive}
                                onCheckedChange={(checked) => setNotificationForm({ ...notificationForm, isActive: checked })}
                            />
                            <Label htmlFor="active">Active (visible to users)</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNotificationDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={saveNotification}>
                            {editingNotification ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
