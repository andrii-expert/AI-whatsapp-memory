"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { Settings, LogOut, User, Receipt } from "lucide-react";
import Link from "next/link";

export function UserAvatarMenuOld() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut(() => router.push("/"));
  };

  // Get user initials for avatar
  const getInitials = () => {
    if (!user) return "U";
    
    const name = user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress || "User";
    const parts = name.split(" ");
    
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Generate a consistent color based on user ID
  const getAvatarColor = () => {
    if (!user?.id) return "from-blue-500 to-blue-600";
    
    const colors = [
      "from-blue-500 to-blue-600",
      "from-purple-500 to-purple-600",
      "from-green-500 to-green-600",
      "from-orange-500 to-orange-600",
      "from-pink-500 to-pink-600",
      "from-indigo-500 to-indigo-600",
      "from-teal-500 to-teal-600",
    ];
    
    // Simple hash function to get consistent color
    const hash = user.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br hover:ring-2 hover:ring-offset-2 hover:ring-primary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        style={{
          backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))`,
        }}
        aria-label="User menu"
      >
        <div className={`w-full h-full rounded-full bg-gradient-to-br ${getAvatarColor()} flex items-center justify-center text-white font-semibold text-sm`}>
          {getInitials()}
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg bg-background border shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* User Info */}
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-medium truncate">
              {user?.fullName || user?.firstName || "User"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.emailAddresses[0]?.emailAddress}
            </p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              href="/settings/preferences"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>

            <Link
              href="/billing/invoices"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              <Receipt className="h-4 w-4" />
              Billing & Invoices
            </Link>

            <div className="border-t my-1" />

            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted transition-colors w-full text-left text-red-600 dark:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}