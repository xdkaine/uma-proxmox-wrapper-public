import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClusterResources } from "@/components/dashboard/cluster-resources";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";

export const metadata = {
    title: "Dashboard - Uma",
    description: "Manage your Proxmox resources",
};

export default async function DashboardPage() {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.user?.isLoggedIn) {
        redirect("/login");
    }

    return (
        <div className="p-8 w-full mx-auto space-y-8">
            <div className="flex justify-between items-center mb-8 border-b pb-6">
                <div>
                    <h1 className="text-4xl font-bold mb-2 tracking-tight">Uma Dashboard</h1>
                    <p className="text-muted-foreground">Manage your resource pools and SDNs.</p>
                </div>
            </div>

            <section className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Cluster Resources</h2>
                <ClusterResources allowInteraction={false} />
            </section>

            <DashboardTabs
                username={session.user?.username || ""}
                userGroups={session.user?.groups || []}
                isAdmin={session.user?.isAdmin || false}
            />
        </div>
    );
}
