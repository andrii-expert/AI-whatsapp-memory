import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 dotted-bg opacity-30" />
      
      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Logo and Header */}
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex justify-center">
            <Image 
              src="/crackon_logo_pngs-16.png" 
              alt="CrackOn" 
              width={300} 
              height={120}
              className="w-full max-w-[280px] h-auto drop-shadow-lg" 
              priority
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Welcome Back
            </h1>
            <p className="text-white/90 text-base md:text-lg">
              Sign in to manage your calendar through WhatsApp
            </p>
          </div>
        </div>

        {/* Sign In Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border-0 bg-transparent p-0",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton: 
                  "bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-[#2F7DC1] transition-all rounded-xl h-12 text-sm font-medium shadow-sm hover:shadow-md",
                socialButtonsBlockButtonText: "text-gray-700 font-medium",
                socialButtonsBlockButtonArrow: "text-gray-500",
                formButtonPrimary: 
                  "bg-[#2F7DC1] hover:bg-[#2563a8] active:bg-[#1e4d85] text-white rounded-xl h-12 text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
                formFieldInput: 
                  "h-12 rounded-xl border-gray-200 focus:border-[#2F7DC1] focus:ring-2 focus:ring-[#2F7DC1]/20 transition-all bg-white text-gray-900 placeholder:text-gray-400",
                formFieldLabel: "text-gray-700 font-semibold text-sm mb-2",
                footerActionLink: 
                  "text-[#2F7DC1] hover:text-[#2563a8] font-semibold transition-colors",
                identityPreviewText: "text-gray-700 font-medium",
                identityPreviewEditButton: 
                  "text-[#2F7DC1] hover:text-[#2563a8] font-medium transition-colors",
                formResendCodeLink: 
                  "text-[#2F7DC1] hover:text-[#2563a8] font-semibold transition-colors",
                dividerLine: "bg-gray-200",
                dividerText: "text-gray-500 text-sm font-medium",
                formFieldInputShowPasswordButton: 
                  "text-gray-500 hover:text-gray-700 transition-colors",
                alertText: "text-sm font-medium",
                formFieldErrorText: "text-sm text-red-600 font-medium mt-1",
                footerAction: "text-center text-sm text-gray-600 mt-4",
                formHeaderTitle: "hidden",
                formHeaderSubtitle: "hidden",
              },
              layout: {
                socialButtonsPlacement: "top",
                showOptionalFields: false,
              },
            }}
            routing="path"
            path="/sign-in"
            forceRedirectUrl="/dashboard"
          />
        </div>

        {/* Footer */}
        <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
          <p className="text-white/80 text-sm md:text-base">
            Don't have an account?{" "}
            <Link 
              href="/sign-up" 
              className="text-white font-bold hover:underline underline-offset-2 transition-all"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
