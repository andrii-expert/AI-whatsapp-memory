// This file is no longer used - redirect to the new sign-in page
import { redirect } from "next/navigation";

export default function SignInPage() {
  redirect("/sign-in");
}