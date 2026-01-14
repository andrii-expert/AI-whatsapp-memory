"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import BillingPage from "@/app/(dashboard)/billing/page";

export default function BillingOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <BillingPage />
    </Suspense>
  );
}

