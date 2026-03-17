import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { proxmox } from "@/lib/proxmox-api";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
    const session = await getIronSession<SessionData>(request, new NextResponse(), sessionOptions);

    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const runningTask = await proxmox.checkNetworkTasksRunning();

        return NextResponse.json({
            isRunning: !!runningTask,
            task: runningTask
        });

    } catch (error: any) {
        logger.error("Error fetching SDN task status", error);
        return NextResponse.json({ error: "Failed to fetch SDN task status" }, { status: 500 });
    }
}
