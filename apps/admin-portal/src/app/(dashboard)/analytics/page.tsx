"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@imaginecalendar/ui/card";
import { Button } from "@imaginecalendar/ui/button";
import { Input } from "@imaginecalendar/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@imaginecalendar/ui/tabs";
import { Badge } from "@imaginecalendar/ui/badge";
import {
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  DollarSign,
  Calendar,
  Users,
  Filter,
  X,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { CostOverview } from "@/components/analytics/cost-overview";
import { CostTrends } from "@/components/analytics/cost-trends";
import { UserCostBreakdown } from "@/components/analytics/user-cost-breakdown";
import { cn } from "@imaginecalendar/ui/cn";

export default function AnalyticsPage() {
  const { toast } = useToast();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [selectedPeriod, setSelectedPeriod] = useState("30");
  const [dateRange, setDateRange] = useState({
    from: "",
    to: "",
  });
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);

  // Validate date range
  useEffect(() => {
    if (dateRange.from && dateRange.to) {
      const fromDate = new Date(dateRange.from);
      const toDate = new Date(dateRange.to);
      
      if (fromDate > toDate) {
        setDateRangeError("From date must be before To date");
      } else {
        setDateRangeError(null);
      }
    } else {
      setDateRangeError(null);
    }
  }, [dateRange.from, dateRange.to]);

  // Prepare date range for queries
  const queryDateRange = dateRange.from && dateRange.to && !dateRangeError
    ? {
        from: startOfDay(new Date(dateRange.from)).toISOString(),
        to: endOfDay(new Date(dateRange.to)).toISOString(),
      }
    : undefined;

  // Preset date range handlers
  const applyPresetRange = (preset: string) => {
    const today = new Date();
    let from: Date;
    let to: Date = endOfDay(today);

    switch (preset) {
      case "today":
        from = startOfDay(today);
        break;
      case "last7":
        from = startOfDay(subDays(today, 7));
        break;
      case "last30":
        from = startOfDay(subDays(today, 30));
        break;
      case "thisMonth":
        from = startOfMonth(today);
        break;
      case "lastMonth":
        from = startOfMonth(subMonths(today, 1));
        to = endOfMonth(subMonths(today, 1));
        break;
      default:
        return;
    }

    setDateRange({
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
    });
  };

  // Fetch cost overview - disable if date range is invalid
  const { data: overview, isLoading: overviewLoading, error: overviewError, refetch: refetchOverview } = useQuery({
    ...trpc.whatsappAnalytics.getCostOverview.queryOptions(queryDateRange || {}),
    enabled: !dateRangeError,
  });

  // Fetch cost statistics for dashboard widgets
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    ...trpc.whatsappAnalytics.getCostStats.queryOptions(queryDateRange || {}),
    enabled: !dateRangeError,
  });

  // Fetch cost trends
  const { data: trends, isLoading: trendsLoading, error: trendsError, refetch: refetchTrends } = useQuery({
    ...trpc.whatsappAnalytics.getCostTrends.queryOptions({
      days: parseInt(selectedPeriod),
      ...queryDateRange,
    }),
    enabled: !dateRangeError,
  });

  // Refetch all queries
  const handleRefreshAll = () => {
    refetchOverview();
    refetchStats();
    refetchTrends();
    queryClient.invalidateQueries({ queryKey: [["whatsappAnalytics"]] });
    toast({
      title: "Refreshing data",
      description: "All analytics data is being refreshed...",
    });
  };

  const handleExport = async () => {
    try {
      if (dateRangeError) {
        toast({
          title: "Invalid date range",
          description: "Please fix the date range before exporting",
          variant: "destructive",
        });
        return;
      }

      let exportParams: { from?: string; to?: string } = {};

      if (queryDateRange) {
        exportParams = {
          from: queryDateRange.from,
          to: queryDateRange.to,
        };
      }

      const exportData = await queryClient.fetchQuery(
        trpc.whatsappAnalytics.exportCostData.queryOptions(exportParams)
      );

      // Convert to CSV
      if (exportData.length === 0) {
        toast({
          title: "No data to export",
          description: "No WhatsApp cost data found for the selected period",
          variant: "destructive",
        });
        return;
      }

      const headers = [
        "Message ID",
        "User ID",
        "User Name",
        "User Email",
        "Phone Number",
        "Message Type",
        "Cost (Cents)",
        "Exchange Rate",
        "Created At",
        "Processed",
      ];

      const csvContent = [
        headers.join(","),
        ...exportData.map((row: any) => [
          row.messageId || "",
          row.userId,
          row.userName || "",
          row.userEmail,
          row.phoneNumber,
          row.messageType,
          row.costCents,
          row.exchangeRate || "",
          format(new Date(row.createdAt), "yyyy-MM-dd HH:mm:ss"),
          row.processed,
        ].map(field => `"${field}"`).join(","))
      ].join("\n");

      // Download CSV
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);

      const filename = dateRange.from && dateRange.to
        ? `whatsapp-costs-${dateRange.from}-to-${dateRange.to}.csv`
        : `whatsapp-costs-${format(new Date(), "yyyy-MM-dd")}.csv`;

      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export successful",
        description: `Exported ${exportData.length} records`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export WhatsApp cost data",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (cents: number) => {
    const zarAmount = (cents / 100) * (stats?.usdToZarRate || 18.5);
    return `R${zarAmount.toFixed(2)}`;
  };

  const formatUsdCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(4)}`;
  };

  const isLoading = overviewLoading || statsLoading;
  const hasError = overviewError || statsError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor messaging costs, trends, and user activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRefreshAll}
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh All
          </Button>
          <Button 
            onClick={handleExport} 
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Error State */}
      {hasError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <div>
                <p className="font-medium">Failed to load analytics data</p>
                <p className="text-sm text-muted-foreground">
                  Please try refreshing the page or contact support if the issue persists.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Date Range Filter
              </CardTitle>
              <CardDescription className="mt-1">
                Filter analytics data by date range
              </CardDescription>
            </div>
            {queryDateRange && (
              <Badge variant="secondary" className="gap-1">
                <Calendar className="h-3 w-3" />
                Filter Active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPresetRange("today")}
              className="text-xs"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPresetRange("last7")}
              className="text-xs"
            >
              Last 7 Days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPresetRange("last30")}
              className="text-xs"
            >
              Last 30 Days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPresetRange("thisMonth")}
              className="text-xs"
            >
              This Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPresetRange("lastMonth")}
              className="text-xs"
            >
              Last Month
            </Button>
          </div>

          {/* Custom Date Range */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 pt-2 border-t">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">From Date</label>
              <Input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                className={cn(dateRangeError && "border-destructive")}
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">To Date</label>
              <Input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                min={dateRange.from || undefined}
                className={cn(dateRangeError && "border-destructive")}
              />
            </div>
            <div className="flex items-end gap-2">
              {(dateRange.from || dateRange.to) && (
                <Button
                  onClick={() => {
                    setDateRange({ from: "", to: "" });
                    setDateRangeError(null);
                  }}
                  variant="outline"
                  size="sm"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Error Message */}
          {dateRangeError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{dateRangeError}</span>
            </div>
          )}

          {/* Status Message */}
          {!dateRangeError && (
            <div className="text-xs text-muted-foreground">
              {queryDateRange ? (
                <span>
                  Showing data from{" "}
                  <span className="font-medium">{format(new Date(dateRange.from), "MMM dd, yyyy")}</span>{" "}
                  to{" "}
                  <span className="font-medium">{format(new Date(dateRange.to), "MMM dd, yyyy")}</span>
                </span>
              ) : (
                <span>Showing all available data (no date filter applied)</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overview Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-0 pb-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOutgoingMessages.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats.growth.messageGrowthPercent >= 0 ? (
                  <span className="text-green-600 flex items-center">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +{stats.growth.messageGrowthPercent.toFixed(1)}% from last month
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center">
                    <TrendingDown className="h-3 w-3 mr-1" />
                    {stats.growth.messageGrowthPercent.toFixed(1)}% from last month
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost (ZAR)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalCostCents)}</div>
              <p className="text-xs text-muted-foreground">
                {formatUsdCurrency(stats.totalCostCents)} USD
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.currentMonthCostCents)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.growth.costGrowthPercent >= 0 ? (
                  <span className="text-green-600 flex items-center">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    +{stats.growth.costGrowthPercent.toFixed(1)}% from last month
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center">
                    <TrendingDown className="h-3 w-3 mr-1" />
                    {stats.growth.costGrowthPercent.toFixed(1)}% from last month
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Daily Cost</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.avgDailyCostCents)}</div>
              <p className="text-xs text-muted-foreground">
                Last 7 days average
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Cost Trends</TabsTrigger>
          <TabsTrigger value="users">User Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {overviewLoading ? (
            <Card>
              <CardContent className="p-12">
                <div className="flex flex-col items-center justify-center gap-4">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading overview data...</p>
                </div>
              </CardContent>
            </Card>
          ) : overviewError ? (
            <Card className="border-destructive">
              <CardContent className="p-12">
                <div className="flex flex-col items-center justify-center gap-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-destructive">Failed to load overview data</p>
                  <Button variant="outline" size="sm" onClick={() => refetchOverview()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : overview ? (
            <CostOverview data={overview} />
          ) : null}
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Cost Trends</CardTitle>
                  <CardDescription className="mt-1">
                    Analyze messaging costs and volume over time
                  </CardDescription>
                </div>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="60">Last 60 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
          </Card>
          {trendsError ? (
            <Card className="border-destructive">
              <CardContent className="p-12">
                <div className="flex flex-col items-center justify-center gap-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-destructive">Failed to load trends data</p>
                  <Button variant="outline" size="sm" onClick={() => refetchTrends()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : trends ? (
            <CostTrends data={trends} loading={trendsLoading} />
          ) : null}
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UserCostBreakdown dateRange={queryDateRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}