"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, ShoppingCart, CheckSquare, Bell, Users } from "lucide-react";
import { cn } from "@imaginecalendar/ui/cn";
import { useEffect, useState } from "react";

const navigationItems = [
  { name: "Events", href: "/calendars", icon: Calendar },
  { name: "Shopping", href: "/shopping-lists", icon: ShoppingCart },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
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
  const [calendarsClickHandler, setCalendarsClickHandler] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handleCalendarsSidebarOpen = (event: CustomEvent) => {
      console.log('MobileBottomNav: Received calendars-sidebar-open event', event.detail);
      if (event.detail && typeof event.detail === 'function') {
        setCalendarsClickHandler(event.detail);
      } else if (event.detail === null) {
        setCalendarsClickHandler(null);
      }
    };

    window.addEventListener('calendars-sidebar-open', handleCalendarsSidebarOpen as EventListener);
    console.log('MobileBottomNav: Added event listener for calendars-sidebar-open');

    return () => {
      window.removeEventListener('calendars-sidebar-open', handleCalendarsSidebarOpen as EventListener);
      console.log('MobileBottomNav: Removed event listener for calendars-sidebar-open');
    };
  }, []);

  // Check if current page should show bottom nav
  const shouldShow = pagesWithBottomNav.some(
    (page) => pathname === page || pathname.startsWith(page + "/")
  );

  if (!shouldShow) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#036cea] lg:hidden shadow-lg">
      <div className="flex items-center justify-around h-16 px-1">
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const isCalendarsItem = item.href === "/calendars";

          const content = (
            <div
              className={cn(
                "flex flex-col items-center justify-center w-full h-full rounded-lg transition-all",
                isActive && "bg-[#1f299b]"
              )}
            >
              <item.icon
                className="h-5 w-5 mb-0.5 flex-shrink-0 text-white"
              />
              <span className="text-xs font-medium whitespace-nowrap text-white text-center">
                {item.name}
              </span>
            </div>
          );

          if (isCalendarsItem) {
            return (
              <button
                key={item.name}
                onClick={() => {
                  console.log('MobileBottomNav: Calendars button clicked');
                  if (calendarsClickHandler) {
                    calendarsClickHandler();
                  } else {
                    // Fallback: dispatch a global event that the page can listen for
                    window.dispatchEvent(new CustomEvent('mobile-calendars-click'));
                  }
                }}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full min-w-0 px-1 transition-all relative",
                  isActive && "mx-0.5"
                )}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full min-w-0 px-1 transition-all relative",
                isActive && "mx-0.5"
              )}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

