"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, Network, Shield } from "lucide-react";
import { PoolList } from "@/components/resource-pools/pool-list";
import { VnetList } from "@/components/sdn/vnet-list";
import { AuditLog } from "@/components/acl/audit-log";

interface DashboardTabsProps {
    username: string;
    userGroups: string[];
    isAdmin: boolean;
}

export function DashboardTabs({ username, userGroups, isAdmin }: DashboardTabsProps) {
    return (
        <Tabs defaultValue="pools" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="pools" className="flex items-center gap-1.5">
                    <Server className="h-4 w-4" />
                    <span>Pools</span>
                </TabsTrigger>
                <TabsTrigger value="vnets" className="flex items-center gap-1.5">
                    <Network className="h-4 w-4" />
                    <span>VNETs</span>
                </TabsTrigger>
                <TabsTrigger value="access" className="flex items-center gap-1.5">
                    <Shield className="h-4 w-4" />
                    <span>Access</span>
                </TabsTrigger>
            </TabsList>

            <TabsContent value="pools" className="mt-6">
                <PoolList username={username} userGroups={userGroups} />
            </TabsContent>

            <TabsContent value="vnets" className="mt-6">
                <VnetList username={username} />
            </TabsContent>

            <TabsContent value="access" className="mt-6">
                <AuditLog username={username} isAdmin={isAdmin} />
            </TabsContent>
        </Tabs>
    );
}
