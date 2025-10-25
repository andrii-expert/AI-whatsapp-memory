"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Badge } from "@imaginecalendar/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart,
} from "recharts";
import { format, parseISO } from "date-fns";
import { TrendingUp, TrendingDown, BarChart3, Activity } from "lucide-react";

interface CostTrendsProps {
  data: Array<{
    date: string;
    messageCount: number;
    costCents: number;
  }>;
  loading?: boolean;
}

export function CostTrends({ data, loading }: CostTrendsProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center h-64 space-y-2">
              <BarChart3 className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No cost trend data available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare data for charts with formatted dates and ZAR conversion
  const chartData = data.map(item => ({
    ...item,
    formattedDate: format(parseISO(item.date), "MMM dd"),
    fullDate: format(parseISO(item.date), "MMMM dd, yyyy"),
    costZar: (item.costCents / 100) * 18.5, // Convert to ZAR (using approximate rate)
    costUsd: item.costCents / 100, // Convert to USD
  }));

  // Calculate trend statistics
  const totalMessages = data.reduce((sum, item) => sum + item.messageCount, 0);
  const totalCostCents = data.reduce((sum, item) => sum + item.costCents, 0);
  const avgDailyMessages = totalMessages / data.length;
  const avgDailyCost = totalCostCents / data.length;

  // Calculate trend direction (compare first half vs second half)
  const midPoint = Math.floor(data.length / 2);
  const firstHalfAvg = data.slice(0, midPoint).reduce((sum, item) => sum + item.costCents, 0) / midPoint;
  const secondHalfAvg = data.slice(midPoint).reduce((sum, item) => sum + item.costCents, 0) / (data.length - midPoint);
  const trendDirection = secondHalfAvg > firstHalfAvg ? 'up' : 'down';
  const trendPercentage = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.fullDate}</p>
          <div className="space-y-1 text-sm">
            <p className="text-blue-600">
              Messages: {data.messageCount}
            </p>
            <p className="text-green-600">
              Cost: R{data.costZar.toFixed(2)} (${data.costUsd.toFixed(4)})
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Trend Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Period Total</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMessages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">messages sent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Period Cost</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R{((totalCostCents / 100) * 18.5).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">${(totalCostCents / 100).toFixed(4)} USD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDailyMessages.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">messages per day</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trend</CardTitle>
            {trendDirection === 'up' ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Badge variant={trendDirection === 'up' ? "default" : "destructive"}>
                {trendDirection === 'up' ? '+' : ''}{trendPercentage.toFixed(1)}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">vs previous period</p>
          </CardContent>
        </Card>
      </div>

      {/* Message Count Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Daily Message Volume</span>
          </CardTitle>
          <CardDescription>
            Number of outgoing WhatsApp messages sent per day
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="formattedDate"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="messageCount" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Cost Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Daily Cost Trend</span>
          </CardTitle>
          <CardDescription>
            WhatsApp messaging costs in ZAR over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="formattedDate"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="costZar"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Combined Messages & Cost Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Messages vs Cost Correlation</span>
          </CardTitle>
          <CardDescription>
            Daily message volume and corresponding costs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="formattedDate"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  yAxisId="messages"
                  orientation="left"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  yAxisId="messages"
                  type="monotone"
                  dataKey="messageCount"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Messages"
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="costZar"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Cost (ZAR)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}