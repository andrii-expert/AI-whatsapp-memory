import { requireAdmin } from "@/lib/check-admin";
import { AdminHeader } from "@/components/admin-header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check admin authentication and authorization
  // This will redirect if user is not authenticated or not admin
  await requireAdmin();

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}