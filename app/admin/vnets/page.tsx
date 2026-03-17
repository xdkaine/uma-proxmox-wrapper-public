import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { VnetsClient } from "./vnets-client";

export const metadata = {
    title: "VNETs - Admin Dashboard",
};

export default async function VnetsPage() {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        redirect("/dashboard");
    }

    let vnets: any[] = [];
    let zones: any[] = [];
    try {
        vnets = await proxmox.getVnets();
    } catch (e) {
        console.error("Failed to fetch vnets", e);
    }
    try {
        zones = await proxmox.getZones();
    } catch (e) {
        console.error("Failed to fetch zones", e);
    }

    return <VnetsClient initialVnets={vnets} zones={zones} session={session} />;
}
