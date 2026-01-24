"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@imaginecalendar/ui/button";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSetupRedirect } from "@/hooks/use-setup-redirect";
import { OnboardingLoading } from "@/components/onboarding-loading";

export default function AddressPage() {
  const { user, isLoaded, isSignedIn } = useAuth();
  
  // Redirect if setup is incomplete
  useSetupRedirect();
  
  // Show full-page loading state while checking authentication
  if (!isLoaded) {
    return <OnboardingLoading />;
  }
  
  // If auth check is complete but user is not signed in, show loading
  // (useSetupRedirect will handle the redirect)
  if (!isSignedIn || !user) {
    return <OnboardingLoading />;
  }
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8 py-12">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-blue-600 flex items-center justify-center shadow-sm">
            <Image
              src="/crack-on-logo-icon.png"
              alt="CrackOn"
              width={80}
              height={80}
              className="h-12 w-12 object-contain"
            />
          </div>
        </div>

        {/* Message */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Address Feature
          </h1>
          <p className="text-lg text-gray-600">
            This feature will be available soon
          </p>
        </div>

        {/* Back to Dashboard Button */}
        <div className="pt-4">
          <Button
            asChild
            variant="default"
            className="w-full sm:w-auto"
          >
            <Link href="/dashboard" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}   