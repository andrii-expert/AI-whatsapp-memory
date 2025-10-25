import { Card, CardContent, CardHeader } from "@imaginecalendar/ui/card";

export default function DashboardLoading() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          This is your starting point. Connect your WhatsApp, sync your calendars, and choose how you want reminders to work for you. CrackOn - its that easy!
        </p>
      </div>

      {/* Setup Status Cards Skeleton */}
      <div className="grid gap-6 md:grid-cols-2 mb-8">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="skeleton-box h-5 w-5 rounded" />
                  <div className="skeleton-box h-6 w-32 rounded" />
                </div>
                <div className="skeleton-box h-6 w-24 rounded" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="skeleton-box h-4 w-full rounded" />
                <div className="skeleton-box h-4 w-3/4 rounded" />
                <div className="skeleton-box h-10 w-full rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Getting Started Guide Skeleton */}
      <Card>
        <CardHeader>
          <div className="skeleton-box h-6 w-32 rounded" />
          <div className="skeleton-box h-4 w-48 rounded" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton-box h-5 w-5 rounded" />
                <div className="skeleton-box h-4 w-64 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}