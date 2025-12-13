"use client";

import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, User, CreditCard, FileText, Settings, ChevronDown, MessageCircle, BookOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
import Link from "next/link";

export function UserAvatarMenu() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();

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

  const userEmail = user?.emailAddresses[0]?.emailAddress || "";
  const userName = user?.fullName || user?.firstName || "User";

  // Show skeleton loader while loading
  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
        <div className="hidden md:block w-32 h-4 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/50"
          aria-label="User menu"
        >
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor()} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 shadow-sm`}>
            {getInitials()}
          </div>
          {userEmail && (
            <span className="hidden md:block text-sm text-white/90 font-normal max-w-[200px] truncate">
              {userEmail}
            </span>
          )}
          <ChevronDown className="hidden md:block h-4 w-4 text-white/70 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">

        {/* Menu Items */}
        <div className="space-y-0.5">
          <DropdownMenuItem asChild>
            <Link 
              href="/settings/profile" 
              className="flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-md">
                <User className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Profile</span>
            </Link>
          </DropdownMenuItem>
          
          <DropdownMenuItem asChild>
            <Link 
              href="/address" 
              className="flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-md">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Address Book</span>
            </Link>
          </DropdownMenuItem>
          
          <DropdownMenuItem asChild>
            <Link 
              href="/settings/whatsapp" 
              className="flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-center w-8 h-8">
                <MessageCircle className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">WhatsApp</span>
            </Link>
          </DropdownMenuItem>
          
          <DropdownMenuItem asChild>
            <Link 
              href="/billing" 
              className="flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-center w-8 h-8">
                <CreditCard className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Subscriptions</span>
            </Link>
          </DropdownMenuItem>
          
          <DropdownMenuItem asChild>
            <Link 
              href="/billing/invoices" 
              className="flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-center w-8 h-8">
                <FileText className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Invoices</span>
            </Link>
          </DropdownMenuItem>
          
          <DropdownMenuItem asChild>
            <Link 
              href="/settings/preferences" 
              className="flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-center w-8 h-8">
                <Settings className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Preferences</span>
            </Link>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="my-2" />

        {/* Sign Out */}
        <DropdownMenuItem
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
        >
          <div className="flex items-center justify-center w-8 h-8">
            <LogOut className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium">Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}