"use client";

import { useState } from "react";
import { Users, BarChart3, Home, Layers, Menu, X, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Users", href: "/users", icon: Users },
  { name: "Plans", href: "/plans", icon: Layers },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
];

export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-primary text-white shadow-md">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/dashboard" className="flex items-center gap-3">
              <Image
                src="/crack-on-logo.png"
                alt="CrackOn Admin"
                width={140}
                height={35}
                className="hidden sm:block"
                priority
              />
              <Image
                src="/crack-on-logo.png"
                alt="CrackOn Admin"
                width={120}
                height={30}
                className="sm:hidden"
                priority
              />
              <span className="text-xs bg-white/20 px-2 py-1 rounded text-white font-medium">
                ADMIN
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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

          {/* Desktop Sign Out Button */}
          <div className="hidden md:flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch("/api/auth/signout", {
                  method: "POST",
                  credentials: "include",
                });
                router.push("/sign-in");
                router.refresh();
              }}
              className="text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-2">
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
                  <SheetTitle className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    Admin Menu
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-1">
                  {navigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-foreground hover:bg-muted"
                    onClick={async () => {
                      await fetch("/api/auth/signout", {
                        method: "POST",
                        credentials: "include",
                      });
                      setMobileMenuOpen(false);
                      router.push("/sign-in");
                      router.refresh();
                    }}
                  >
                    <LogOut className="h-5 w-5 mr-3" />
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}