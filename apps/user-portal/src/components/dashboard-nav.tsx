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
  CheckCircle2,
  Circle,
  X,
  FolderOpen,
  BookOpen,
  ShoppingCart,
  Users,
} from "lucide-react";
import { cn } from "@imaginecalendar/ui/cn";
import { Button } from "@imaginecalendar/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@imaginecalendar/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import Image from "next/image";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Calendar", href: "/calendars", icon: Calendar },
  { name: "Lists", href: "/shopping-lists", icon: ShoppingCart },
  // { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Reminders", href: "/reminders", icon: Bell },
  { name: "Friends", href: "/friends", icon: Users },
  // { name: "Notes", href: "/notes", icon: StickyNote },
  // { name: "Documents", href: "/document", icon: FolderOpen },
  // { name: "Address", href: "/address", icon: BookOpen },
];

export function DashboardNav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const trpc = useTRPC();

  // Fetch data for workspace cards
  const { data: whatsappNumbers } = useQuery(trpc.whatsapp.getMyNumbers.queryOptions());
  const { data: calendars } = useQuery(trpc.calendar.list.queryOptions());
  const { data: allTasks = [] } = useQuery(trpc.tasks.list.queryOptions({}));
  const { data: allNotes = [] } = useQuery(trpc.notes.list.queryOptions({}));
  const { data: reminders = [] } = useQuery(trpc.reminders.list.queryOptions());
  const { data: storageStats } = useQuery(trpc.storage.stats.queryOptions());
  const { data: allAddresses = [] } = useQuery(trpc.addresses.list.queryOptions());
  const { data: shoppingListItems = [] } = useQuery(trpc.shoppingList.list.queryOptions({}));

  // Check verification status
  const hasVerifiedWhatsApp = whatsappNumbers?.some(number => number.isVerified) || false;
  const hasCalendar = calendars && calendars.length > 0;

  // Calculate total items
  const totalItems = reminders.length + allTasks.length + allNotes.length + (calendars?.length || 0);

  // Setup steps
  const setupSteps = [
    {
      title: "Create your account",
      completed: true,
    },
    {
      title: "Link your WhatsApp number",
      completed: hasVerifiedWhatsApp,
    },
    {
      title: "Connect your calendar (Google or Microsoft)",
      completed: hasCalendar,
    },
    {
      title: "Send your first voice note or message",
      completed: hasVerifiedWhatsApp && hasCalendar,
    },
  ];

  return (
    <nav className="bg-[#036cea] text-white shadow-md">
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
            {/* <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
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
                  <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">Menu</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMobileMenuOpen(false)}
                      className="h-8 w-8"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    <nav className="space-y-2">
                      {navigation.map((item) => {
                        const isActive = item.href === "/billing" 
                          ? pathname === item.href 
                          : pathname === item.href || pathname.startsWith(item.href + "/");
                        
                        // Get count for each menu item
                        let itemCount = 0;
                        if (item.href === "/dashboard") {
                          itemCount = totalItems;
                        } else if (item.href === "/shopping-list") {
                          itemCount = shoppingListItems.filter((item: any) => item.status === "open").length;
                        } else if (item.href === "/reminders") {
                          itemCount = reminders.length;
                        } else if (item.href === "/calendars") {
                          itemCount = calendars?.length || 0;
                        } else if (item.href === "/tasks") {
                          itemCount = allTasks.length;
                        } else if (item.href === "/document") {
                          itemCount = storageStats?.filesCount || 0;
                        } else if (item.href === "/address") {
                          itemCount = allAddresses.length;
                        }
                        
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                              isActive
                                ? "bg-primary text-white font-semibold"
                                : "text-foreground hover:bg-muted"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <item.icon className="h-5 w-5 flex-shrink-0" />
                              <span>{item.name}</span>
                            </div>
                            {itemCount > 0 && (
                              <Badge variant="orange">
                                {itemCount}
                              </Badge>
                            )}
                          </Link>
                        );
                      })}
                    </nav>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Getting Started</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {setupSteps.map((step, index) => (
                            <div key={index} className="flex items-center gap-3">
                              {step.completed ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                              ) : (
                                <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                              )}
                              <span
                                className={`text-sm ${
                                  step.completed
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {step.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </SheetContent>
            </Sheet> */}
          </div>
        </div>
      </div>
    </nav>
  );
}
