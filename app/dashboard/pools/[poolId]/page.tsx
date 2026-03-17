
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPoolAccess } from "@/lib/acl";
import { PoolDetailsView } from "@/components/resource-pools/pool-details-view";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageProps {
    params: Promise<{ poolId: string }>;
}

export default async function PoolPage({ params }: PageProps) {
    const { poolId } = await params;
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.user?.isLoggedIn) {
        redirect("/login");
    }

    // --- ACL Check ---
    const { hasAccess } = await checkPoolAccess(session.user.username, session.user.groups || [], poolId);

    if (!hasAccess) {
        return (
            <div className="p-8 max-w-7xl mx-auto text-center">
                <div className="mb-4">
                    <Button variant="ghost" asChild>
                        <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
                    </Button>
                </div>
                <div className="bg-destructive/10 text-destructive p-4 rounded-md inline-block">
                    <h2 className="text-lg font-bold mb-2">Access Denied</h2>
                    <p>You do not have permission to view Resource Pool &quot;{poolId}&quot;.</p>
                </div>
            </div>
        );
    }

    return <PoolDetailsView poolId={poolId} />;
}
