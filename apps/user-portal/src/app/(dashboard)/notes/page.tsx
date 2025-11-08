"use client";

import Link from "next/link";
import { Home, ChevronLeft } from "lucide-react";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { usePlanLimits } from "@/hooks/use-plan-limits";

export default function NotesPage() {
  const { limits, isLoading } = usePlanLimits();
  const hasNotesAccess = limits.hasNotes;

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
        <span className="font-medium">Notes</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Notes</h1>
        <p className="text-muted-foreground mt-2">
          Create and manage your personal notes
        </p>
      </div>

      {/* Show upgrade prompt if notes feature is locked */}
      {!hasNotesAccess && (
        <UpgradePrompt 
          feature="Notes & Shared Notes" 
          requiredTier="gold" 
          variant="card"
        />
      )}
    </div>
  );
}
