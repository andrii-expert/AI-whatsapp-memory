"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { useSearchParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import { useToast } from "@imaginecalendar/ui/use-toast";
import {
  Calendar,
  Plus,
  Settings,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Star,
  StarOff,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  Home,
  Edit
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { CalendarSelectionDialog } from "@/components/calendar-selection-dialog";

export default function CalendarsPage() {
  const trpc = useTRPC();
  const { toast } = useToast();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [calendarSelectionDialog, setCalendarSelectionDialog] = useState<{
    open: boolean;
    connectionId: string | null;
    currentCalendarId: string | null;
  }>({
    open: false,
    connectionId: null,
    currentCalendarId: null,
  });

  // Fetch user's calendars
  const { data: calendars = [], isLoading, refetch } = useQuery(
    trpc.calendar.list.queryOptions()
  );

  // Handle OAuth callback from cookies
  useEffect(() => {
    // Function to get cookie value
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        const cookieValue = parts.pop()?.split(';').shift();
        return cookieValue ? decodeURIComponent(cookieValue) : null;
      }
      return null;
    };

    // Function to delete cookie
    const deleteCookie = (name: string) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    };

    // Check for OAuth callback data in cookie
    const oauthCallbackCookie = getCookie('oauth_callback');
    const oauthErrorCookie = getCookie('oauth_error');

    if (oauthErrorCookie) {
      try {
        const errorData = JSON.parse(oauthErrorCookie);
        console.log("[CALENDAR_PAGE_DEBUG] Processing OAuth error from cookie:", errorData);

        toast({
          title: "Authorization failed",
          description: errorData.error_description || errorData.error || "Failed to authorize calendar",
          variant: "error",
          duration: 5000,
        });

        // Clean up cookie
        deleteCookie('oauth_error');
      } catch (e) {
        console.error("[CALENDAR_PAGE_DEBUG] Failed to parse oauth_error cookie:", e);
        deleteCookie('oauth_error');
      }
      return;
    }

    if (oauthCallbackCookie && user) {
      try {
        const callbackData = JSON.parse(oauthCallbackCookie);
        console.log("[CALENDAR_PAGE_DEBUG] Processing OAuth callback from cookie:", {
          provider: callbackData.provider,
          hasCode: !!callbackData.code,
          state: callbackData.state,
          userId: user?.id,
          userEmail: user?.emailAddresses?.[0]?.emailAddress
        });

        const redirectUri = `${window.location.origin}/api/calendars/callback`;
        console.log("[CALENDAR_PAGE_DEBUG] Using redirectUri:", redirectUri);

        // Process the OAuth callback
        connectCalendarMutation.mutate({
          provider: callbackData.provider,
          code: callbackData.code,
          redirectUri,
        });

        // Clean up cookie
        deleteCookie('oauth_callback');
      } catch (e) {
        console.error("[CALENDAR_PAGE_DEBUG] Failed to parse oauth_callback cookie:", e);
        deleteCookie('oauth_callback');
      }
    }

    // Also check URL params for backward compatibility
    const code = searchParams.get("code");
    const provider = searchParams.get("provider") as "google" | "microsoft";
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      console.log("[CALENDAR_PAGE_DEBUG] Processing OAuth error from URL");
      toast({
        title: "Authorization failed",
        description: errorDescription || `Failed to authorize ${provider} calendar`,
        variant: "error",
        duration: 5000,
      });
      router.replace("/settings/calendars");
      return;
    }

    if (code && provider && user) {
      console.log("[CALENDAR_PAGE_DEBUG] Processing OAuth callback from URL");
      const redirectUri = `${window.location.origin}/api/calendars/callback`;
      connectCalendarMutation.mutate({
        provider,
        code,
        redirectUri,
      });
      router.replace("/settings/calendars");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.id]);

  // Connect calendar mutation
  const connectCalendarMutation = useMutation(
    trpc.calendar.connect.mutationOptions({
      onSuccess: async () => {
        toast({
          title: "Calendar connected",
          description: "Your calendar has been connected successfully.",
          variant: "success",
        });
        setConnectingProvider(null);
        
        // Refetch and automatically sync the newly added calendar
        const result = await refetch();
        if (result.data && result.data.length > 0) {
          // Find the most recently added calendar (should be the last one or the one without a sync)
          const newCalendar = result.data[result.data.length - 1];
          if (newCalendar) {
            // Trigger automatic sync for the first time
            syncCalendarMutation.mutate({ id: newCalendar.id });
          }
        }
      },
      onError: (error) => {
        toast({
          title: "Connection failed",
          description: error.message || "Failed to connect calendar. Please try again.",
          variant: "error",
          duration: 3500,
        });
        setConnectingProvider(null);
      },
    })
  );

  // Disconnect calendar mutation
  const disconnectCalendarMutation = useMutation(
    trpc.calendar.disconnect.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Calendar disconnected",
          description: "Your calendar has been disconnected.",
          variant: "success",
        });
        refetch();
      },
      onError: (error) => {
        toast({
          title: "Disconnect failed",
          description: error.message || "Failed to disconnect calendar. Please try again.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  // Set primary calendar mutation
  const setPrimaryMutation = useMutation(
    trpc.calendar.update.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Primary calendar updated",
          description: "Your primary calendar has been updated.",
          variant: "success",
        });
        refetch();
      },
      onError: (error) => {
        toast({
          title: "Update failed",
          description: error.message || "Failed to update primary calendar. Please try again.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  // Test connection mutation
  const testConnectionMutation = useMutation(
    trpc.calendar.testConnection.mutationOptions({
      onSuccess: () => {
        toast({
          title: "Connection successful",
          description: "Your calendar connection is working properly.",
          variant: "success",
        });
      },
      onError: (error) => {
        toast({
          title: "Connection test failed",
          description: error.message || "Calendar connection test failed.",
          variant: "error",
          duration: 3500,
        });
      },
    })
  );

  // Sync calendar mutation
  const syncCalendarMutation = useMutation(
    trpc.calendar.sync.mutationOptions({
      onSuccess: (data) => {
        toast({
          title: "Sync successful",
          description: data.message,
          variant: "success",
        });
        refetch(); // Refresh the calendar list to update sync status
      },
      onError: (error) => {
        toast({
          title: "Sync failed",
          description: error.message || "Calendar sync failed.",
          variant: "error",
          duration: 3500,
        });
        refetch(); // Refresh to show updated error status
      },
    })
  );

  const handleConnectCalendar = async (provider: "google" | "microsoft") => {
    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please sign in to connect your calendar",
        variant: "error",
      });
      return;
    }

    setConnectingProvider(provider);

    try {
      // Generate state parameter for security (provider:userId)
      const state = `${provider}:${user.id}`;
      
      // Get OAuth authorization URL from our API route
      const response = await fetch(`/api/calendars/auth?provider=${provider}&state=${encodeURIComponent(state)}`);
      
      if (!response.ok) {
        throw new Error("Failed to get authorization URL");
      }

      const { authUrl } = await response.json();

      // Redirect to OAuth provider
      window.location.href = authUrl;
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to start calendar connection",
        variant: "error",
        duration: 3500,
      });
      setConnectingProvider(null);
    }
  };

  const handleDisconnectCalendar = (calendarId: string) => {
    disconnectCalendarMutation.mutate({ id: calendarId });
  };

  const handleSetPrimary = (calendarId: string) => {
    setPrimaryMutation.mutate({
      id: calendarId,
      isPrimary: true
    });
  };

  const handleTestConnection = (calendarId: string) => {
    testConnectionMutation.mutate({ id: calendarId });
  };

  const handleSyncCalendar = (calendarId: string) => {
    syncCalendarMutation.mutate({ id: calendarId });
  };

  const handleChangeCalendar = (connectionId: string, currentCalendarId: string | null) => {
    setCalendarSelectionDialog({
      open: true,
      connectionId,
      currentCalendarId,
    });
  };

  const handleCalendarSelectionClose = () => {
    setCalendarSelectionDialog({
      open: false,
      connectionId: null,
      currentCalendarId: null,
    });
    refetch(); // Refresh calendar list after selection
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "google":
        return "🔗"; // Would use proper Google icon
      case "microsoft":
        return "🔗"; // Would use proper Microsoft icon
      default:
        return "📅";
    }
  };

  const getStatusBadge = (calendar: any) => {
    if (!calendar.isActive) {
      return <Badge variant="secondary" className="text-red-600">Disconnected</Badge>;
    }
    if (calendar.lastSyncError) {
      return <Badge variant="destructive">Sync Error</Badge>;
    }
    if (calendar.lastSyncAt) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Connected</Badge>;
    }
    return <Badge variant="secondary">Never Synced</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Loading calendars...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
        <span className="font-medium">Calendar Connections</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Calendar Connections</h1>
        <p className="text-muted-foreground mt-2">
          Connect your Google and Microsoft calendars to manage events through WhatsApp
        </p>
      </div>

      {/* Connect New Calendar Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Connect Calendar
          </CardTitle>
          <CardDescription>
            Add a new calendar connection to start managing events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 sm:space-y-0 sm:flex sm:gap-4">
            <Button
              onClick={() => handleConnectCalendar("google")}
              disabled={connectingProvider === "google"}
              variant="blue-primary"
              className="flex items-center gap-2 w-full sm:w-auto"
              size="lg"
            >
              {connectingProvider === "google" ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : (
                <span>🔗</span>
              )}
              {connectingProvider === "google" ? "Connecting..." : "Connect Google Calendar"}
            </Button>

            <Button
              onClick={() => handleConnectCalendar("microsoft")}
              disabled={connectingProvider === "microsoft"}
              variant="outline"
              className="flex items-center gap-2 w-full sm:w-auto"
              size="lg"
            >
              {connectingProvider === "microsoft" ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : (
                <span>🔗</span>
              )}
              {connectingProvider === "microsoft" ? "Connecting..." : "Connect Microsoft 365"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Connected Calendars */}
      {calendars.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Connected Calendars</h2>
          
          {calendars.map((calendar) => (
            <Card key={calendar.id} className="relative">
              <CardHeader>
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-2xl flex-shrink-0 hidden md:inline">{getProviderIcon(calendar.provider)}</span>
                    <div className="min-w-0">
                      <CardTitle className="text-lg sm:text-xl break-words">
                        <div className="flex items-center gap-2 flex-wrap">
                          {calendar.calendarName || `${calendar.provider} Calendar`}
                          {calendar.isPrimary && (
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                          )}
                        </div>
                      </CardTitle>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span className="truncate">{calendar.email}</span>
                        <span className="flex-shrink-0">•</span>
                        {getStatusBadge(calendar)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end">
                    {!calendar.isPrimary && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSetPrimary(calendar.id)}
                        disabled={setPrimaryMutation.isPending}
                        className="flex items-center gap-1 text-xs sm:text-sm"
                      >
                        <StarOff className="h-4 w-4" />
                        <span className="hidden sm:inline">Set Primary</span>
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTestConnection(calendar.id)}
                      disabled={testConnectionMutation.isPending}
                      className="flex items-center gap-1 text-xs sm:text-sm"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="hidden sm:inline">Test</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleChangeCalendar(calendar.id, calendar.calendarId)}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs sm:text-sm"
                    >
                      <Edit className="h-4 w-4" />
                      <span className="hidden sm:inline">Change</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSyncCalendar(calendar.id)}
                      disabled={syncCalendarMutation.isPending}
                      className="flex items-center gap-1 text-xs sm:text-sm"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncCalendarMutation.isPending ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Sync</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDisconnectCalendar(calendar.id)}
                      disabled={disconnectCalendarMutation.isPending}
                      className="flex items-center gap-1 text-red-600 hover:text-red-700 text-xs sm:text-sm"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Disconnect</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Provider</p>
                    <p className="font-medium capitalize">{calendar.provider}</p>
                  </div>

                  <div>
                    <p className="text-muted-foreground">Selected Calendar</p>
                    <p className="font-medium">{calendar.calendarName || 'Default'}</p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <div className="flex items-center gap-1">
                      {calendar.isActive ? (
                        <CheckCircle className="h-3 w-3 text-green-600" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-600" />
                      )}
                      <span>{calendar.isActive ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Last Sync</p>
                    <p>{calendar.lastSyncAt 
                      ? formatDistanceToNow(new Date(calendar.lastSyncAt), { addSuffix: true })
                      : "Never"
                    }</p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Sync Failures</p>
                    <p className={calendar.syncFailureCount > 0 ? "text-red-600" : ""}>
                      {calendar.syncFailureCount || 0}
                    </p>
                  </div>
                </div>
                
                {calendar.lastSyncError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-800">Last Sync Error</p>
                        <p className="text-sm text-red-700">{calendar.lastSyncError}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No calendars connected</h3>
            <p className="text-muted-foreground mb-6">
              Connect your first calendar to start managing events through WhatsApp
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <Button
                onClick={() => handleConnectCalendar("google")}
                disabled={connectingProvider === "google"}
                variant="blue-primary"
                className="flex items-center gap-2 w-full sm:w-auto"
                size="lg"
              >
                <span>🔗</span>
                Connect Google Calendar
              </Button>

              <Button
                onClick={() => handleConnectCalendar("microsoft")}
                disabled={connectingProvider === "microsoft"}
                variant="outline"
                className="flex items-center gap-2 w-full sm:w-auto"
                size="lg"
              >
                <span>🔗</span>
                Connect Microsoft 365
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar Selection Dialog */}
      {calendarSelectionDialog.connectionId && (
        <CalendarSelectionDialog
          open={calendarSelectionDialog.open}
          onOpenChange={(open) => {
            if (!open) handleCalendarSelectionClose();
          }}
          connectionId={calendarSelectionDialog.connectionId}
          currentCalendarId={calendarSelectionDialog.currentCalendarId}
          onSuccess={handleCalendarSelectionClose}
        />
      )}
    </div>
  );
}