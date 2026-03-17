import { Metadata } from "next";
import AuditLogsClient from "./audit-logs-client";

export const metadata: Metadata = {
    title: "Audit Logs | Admin Dashboard",
    description: "Security monitoring and activity tracking dashboard",
};

export default function AuditLogsPage() {
    return <AuditLogsClient />;
}
