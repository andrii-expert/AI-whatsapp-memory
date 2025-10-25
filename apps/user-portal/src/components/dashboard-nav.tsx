"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserAvatarMenu } from "@/components/user-avatar-menu";
import {
  LayoutDashboard,
  User,
  Settings,
  Calendar,
  CreditCard,
  FileText,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@imaginecalendar/ui/cn";
import { Button } from "@imaginecalendar/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@imaginecalendar/ui/sheet";
import Image from "next/image";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Profile", href: "/settings/profile", icon: User },
  { name: "Preferences", href: "/settings/preferences", icon: Settings },
  { name: "Calendars", href: "/settings/calendars", icon: Calendar },
  { name: "Subscription", href: "/billing", icon: CreditCard },
  { name: "Invoices", href: "/billing/invoices", icon: FileText },
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
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
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
                  {mobileMenuOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[350px]">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-1">
                  {navigation.map((item) => {
                    // For /billing, only match exact path to avoid highlighting when on /billing/invoices
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
                            ? "bg-primary text-white font-bold"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
