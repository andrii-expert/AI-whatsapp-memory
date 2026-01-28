"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { Loader2 } from "lucide-react";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid email or password");
        setIsLoading(false);
        return;
      }

      // Sign in successful, redirect to dashboard
      router.push(redirect);
      router.refresh();
    } catch (err) {
      console.error("Sign in error:", err);
      setError("An error occurred. Please try again.");
      setIsLoading(false);
    }
  };

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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="auth-page-blue-theme bg-background flex min-h-screen items-center justify-center p-4 md:p-24">
        <div className="w-full max-w-md space-y-6 text-center">
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
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          </div>
        </div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
