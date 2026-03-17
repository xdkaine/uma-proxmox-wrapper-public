import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { PoolDetailClient } from "./pool-detail-client";
import { PoolUtilization } from "@/components/pools/pool-utilization";

export const metadata = {
    title: "Pool Details - Admin Dashboard",
};

export default async function PoolDetailPage({ params }: { params: Promise<{ poolId: string }> }) {
    const { poolId } = await params;
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.user?.isLoggedIn || !session.user.isAdmin) {
        redirect("/dashboard");
    }

    let initialPoolData = null;
    try {
        // Fetch pool details which includes members (VMs/LXCs)
        const [poolData, resources] = await Promise.all([
            proxmox.getPool(poolId),
            proxmox.getResources()
        ]);

        initialPoolData = poolData;

        // Merge status info if possible
        if (initialPoolData && initialPoolData.members) {
            initialPoolData.members = initialPoolData.members.map((member: any) => {
                const resource = resources.find((r: any) => r.id === member.id);
                return { ...member, ...resource };
            });
        }

    } catch (e) {
        console.error(`Failed to fetch pool data for ${poolId}`, e);
    }

    return (
        <div className="space-y-6">
            <PoolUtilization poolId={poolId} />

            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Pool: {poolId}</h1>
            </div>
            <PoolDetailClient
                poolId={poolId}
                initialData={initialPoolData}
            />
        </div>
    );
}
