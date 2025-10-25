import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4 md:p-24">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* CrackOn Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex flex-col items-center gap-3">
            <Image
              src="/crack-on-logo.png"
              alt="CrackOn"
              width={200}
              height={50}
              className="w-auto h-auto"
            />
            <span className="text-xs bg-primary text-white px-3 py-1.5 rounded-full font-medium uppercase tracking-wide">
              Admin Portal
            </span>
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">Administrator Access</h1>
          <p className="text-muted-foreground mt-2">
            Sign in to manage the CrackOn platform
          </p>
        </div>

        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-lg border-2",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
            },
            layout: {
              socialButtonsPlacement: "bottom",
              showOptionalFields: false,
            },
          }}
          routing="path"
          path="/sign-in"
          fallbackRedirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}