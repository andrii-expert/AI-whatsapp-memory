"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@imaginecalendar/ui/card";
import { Button } from "@imaginecalendar/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  UserPlus,
  RefreshCw,
  AlertCircle,
  Activity,
} from "lucide-react";
import { useToast } from "@imaginecalendar/ui/use-toast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { format, parseISO, subDays } from "date-fns";
import { cn } from "@imaginecalendar/ui/cn";

export default function DashboardPage() {
  const { toast } = useToast();
  const trpc = useTRPC();
  const [signupsPeriod, setSignupsPeriod] = useState<number>(30);

  const { data: metrics, isLoading, error, refetch } = useQuery(
    trpc.admin.getDashboardMetrics.queryOptions()
  );

  const { data: dailySignups, isLoading: signupsLoading } = useQuery(
    trpc.admin.getDailySignups.queryOptions({ days: signupsPeriod })
  );

  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshing data",
      description: "Dashboard metrics are being refreshed...",
    });
  };

  // Calculate growth percentages
  const signupsGrowth7d = metrics?.signupsLast7Days
    ? ((metrics.signupsLast7Days / 7) / ((metrics.signupsLast30Days - metrics.signupsLast7Days) / 23)) * 100 - 100
    : 0;

  const signupsGrowth30d = metrics?.signupsLast30Days
    ? ((metrics.signupsLast30Days / 30) / ((metrics.signupsLast30Days - metrics.signupsLast7Days) / 23)) * 100 - 100
    : 0;

  // Format chart data
  const chartData = dailySignups?.map((item) => ({
    ...item,
    formattedDate: format(parseISO(item.date), "MMM dd"),
    fullDate: format(parseISO(item.date), "MMMM dd, yyyy"),
  })) || [];

  // Calculate average daily signups
  const avgDailySignups = chartData.length > 0
    ? (chartData.reduce((sum, item) => sum + item.signups, 0) / chartData.length).toFixed(1)
    : "0";

  // Calculate total signups in period
  const totalSignupsInPeriod = chartData.reduce((sum, item) => sum + item.signups, 0);

  // Custom tooltip for chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium mb-2">{data.fullDate}</p>
          <div className="space-y-1 text-sm">
            <p className="text-blue-600">
              Signups: <span className="font-semibold">{data.signups}</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Overview of your platform metrics and user activity
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Overview of your platform metrics and user activity
            </p>
          </div>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <div>
                <p className="font-medium">Failed to load dashboard metrics</p>
                <p className="text-sm text-muted-foreground">
                  Please try refreshing the page or contact support if the issue persists.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="mt-4"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your platform metrics and user activity
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalUsers?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All registered users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Trials</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.activeTrials || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently in trial period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paying Users</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.payingUsers || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Monthly & annual subscribers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R{metrics?.mrr ? (metrics.mrr / 100).toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Monthly recurring revenue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.churnRate || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              This month cancellations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Signups (7 days)</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{metrics?.signupsLast7Days || 0}</div>
              {signupsGrowth7d !== 0 && (
                <div className={cn(
                  "flex items-center text-xs",
                  signupsGrowth7d > 0 ? "text-green-600" : "text-red-600"
                )}>
                  {signupsGrowth7d > 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {Math.abs(signupsGrowth7d).toFixed(1)}%
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Last 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Signups (30 days)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.signupsLast30Days || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Last 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Signups Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Daily Signups
              </CardTitle>
              <CardDescription className="mt-1">
                Track user registrations over time
              </CardDescription>
            </div>
            <Select
              value={signupsPeriod.toString()}
              onValueChange={(value) => setSignupsPeriod(parseInt(value))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {signupsLoading ? (
            <div className="flex items-center justify-center h-80">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 space-y-2">
              <Activity className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No signup data available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Signups</div>
                  <div className="text-2xl font-bold mt-1">{totalSignupsInPeriod}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    In the last {signupsPeriod} days
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">Average Daily</div>
                  <div className="text-2xl font-bold mt-1">{avgDailySignups}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Signups per day
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">Peak Day</div>
                  <div className="text-2xl font-bold mt-1">
                    {Math.max(...chartData.map((d) => d.signups))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Highest single day
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="formattedDate"
                      className="text-xs"
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fontSize: 12 }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="signups"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#colorSignups)"
                      name="Signups"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
