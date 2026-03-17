import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { PoolsClient } from "./pools-client";

export const metadata = {
    title: "Resource Pools - Admin Dashboard",
};

export default async function PoolsPage() {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        redirect("/dashboard");
    }

    let pools: any[] = [];
    try {
        pools = await proxmox.getPools();
    } catch (e) {
        console.error("Failed to fetch pools", e);
    }

    return <PoolsClient initialPools={pools} />;
}
