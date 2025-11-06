import Link from "next/link";
import { Home, ChevronLeft } from "lucide-react";

export default function RemindersPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
        <span className="font-medium">Reminders</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Reminders</h1>
        <p className="text-muted-foreground mt-2">
          Set and manage your reminders
        </p>
      </div>
    </div>
  );
}
