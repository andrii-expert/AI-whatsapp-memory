"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@imaginecalendar/ui/button";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function OnboardingSuccessPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* Logo / Icon */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-blue-50 flex items-center justify-center shadow-sm">
            <Image
              src="/crackon_logo_pngs-16.png"
              alt="CrackOn"
              width={64}
              height={64}
              className="h-12 w-12 object-contain"
            />
          </div>
        </div>

        {/* Text */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-gray-900">
            Account created successfully!
          </h1>
          <p className="text-sm text-gray-600">
            Welcome aboard! Start your success journey with CrackOn!
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            onClick={() => {
              router.push("/dashboard");
            }}
          >
            Let&apos;s Start!
          </Button>
          <Button
            className="w-full bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 font-semibold"
            variant="outline"
            
          >
            View Tutorials
          </Button>
        </div>
      </div>
    </div>
  );
}


