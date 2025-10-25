"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@imaginecalendar/ui/cn";
import { Settings, User, Bell, ChevronLeft, Home, Calendar } from "lucide-react";

const settingsNavItems = [
  {
    title: "Profile",
    href: "/settings/profile",
    icon: User,
  },
  {
    title: "Preferences",
    href: "/settings/preferences",
    icon: Bell,
  },
  {
    title: "Calendars",
    href: "/settings/calendars",
    icon: Calendar,
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {children}
    </div>
  );
}