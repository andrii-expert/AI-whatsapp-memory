"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
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
import {
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  DollarSign,
  Calendar,
  Users,
} from "lucide-react";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { format } from "date-fns";
import { CostOverview } from "@/components/analytics/cost-overview";
import { CostTrends } from "@/components/analytics/cost-trends";
import { UserCostBreakdown } from "@/components/analytics/user-cost-breakdown";

export default function AnalyticsPage() {
  const { toast } = useToast();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [selectedPeriod, setSelectedPeriod] = useState("30");
  const [dateRange, setDateRange] = useState({
    from: "",
    to: "",
  });

  // Prepare date range for queries
  const queryDateRange = dateRange.from && dateRange.to
    ? {
        from: new Date(dateRange.from).toISOString(),
        to: new Date(dateRange.to).toISOString(),
      }
    : undefined;

  // Fetch cost overview
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery(
    trpc.whatsappAnalytics.getCostOverview.queryOptions(queryDateRange || {})
  );

  // Fetch cost statistics for dashboard widgets
  const { data: stats, isLoading: statsLoading } = useQuery(
    trpc.whatsappAnalytics.getCostStats.queryOptions(queryDateRange || {})
  );

  // Fetch cost trends
  const { data: trends, isLoading: trendsLoading } = useQuery(
    trpc.whatsappAnalytics.getCostTrends.queryOptions({
      days: parseInt(selectedPeriod),
      ...queryDateRange,
    })
  );

  const handleExport = async () => {
    try {
      let exportParams: { from?: string; to?: string } = {};

      if (dateRange.from && dateRange.to) {
        exportParams = {
          from: new Date(dateRange.from).toISOString(),
          to: new Date(dateRange.to).toISOString(),
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

  if (overviewLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">WhatsApp Analytics</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-center">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">WhatsApp Analytics</h1>
        <div className="flex items-center space-x-4">
          <Button
            onClick={() => {
              refetchOverview();
            }}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={handleExport} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Date Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div>
              <label className="text-sm font-medium">From Date</label>
              <Input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">To Date</label>
              <Input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => setDateRange({ from: "", to: "" })}
                variant="outline"
                size="sm"
                className="mt-6"
              >
                Clear Filters
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {dateRange.from && dateRange.to
              ? "Showing filtered data for selected date range"
              : "Showing all data (no date filter applied)"}
          </p>
        </CardContent>
      </Card>

      {/* Overview Cards */}
      {stats && (
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
      )}

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Cost Trends</TabsTrigger>
          <TabsTrigger value="users">User Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {overview && <CostOverview data={overview} />}
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <div className="flex items-center space-x-4 mb-6">
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
          {trends && <CostTrends data={trends} loading={trendsLoading} />}
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UserCostBreakdown />
        </TabsContent>
      </Tabs>
    </div>
  );
}