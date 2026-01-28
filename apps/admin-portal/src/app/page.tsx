import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export default async function RootPage() {
  const authUser = await getAuthUser();
  
  if (authUser && authUser.isAdmin) {
    // User is authenticated and is admin, redirect to dashboard
    redirect("/dashboard");
  } else {
    // User is not authenticated or not admin, redirect to sign-in
    redirect("/sign-in");
  }
}
