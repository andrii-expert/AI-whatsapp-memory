"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import { Eye, EyeOff } from "lucide-react";

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });

  // Check for OAuth errors in URL
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError("Google sign-up failed. Please try again.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Sign up failed");
      }

      // Redirect to email verification page
      router.push("/verify-email");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/google");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to initiate Google sign-up");
      }

      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-up failed");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Side - Sign Up Form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Title and Subtitle */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-gray-900">Sign up/Register</h1>
            <p className="text-lg text-gray-600">Get started in 3 simple steps.</p>
          </div>

          {/* Login/Signup Toggle */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <Link
              href="/sign-in"
              className="flex-1 text-center py-2 px-4 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Login
            </Link>
            <button
              className="flex-1 text-center py-2 px-4 rounded-md text-sm font-medium bg-white text-gray-900 shadow-sm"
              disabled
            >
              Signup
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Google Sign Up Button */}
          <Button
            type="button"
            variant="outline"
            className="w-full bg-white border-2 border-gray-300 hover:bg-gray-50 h-12 text-base font-medium"
            onClick={handleGoogleSignUp}
            disabled={loading || googleLoading}
          >
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
            Sign up with Google
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* First Name and Last Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium text-gray-700">
                  First Name
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  disabled={loading}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  disabled={loading}
                  className="h-11"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                disabled={loading}
                className="h-11"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Set Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  disabled={loading}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Create Account Button */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-medium bg-blue-600 hover:bg-blue-700 text-white"
              disabled={loading || googleLoading}
            >
              {loading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </div>
      </div>

      {/* Right Side - Promotional Content */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-600 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Slogan */}
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-white tracking-wide mb-4">
            REMIND. ORGANISE. CRACKON.
          </h2>
        </div>

        {/* WhatsApp Phone Mockup */}
        <div className="relative mb-8">
          <div className="w-64 h-[500px] bg-white rounded-[2.5rem] p-2 shadow-2xl">
            <div className="w-full h-full bg-gray-50 rounded-[2rem] overflow-hidden">
              {/* Phone Header */}
              <div className="bg-green-600 text-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">WhatsApp</h3>
                  <div className="flex gap-2">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                  </div>
                </div>
                <div className="bg-white/20 rounded-lg px-3 py-2 text-sm">
                  Q Ask Meta AI or Search
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-4 text-sm">
                <span className="font-semibold text-green-600">All</span>
                <span className="text-gray-600">Unread</span>
                <span className="text-gray-600">Favourites</span>
                <span className="text-gray-600">Groups</span>
              </div>

              {/* Chat List */}
              <div className="bg-white flex-1 overflow-y-auto">
                <div className="p-3 border-b border-gray-100 flex items-start gap-3 hover:bg-gray-50">
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                    C
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">CrackOn</span>
                      <span className="text-xs text-gray-500">14:00</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">Your event has been scheduled</p>
                  </div>
                </div>
                <div className="p-3 border-b border-gray-100 flex items-start gap-3 hover:bg-gray-50">
                  <div className="w-12 h-12 bg-gray-400 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Grant</span>
                      <span className="text-xs text-gray-500">26/09/2025</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">I will chat to you in the morning</p>
                  </div>
                </div>
                <div className="p-3 border-b border-gray-100 flex items-start gap-3 hover:bg-gray-50">
                  <div className="w-12 h-12 bg-gray-400 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Paul</span>
                      <span className="text-xs text-gray-500">14:08</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">I have set a reminder on CrackOn</p>
                  </div>
                </div>
                <div className="p-3 border-b border-gray-100 flex items-start gap-3 hover:bg-gray-50">
                  <div className="w-12 h-12 bg-gray-400 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Talita</span>
                      <span className="text-xs text-gray-500">10:20</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">Awesome! Will do!</p>
                  </div>
                </div>
                <div className="p-3 border-b border-gray-100 flex items-start gap-3 hover:bg-gray-50">
                  <div className="w-12 h-12 bg-gray-400 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Jane</span>
                      <span className="text-xs text-gray-500">11:07</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">No worries, I will have a look.</p>
                  </div>
                </div>
                <div className="p-3 border-b border-gray-100 flex items-start gap-3 hover:bg-gray-50">
                  <div className="w-12 h-12 bg-gray-400 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Marie</span>
                      <span className="text-xs text-gray-500">11:21</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">I think it should be fine.</p>
                  </div>
                </div>
              </div>

              {/* Bottom Navigation */}
              <div className="bg-white border-t border-gray-200 flex items-center justify-around py-2">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 bg-gray-400 rounded mb-1"></div>
                  <span className="text-xs text-gray-600">Chats</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 bg-gray-400 rounded mb-1"></div>
                  <span className="text-xs text-gray-600">Updates</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 bg-gray-400 rounded mb-1"></div>
                  <span className="text-xs text-gray-600">Communities</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 bg-gray-400 rounded mb-1"></div>
                  <span className="text-xs text-gray-600">Calls</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Description Text */}
        <div className="text-center max-w-md">
          <p className="text-white text-lg leading-relaxed">
            CrackOn is your smart WhatsApp friend that helps you stay organised without leaving your favourite chat app.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <SignUpForm />
    </Suspense>
  );
}
