"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@imaginecalendar/ui/dialog";
import { Button } from "@imaginecalendar/ui/button";
import { RadioGroup, RadioGroupItem } from "@imaginecalendar/ui/radio-group";
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
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(
    currentCalendarId || null
  );

  // Fetch available calendars
  const { data: calendars = [], isLoading } = useQuery({
    ...trpc.calendar.getAvailableCalendars.queryOptions({ id: connectionId }),
    enabled: open,
  });

  // Update selected calendar mutation
  const updateCalendarMutation = useMutation(
    trpc.calendar.updateSelectedCalendar.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Calendar updated",
          description: "Your calendar selection has been saved.",
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
    if (!selectedCalendarId) {
      toast({
        title: "No calendar selected",
        description: "Please select a calendar to continue.",
        variant: "error",
        duration: 3500,
      });
      return;
    }

    const selectedCalendar = calendars.find((cal) => cal.id === selectedCalendarId);
    if (!selectedCalendar) return;

    updateCalendarMutation.mutate({
      id: connectionId,
      calendarId: selectedCalendar.id,
      calendarName: selectedCalendar.name,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Select Calendar
          </DialogTitle>
          <DialogDescription>
            Choose which calendar you want to use for creating events via WhatsApp.
            {calendars.length > 0 && ` Found ${calendars.length} calendar(s).`}
          </DialogDescription>
        </DialogHeader>

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
            <RadioGroup
              value={selectedCalendarId || ""}
              onValueChange={setSelectedCalendarId}
              className="space-y-3"
            >
              {calendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    selectedCalendarId === calendar.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setSelectedCalendarId(calendar.id)}
                >
                  <RadioGroupItem
                    value={calendar.id}
                    id={calendar.id}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={calendar.id}
                      className="flex items-center gap-2 font-medium cursor-pointer"
                    >
                      {calendar.name}
                      {calendar.primary && (
                        <Badge variant="secondary" className="text-xs">
                          Primary
                        </Badge>
                      )}
                      {selectedCalendarId === calendar.id && (
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
            </RadioGroup>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateCalendarMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !selectedCalendarId ||
              isLoading ||
              updateCalendarMutation.isPending
            }
          >
            {updateCalendarMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Selection"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
