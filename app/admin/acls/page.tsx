import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { AclsClient } from "./acls-client";

export const metadata = {
    title: "ACLs - Admin Dashboard",
};

export default async function AclsPage() {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        redirect("/dashboard");
    }

    let acls: any[] = [];
    try {
        acls = await proxmox.getACLs();
    } catch (e) {
        console.error("Failed to fetch ACLs", e);
    }

    return <AclsClient initialAcls={acls} />;
}
