"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function SignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Check for OAuth errors in URL
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      if (errorParam === "access_denied") {
        setError("Access denied. Administrator privileges required.");
      } else {
        setError("Google sign-in failed. Please try again.");
      }
    }
  }, [searchParams]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/google");
      
      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response from /api/auth/google:", text.substring(0, 200));
        throw new Error("Server returned an invalid response. Please try again.");
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to initiate Google sign-in");
      }

      if (!data.authUrl) {
        throw new Error("Invalid response from server");
      }

      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

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
    <div className="flex min-h-screen">
      {/* Left Side - Sign In Form */}
      <div className="w-full lg:w-1/2 bg-white flex sm:items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Logo + Title */}
          <div className="space-y-3 flex flex-col items-center justify-center">
            <Image
              src="/crack-on-logo.png"
              alt="CrackOn"
              width={200}
              height={50}
              className="w-auto h-auto"
              priority
            />
            <span className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-full font-medium uppercase tracking-wide">
              Admin Portal
            </span>
            <div className="text-center pt-2">
              <h1 className="text-4xl font-bold text-gray-800">Sign In</h1>
              <p className="text-lg text-gray-500">Administrator access only</p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Google Sign In Button */}
          <Button
            type="button"
            variant="outline"
            className="w-full bg-white border-2 border-gray-300 hover:bg-gray-50 h-12 text-base font-medium text-black hover:text-blue-600"
            onClick={handleGoogleSignIn}
            disabled={isLoading || googleLoading}
          >
            {googleLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </Button>

          {/* OR Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">OR</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="h-11 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 pr-10 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-medium bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isLoading || googleLoading}
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

      {/* Right Side - Promotional Content (dashboard-style) */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-600 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-white tracking-wide mb-4">
            REMIND. ORGANISE. CRACKON.
          </h2>
          <p className="text-white/90 text-lg leading-relaxed max-w-md">
            Admin portal for managing users, analytics, and platform settings.
          </p>
        </div>

        <div className="w-full max-w-lg">
          <div className="bg-white/10 border border-white/20 rounded-2xl p-8 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <Image
                src="/crack-on-logo-icon.png"
                alt="CrackOn"
                width={56}
                height={56}
                className="w-14 h-14"
              />
              <div className="text-left">
                <div className="text-white font-semibold text-xl">CrackOn Admin</div>
                <div className="text-white/80 text-sm">
                  Secure access restricted to administrators
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


