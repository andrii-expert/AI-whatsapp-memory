"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, ShoppingCart, Bell, Users } from "lucide-react";
import { cn } from "@imaginecalendar/ui/cn";

const navigationItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Events", href: "/calendars", icon: Calendar },
  { name: "Shopping", href: "/shopping-lists", icon: ShoppingCart },
  { name: "Reminders", href: "/reminders", icon: Bell },
  { name: "Friends", href: "/friends", icon: Users },
];

// Pages where the bottom nav should be shown
const pagesWithBottomNav = [
  "/dashboard",
  "/calendars",
  "/notes",
  "/reminders",
  "/shopping-lists",
  "/tasks",
  "/friends",
];

export function MobileBottomNav() {
  const pathname = usePathname();

  // Check if current page should show bottom nav
  const shouldShow = pagesWithBottomNav.some(
    (page) => pathname === page || pathname.startsWith(page + "/")
  );

  if (!shouldShow) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white md:hidden shadow-lg border-t border-gray-200">
      <div className="flex items-center justify-around h-16 px-1">
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full min-w-0 px-1 transition-colors"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 mb-1 flex-shrink-0",
                  isActive ? "text-blue-600" : "text-gray-400"
                )}
              />
              <span className={cn(
                "text-xs font-medium whitespace-nowrap text-center",
                isActive ? "text-blue-600" : "text-gray-400"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

