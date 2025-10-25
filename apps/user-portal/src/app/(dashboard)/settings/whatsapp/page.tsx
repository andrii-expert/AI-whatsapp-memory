"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Home, ChevronLeft } from "lucide-react";
import { WhatsAppVerificationSection } from "@/components/whatsapp-verification-section";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export default function WhatsAppVerificationPage() {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const redirectFrom = searchParams.get("from");

  // Fetch current user data to get phone number
  const { data: user, isLoading } = useQuery(
    trpc.user.me.queryOptions()
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user?.phone) {
    return (
      <div className="space-y-6">
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
          <span className="font-medium">WhatsApp Verification</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-primary">WhatsApp Verification</h1>
          <p className="text-muted-foreground mt-2">
            Verify your WhatsApp number to start managing your calendar
          </p>
        </div>

        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            Please add your WhatsApp phone number in your profile first.
          </p>
          <Link
            href="/settings/profile"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Go to Profile Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        <span className="font-medium">WhatsApp Verification</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">WhatsApp Verification</h1>
        <p className="text-muted-foreground mt-2">
          Verify your WhatsApp number to start managing your calendar with voice commands
        </p>
      </div>

      {/* WhatsApp Verification Section */}
      <WhatsAppVerificationSection phoneNumber={user.phone} redirectFrom={redirectFrom || "dashboard"} />
    </div>
  );
}
