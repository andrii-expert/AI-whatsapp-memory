"use client";

import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from "@imaginecalendar/ui/alert-dialog";
import { Button } from "@imaginecalendar/ui/button";
import { MessageSquare, LayoutDashboard } from "lucide-react";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WelcomeModal({ open, onOpenChange }: WelcomeModalProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const markWelcomeModalShownMutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: () => {
        // Invalidate user query to refresh the data
        queryClient.invalidateQueries({ queryKey: trpc.user.me.queryKey() });
      },
    })
  );

  const handleClose = async () => {
    // Mark as shown in database
    try {
      await markWelcomeModalShownMutation.mutateAsync({
        showWelcomeModal: false,
      });
    } catch (error) {
      console.error("Failed to update welcome modal status:", error);
    }
    onOpenChange(false);
  };

  const handleGoToDashboard = async () => {
    await handleClose();
    // Already on dashboard, just close
  };

  const handleWhatsAppClick = async () => {
    await handleClose();
    // Navigate to WhatsApp settings page
    router.push("/settings/whatsapp");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader className="relative">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>New here? Let's get you started</span>
            </div>
          </div>
          <AlertDialogTitle className="text-2xl sm:text-3xl font-bold mt-4">
            Welcome to <span className="text-blue-600">CrackOn</span>
          </AlertDialogTitle>
        </AlertDialogHeader>

        <AlertDialogDescription className="space-y-4 text-base text-gray-700">
          <p>
            This is your space to keep everything organised, from your events, notes, reminders, ideas and more.
          </p>

          <p>
            Your dashboard allows you to create, edit, and share your tasks and notes with other CrackOn users in an easy to use interface and accessible from your phone or desktop.
          </p>

          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
            <p className="font-medium text-blue-900 mb-2">Prefer using WhatsApp?</p>
            <p>
              Link your mobile number and just send CrackOn a message or voice note when you want to add a note, set a reminder, or update something. No complicated menus. No extra apps. Just chat like you normally do.
            </p>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold text-lg mb-4 text-gray-900">
              Get started in three quick steps:
            </h3>
            <ol className="space-y-3 list-decimal list-inside text-gray-700">
              <li className="pl-2">Link your WhatsApp number</li>
              <li className="pl-2">Create your first note or reminder</li>
              <li className="pl-2">Use this dashboard to manage everything</li>
            </ol>
          </div>
        </AlertDialogDescription>

        <AlertDialogFooter className="flex-col sm:flex-row gap-3 mt-6 pt-4 border-t sm:justify-start">
          <AlertDialogAction
            onClick={handleWhatsAppClick}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-6 text-base order-1 sm:order-1"
          >
            <MessageSquare className="h-5 w-5 mr-2" />
            Link my WhatsApp
          </AlertDialogAction>
          
          <AlertDialogAction
            onClick={handleGoToDashboard}
            className="flex-1 font-semibold py-6 text-blue-600 border-2 bg-transparent hover:bg-gray-50 order-2 sm:order-2"
          >
            <LayoutDashboard className="h-5 w-5 mr-2 text-blue-600" />
            Go to my dashboard
          </AlertDialogAction>
        </AlertDialogFooter>

        <div className="text-center mt-4">
          <AlertDialogCancel
            onClick={handleClose}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors border-0 bg-transparent hover:bg-transparent shadow-none p-0 h-auto font-normal"
          >
            I'll set this up later
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

