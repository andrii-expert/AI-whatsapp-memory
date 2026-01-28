import { Suspense } from "react";
import SignInClient from "./sign-in-client";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center">Loading...</div>
        </div>
      }
    >
      <SignInClient />
    </Suspense>
  );
}
