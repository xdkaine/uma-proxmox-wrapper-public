import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { DashboardClient } from "./dashboard-client";

export const metadata = {
    title: "Admin Dashboard - Uma",
    description: "Administrative dashboard for Uma - Manage Proxmox resources",
};

export default async function AdminPage() {
    // Get session
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    // Verify admin access
    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        redirect("/dashboard");
    }

    let nodes: any[] = [];

    try {
        // Only fetch nodes for initial server-side render of dashboard
        // Other stats can be client-fetched or we can pass empty and let client fetch
        nodes = await proxmox.getResources("node");
    } catch (e) {
        console.error("Failed to fetch admin data", e);
    }

    return (
        <DashboardClient
            initialNodes={nodes}
        />
    );
}
