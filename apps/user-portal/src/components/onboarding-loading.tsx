"use client";

import Image from "next/image";

export function OnboardingLoading() {
  return (
    <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4">
      <div className="flex flex-col items-center justify-center space-y-8">
        {/* Logo with subtle animation */}
        <div className="relative">
          <Image
            src="/crackon_logo_pngs-16.png"
            alt="CrackOn"
            width={240}
            height={96}
            className="w-auto h-auto max-w-[240px] sm:max-w-[280px] opacity-90"
            priority
          />
        </div>
        
        {/* Loading spinner with smooth animation */}
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="w-14 h-14 sm:w-16 sm:h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          <p className="text-sm sm:text-base text-gray-600 font-medium animate-pulse">Loading...</p>
        </div>
      </div>
    </div>
  );
}

