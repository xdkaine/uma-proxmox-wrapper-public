'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Database,
    Network,
    Shield,
    FileText,
    Settings,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

interface SidebarProps extends React.HTMLAttributes<HTMLElement> { }

export function AdminSidebar({ className, ...props }: SidebarProps) {
    const pathname = usePathname() || "";

    const routes = [
        {
            href: "/admin",
            label: "Overview",
            icon: LayoutDashboard,
            active: pathname === "/admin",
        },
        {
            href: "/admin/pools",
            label: "Resource Pools",
            icon: Database,
            active: pathname.startsWith("/admin/pools"),
        },
        {
            href: "/admin/vnets",
            label: "VNETs",
            icon: Network,
            active: pathname.startsWith("/admin/vnets"),
        },
        {
            href: "/admin/acls",
            label: "ACLs",
            icon: Shield,
            active: pathname.startsWith("/admin/acls"),
        },
        {
            href: "/admin/audit-logs",
            label: "Audit Logs",
            icon: FileText,
            active: pathname.startsWith("/admin/audit-logs"),
        },
        {
            href: "/admin/docs",
            label: "Docs",
            icon: FileText,
            active: pathname.startsWith("/admin/docs"),
        },
        {
            href: "/admin/settings",
            label: "Settings",
            icon: Settings,
            active: pathname.startsWith("/admin/settings"),
        },
        {
            href: "/admin/settings/limits",
            label: "Resource Limits",
            icon: Database,
            active: pathname.startsWith("/admin/settings/limits"),
        },
    ];

    return (
        <>
            <div className="p-4 border-b bg-muted/20 shrink-0">
                <h3 className="font-semibold text-sm">Admin Navigation</h3>
                <p className="text-xs text-muted-foreground">Manage platform resources</p>
            </div>
            <nav
                className={cn(
                    "flex-1 overflow-y-auto p-3 space-y-1",
                    className
                )}
                {...props}
            >
                {routes.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            buttonVariants({ variant: "ghost" }),
                            item.active
                                ? "bg-muted hover:bg-muted"
                                : "hover:bg-transparent hover:underline",
                            "justify-start w-full"
                        )}
                    >
                        <item.icon className="mr-2 h-4 w-4" />
                        {item.label}
                    </Link>
                ))}
            </nav>
        </>
    );
}
