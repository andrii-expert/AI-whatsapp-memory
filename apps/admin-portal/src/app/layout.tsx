import "@/styles/globals.css";
import "@imaginecalendar/ui/globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { cn } from "@imaginecalendar/ui/cn";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "CrackOn Admin",
  description: "Administrator dashboard for CrackOn calendar system",
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={cn(
            `${GeistSans.variable} ${GeistMono.variable} font-sans`,
            "whitespace-pre-line overscroll-none antialiased"
          )}
        >
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}