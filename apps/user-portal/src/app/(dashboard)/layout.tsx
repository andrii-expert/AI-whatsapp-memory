import { requireOnboarding } from "@/lib/check-onboarding";
import { DashboardNav } from "@/components/dashboard-nav";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication and onboarding status
  // This will redirect if user is not authenticated or not onboarded
  await requireOnboarding();

  return (
    <div className="min-h-screen bg-white">
      <DashboardNav />
      <main className="container mx-auto px-4 sm:px-6 py-8 pb-20 md:pb-8">{children}</main>
      <MobileBottomNav />
    </div>
  );
}