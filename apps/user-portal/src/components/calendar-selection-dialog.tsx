"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@imaginecalendar/ui/alert-dialog";
import { Button } from "@imaginecalendar/ui/button";
import { Checkbox } from "@imaginecalendar/ui/checkbox";
import { Label } from "@imaginecalendar/ui/label";
import { Badge } from "@imaginecalendar/ui/badge";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { Check, Calendar, Loader2 } from "lucide-react";

interface CalendarSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  currentCalendarId?: string | null;
  onSuccess?: () => void;
}

export function CalendarSelectionDialog({
  open,
  onOpenChange,
  connectionId,
  currentCalendarId,
  onSuccess,
}: CalendarSelectionDialogProps) {
  const trpc = useTRPC();
  const { toast } = useToast();
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(
    currentCalendarId ? [currentCalendarId] : []
  );

  // Reset selection when dialog opens/closes or currentCalendarId changes
  useEffect(() => {
    if (open) {
      setSelectedCalendarIds(currentCalendarId ? [currentCalendarId] : []);
    }
  }, [open, currentCalendarId]);

  // Fetch available calendars
  const { data: calendars = [], isLoading } = useQuery({
    ...trpc.calendar.getAvailableCalendars.queryOptions({ id: connectionId }),
    enabled: open,
  });

  // Update WhatsApp calendar selection mutation
  const updateWhatsAppCalendarsMutation = useMutation(
    trpc.preferences.update.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Calendars updated",
          description: `Selected ${selectedCalendarIds.length} calendar${selectedCalendarIds.length === 1 ? '' : 's'} for WhatsApp events.`,
          variant: "success",
        });
        onSuccess?.();
        onOpenChange(false);
      },
      onError: (error) => {
        toast({
          title: "Update failed",
          description: error.message || "Failed to update calendar selection.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  const handleSave = () => {
    if (selectedCalendarIds.length === 0) {
      toast({
        title: "No calendars selected",
        description: "Please select at least one calendar to continue.",
        variant: "error",
        duration: 3500,
      });
      return;
    }

    updateWhatsAppCalendarsMutation.mutate({
      reminders: {
        whatsappCalendarIds: selectedCalendarIds,
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Select Calendar
          </AlertDialogTitle>
          <AlertDialogDescription>
            Choose which calendars you want to use for creating events via WhatsApp.
            {calendars.length > 0 && ` Found ${calendars.length} calendar(s).`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : calendars.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No calendars found. Please reconnect your calendar.
            </div>
          ) : (
            <div className="space-y-3">
              {calendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    selectedCalendarIds.includes(calendar.id)
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => {
                    if (selectedCalendarIds.includes(calendar.id)) {
                      setSelectedCalendarIds(prev => prev.filter(id => id !== calendar.id));
                    } else {
                      setSelectedCalendarIds(prev => [...prev, calendar.id]);
                    }
                  }}
                >
                  <Checkbox
                    id={calendar.id}
                    checked={selectedCalendarIds.includes(calendar.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCalendarIds(prev => [...prev, calendar.id]);
                      } else {
                        setSelectedCalendarIds(prev => prev.filter(id => id !== calendar.id));
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                      {calendar.primary && (
                        <div className="flex justify-start w-full">
                          <Badge variant="secondary" className="text-xs text-green-600">
                            Primary
                          </Badge>
                        </div>
                      )}
                    <Label
                      htmlFor={calendar.id}
                      className="flex items-center gap-2 font-medium cursor-pointer"
                    >
                      {calendar.name}
                      {selectedCalendarIds.includes(calendar.id) && (
                        <Check className="h-4 w-4 text-blue-600" />
                      )}
                    </Label>
                    {calendar.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {calendar.description}
                      </p>
                    )}
                    {!calendar.canEdit && (
                      <p className="text-xs text-amber-600 mt-1">
                        Read-only calendar - you may not be able to create events
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateWhatsAppCalendarsMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              selectedCalendarIds.length === 0 ||
              isLoading ||
              updateWhatsAppCalendarsMutation.isPending
            }
          >
            {updateWhatsAppCalendarsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Selection"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
