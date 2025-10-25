import Link from "next/link";
import Image from "next/image";
import { Button } from "@imaginecalendar/ui/button";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  // If user is already authenticated, redirect to dashboard
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page-blue-theme bg-background flex min-h-screen flex-col items-center justify-center p-4 md:p-24">
      <div className="space-y-6 text-center max-w-2xl w-full px-4">
        {/* CrackOn Logo with Welcome text */}
        <div className="flex justify-center mb-8">
          <Image 
            src="/crackon_logo_pngs-16.png" 
            alt="Welcome to CrackOn" 
            width={400} 
            height={150}
            className="w-full md:w-[60%] h-auto" 
          />
        </div>

        <p className="text-lg text-muted-foreground pt-4">
          Manage your calendar through WhatsApp voice notes and messages.
          Simply send a voice note or text, and we'll handle the rest.
        </p>
        <div className="flex flex-row gap-4 justify-center pt-4">
          <Link href="/sign-in" className="w-full">
            <Button size="lg" variant="blue-primary" className="w-full whitespace-nowrap">
              Sign In
            </Button>
          </Link>
          <Link href="/sign-up" className="w-full">
            <Button size="lg" variant="blue-secondary" className="w-full whitespace-nowrap">
              Sign Up
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground pt-8">
          Integrate with Google Calendar and Microsoft Outlook
        </p>
      </div>
    </main>
  );
}