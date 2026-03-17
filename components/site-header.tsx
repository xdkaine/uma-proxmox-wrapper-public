import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { LogoutButton } from "@/components/logout-button"
import { NavbarLogo } from "@/components/navbar-logo"
import { ExternalLink, LayoutDashboard, BookOpen, HardDrive, Copy, LifeBuoy } from "lucide-react"
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export async function SiteHeader() {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const user = session.user;

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background">
            <div className="w-full px-4 sm:px-6 lg:px-8 flex h-14 items-center relative">
                {/* Left Side: Logo */}
                <div className="flex items-center">
                    <NavbarLogo />
                </div>

                {/* Center: Navigation Links */}
                <nav className="flex items-center space-x-6 text-sm font-medium mx-6">
                    <Link
                        href="/dashboard"
                        className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-1.5"
                    >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                    </Link>
                    <Link
                        href="/docs"
                        className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-1.5"
                    >
                        <BookOpen className="h-4 w-4" />
                        Docs
                    </Link>
                    {user?.isAdmin && (
                        <Link
                            href="/admin"
                            className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-1.5"
                        >
                            <LayoutDashboard className="h-4 w-4" />
                            Admin
                        </Link>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center gap-1.5 transition-colors hover:text-foreground/80 text-foreground/60 outline-none">
                            Resources
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem asChild>
                                <a
                                    href="https://proxmox.sdc.cpp"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 cursor-pointer"
                                >
                                    <HardDrive className="h-4 w-4" />
                                    Proxmox
                                    <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a
                                    href="https://kamino.sdc.cpp"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 cursor-pointer"
                                >
                                    <Copy className="h-4 w-4" />
                                    Kamino
                                    <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a
                                    href="https://portal.sdc.cpp"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 cursor-pointer"
                                >
                                    <LifeBuoy className="h-4 w-4" />
                                    Portal (Support)
                                    <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                                </a>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </nav>

                {/* Right Side: User Menu & Actions */}
                <nav className="flex items-center space-x-4 ml-auto">
                    {user?.isLoggedIn ? (
                        <>
                            <span className="text-sm font-medium hidden sm:inline-block">Welcome, {user.displayName || user.username}</span>
                            <LogoutButton />
                        </>
                    ) : (
                        <Link
                            href="/login"
                            className="text-sm font-medium transition-colors hover:text-primary"
                        >
                            Login
                        </Link>
                    )}
                    <ModeToggle />
                </nav>
            </div>

        </header >
    )
}
