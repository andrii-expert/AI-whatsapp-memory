"use client";

import { UserButton } from "@clerk/nextjs";
import { Users, BarChart3, Home, Layers } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@imaginecalendar/ui/cn";
import Image from "next/image";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Users", href: "/users", icon: Users },
  { name: "Plans", href: "/plans", icon: Layers },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
];

export function AdminHeader() {
  const pathname = usePathname();

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

          {/* User Menu */}
          <div className="flex items-center">
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9",
                  userButtonTrigger: "focus:shadow-none",
                },
              }}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}