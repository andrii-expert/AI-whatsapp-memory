"use client";

import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { AlertTriangle, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function UnauthorizedPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "include",
    });
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Access Denied</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            You don't have admin privileges to access this portal.
          </p>
          <p className="text-sm text-muted-foreground">
            Contact your system administrator if you believe this is an error.
          </p>
          <div className="space-y-2">
            <Link href={process.env.NEXT_PUBLIC_USER_PORTAL_URL || "http://localhost:3000"} className="block">
              <Button className="w-full">Go to User Portal</Button>
            </Link>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign In with Different Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}