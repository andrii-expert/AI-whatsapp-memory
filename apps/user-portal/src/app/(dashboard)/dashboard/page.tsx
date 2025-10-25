"use client";

import { useTRPC } from "@/trpc/client";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Calendar,
  MessageSquare,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Send } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { user } = useUser();

  // Fetch WhatsApp verification status
  const { data: whatsappNumbers } = useQuery(trpc.whatsapp.getMyNumbers.queryOptions());

  // Fetch calendar connections
  const { data: calendars } = useQuery(trpc.calendar.list.queryOptions());

  // Check if user has verified WhatsApp number
  const hasVerifiedWhatsApp = whatsappNumbers?.some(number => number.isVerified) || false;

  // Check if user has at least one calendar connected
  const hasCalendar = calendars && calendars.length > 0;

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

  const userName = user?.firstName || "there";

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Welcome {userName}
        </h1>
        <p className="text-muted-foreground mt-2">
          You are now in your CrackOn dashboard. From here you can link your calendar, connect WhatsApp
        </p>
      </div>

      {/* Grid Layout - Responsive Reordering */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Getting Started - Always First */}
        <div className="md:order-1">
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Complete these steps to start using CrackOn</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {setupSteps.map((step, index) => (
                <div key={index} className="flex items-center gap-3">
                  {step.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-[hsl(var(--brand-green))] flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className={`text-sm ${step.completed ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </div>

        {/* Getting Stuck? Support - Desktop: Second, Hidden on Mobile */}
        <div className="md:order-2 hidden md:block">
        <Card>
          <CardHeader>
            <CardTitle>Getting Stuck? Need Some help?</CardTitle>
            <CardDescription>Reach out to us (24/7)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="default"
              className="w-full bg-[#25D366] hover:bg-[#20BA5A] text-white"
              onClick={() => window.open('https://wa.me/your-support-number', '_blank')}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat on WhatsApp
            </Button>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1877F2] hover:opacity-80 transition-opacity"
                aria-label="Facebook"
              >
                <Facebook className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E4405F] hover:opacity-80 transition-opacity"
                aria-label="Instagram"
              >
                <Instagram className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1DA1F2] hover:opacity-80 transition-opacity"
                aria-label="Twitter"
              >
                <Twitter className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FF0000] hover:opacity-80 transition-opacity"
                aria-label="YouTube"
              >
                <Youtube className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0088cc] hover:opacity-80 transition-opacity"
                aria-label="Telegram"
              >
                <Send className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0A66C2] hover:opacity-80 transition-opacity"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-6 w-6" />
              </a>
            </div>
          </CardContent>
        </Card>
        </div>

        {/* WhatsApp Number - Desktop: Third, Mobile: Second */}
        <div className="md:order-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle>WhatsApp Number</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasVerifiedWhatsApp ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Your WhatsApp number is connected and verified.
                </p>
                <Button
                  variant="orange-success"
                  className="w-full"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Connected
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Connect your WhatsApp number to start managing your calendar via messages and voice notes.
                </p>
                <Button
                  variant="blue-primary"
                  className="w-full"
                  onClick={() => router.push('/settings/whatsapp?from=dashboard')}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Link WhatsApp Number
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Calendar Connection - Desktop: Fourth, Mobile: Third */}
        <div className="md:order-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle>Calendar Connection</CardTitle>
              {!hasCalendar && (
                <Badge variant="orange" className="ml-auto">
                  Setup Required
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasCalendar ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {calendars!.length === 1
                    ? "You have 1 calendar connected"
                    : `You have ${calendars!.length} calendars connected`}
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push('/settings/calendars')}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Manage Calendars
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Connect your Google Calendar or Microsoft Outlook to start managing events via WhatsApp.
                </p>
                <Button
                  variant="blue-primary"
                  className="w-full"
                  onClick={() => router.push('/settings/calendars')}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Connect Calendar
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Getting Stuck? Support - Mobile Only (Duplicate at Bottom) */}
        <div className="block md:hidden">
        <Card>
          <CardHeader>
            <CardTitle>Getting Stuck? Need Some help?</CardTitle>
            <CardDescription>Reach out to us (24/7)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="default"
              className="w-full bg-[#25D366] hover:bg-[#20BA5A] text-white"
              onClick={() => window.open('https://wa.me/your-support-number', '_blank')}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat on WhatsApp
            </Button>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1877F2] hover:opacity-80 transition-opacity"
                aria-label="Facebook"
              >
                <Facebook className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E4405F] hover:opacity-80 transition-opacity"
                aria-label="Instagram"
              >
                <Instagram className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1DA1F2] hover:opacity-80 transition-opacity"
                aria-label="Twitter"
              >
                <Twitter className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FF0000] hover:opacity-80 transition-opacity"
                aria-label="YouTube"
              >
                <Youtube className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0088cc] hover:opacity-80 transition-opacity"
                aria-label="Telegram"
              >
                <Send className="h-6 w-6" />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0A66C2] hover:opacity-80 transition-opacity"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-6 w-6" />
              </a>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
