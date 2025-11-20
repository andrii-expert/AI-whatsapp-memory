"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserAvatarMenu } from "@/components/user-avatar-menu";
import {
  LayoutDashboard,
  Calendar,
  Menu,
  StickyNote,
  Bell,
  CheckSquare,
} from "lucide-react";
import { cn } from "@imaginecalendar/ui/cn";
import { Button } from "@imaginecalendar/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@imaginecalendar/ui/sheet";
import Image from "next/image";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Calendar", href: "/calendars", icon: Calendar },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Notes", href: "/notes", icon: StickyNote, goldOnly: true },
  { name: "Reminders", href: "/reminders", icon: Bell },
];

export function DashboardNav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-primary text-white shadow-md">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/dashboard">
              <Image
                src="/crack-on-logo.png"
                alt="CrackOn"
                width={140}
                height={35}
                className="hidden sm:block"
                priority
              />
              <Image
                src="/crack-on-logo.png"
                alt="CrackOn"
                width={120}
                height={30}
                className="sm:hidden"
                priority
              />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => {
              // For /billing, only match exact path to avoid highlighting when on /billing/invoices
              const isActive = item.href === "/billing" 
                ? pathname === item.href 
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 relative",
                    isActive
                      ? "bg-white/20 text-white font-bold"
                      : "text-white/90 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Desktop User Menu */}
          <div className="hidden md:block">
            <UserAvatarMenu />
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-2">
            <UserAvatarMenu />
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent 
                side="right" 
                className="p-0 !right-0 !w-[300px] !max-w-[300px]"
              >
                <div className="flex flex-col h-full">
                  {/* Header */}
                  <div className="px-6 py-4 border-b">
                    <h2 className="text-lg font-semibold text-foreground">Menu</h2>
                  </div>
                  
                  {/* Navigation Items */}
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <nav className="space-y-2">
                      {navigation.map((item) => {
                        const isActive = item.href === "/billing" 
                          ? pathname === item.href 
                          : pathname === item.href || pathname.startsWith(item.href + "/");
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                              isActive
                                ? "bg-primary text-white font-semibold"
                                : "text-foreground hover:bg-muted"
                            )}
                          >
                            <item.icon className="h-5 w-5 flex-shrink-0" />
                            <span>{item.name}</span>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
