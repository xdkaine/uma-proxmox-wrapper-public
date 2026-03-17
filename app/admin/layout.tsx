import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col h-[calc(100vh-5rem)] gap-4">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4 min-h-0">
                <aside className="border rounded-xl overflow-hidden bg-card flex flex-col h-full">
                    <AdminSidebar />
                </aside>
                <main className="border rounded-xl overflow-hidden bg-card h-full relative">
                    <div className="absolute inset-0 overflow-y-auto p-6">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
