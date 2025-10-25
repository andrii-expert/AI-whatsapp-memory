"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Progress } from "@imaginecalendar/ui/progress";
import { Badge } from "@imaginecalendar/ui/badge";
import {
  MessageSquare,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { format } from "date-fns";

interface CostOverviewProps {
  data: {
    totalOutgoingMessages: number;
    totalCostCents: number;
    currentMonthMessages: number;
    currentMonthCostCents: number;
    lastMonthMessages: number;
    lastMonthCostCents: number;
    todayMessages: number;
    todayCostCents: number;
    costPerMessageCents: number;
    usdToZarRate: number;
  };
}

export function CostOverview({ data }: CostOverviewProps) {
  const formatCurrency = (cents: number) => {
    const zarAmount = (cents / 100) * data.usdToZarRate;
    return `R${zarAmount.toFixed(2)}`;
  };

  const formatUsdCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(4)}`;
  };

  // Calculate growth percentages
  const messageGrowth = data.lastMonthMessages > 0
    ? ((data.currentMonthMessages - data.lastMonthMessages) / data.lastMonthMessages) * 100
    : 0;

  const costGrowth = data.lastMonthCostCents > 0
    ? ((data.currentMonthCostCents - data.lastMonthCostCents) / data.lastMonthCostCents) * 100
    : 0;

  // Calculate daily average for current month
  const currentDate = new Date();
  const daysInMonth = currentDate.getDate();
  const avgDailyMessages = data.currentMonthMessages / daysInMonth;
  const avgDailyCost = data.currentMonthCostCents / daysInMonth;

  // Calculate progress towards monthly projections
  const projectedMonthlyMessages = avgDailyMessages * new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const projectedMonthlyCost = avgDailyCost * new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

  const messageProgress = data.lastMonthMessages > 0 ? (data.currentMonthMessages / data.lastMonthMessages) * 100 : 100;
  const costProgress = data.lastMonthCostCents > 0 ? (data.currentMonthCostCents / data.lastMonthCostCents) * 100 : 100;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalOutgoingMessages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Since cost tracking began
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalCostCents)}</div>
            <p className="text-xs text-muted-foreground">
              {formatUsdCurrency(data.totalCostCents)} USD
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.todayMessages}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(data.todayCostCents)} cost
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Per Message</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUsdCurrency(data.costPerMessageCents)}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(data.costPerMessageCents)} ZAR
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Comparison */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>This Month vs Last Month</span>
            </CardTitle>
            <CardDescription>
              Messages sent and costs comparison
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Messages</span>
                <div className="flex items-center space-x-2">
                  {messageGrowth >= 0 ? (
                    <ArrowUpRight className="h-4 w-4 text-green-600" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-red-600" />
                  )}
                  <Badge variant={messageGrowth >= 0 ? "default" : "destructive"}>
                    {messageGrowth >= 0 ? '+' : ''}{messageGrowth.toFixed(1)}%
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span>This month: {data.currentMonthMessages.toLocaleString()}</span>
                <span>Last month: {data.lastMonthMessages.toLocaleString()}</span>
              </div>
              <Progress value={Math.min(messageProgress, 100)} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Cost</span>
                <div className="flex items-center space-x-2">
                  {costGrowth >= 0 ? (
                    <ArrowUpRight className="h-4 w-4 text-green-600" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-red-600" />
                  )}
                  <Badge variant={costGrowth >= 0 ? "default" : "destructive"}>
                    {costGrowth >= 0 ? '+' : ''}{costGrowth.toFixed(1)}%
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span>This month: {formatCurrency(data.currentMonthCostCents)}</span>
                <span>Last month: {formatCurrency(data.lastMonthCostCents)}</span>
              </div>
              <Progress value={Math.min(costProgress, 100)} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Monthly Projections</span>
            </CardTitle>
            <CardDescription>
              Based on current daily averages (Day {daysInMonth} of month)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Projected Messages</span>
                <span className="text-sm font-semibold">
                  {Math.round(projectedMonthlyMessages).toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Daily average: {avgDailyMessages.toFixed(1)} messages
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Projected Cost</span>
                <span className="text-sm font-semibold">
                  {formatCurrency(Math.round(projectedMonthlyCost))}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Daily average: {formatCurrency(avgDailyCost)} ({formatUsdCurrency(avgDailyCost)})
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Exchange Rate</span>
                <span className="text-sm">
                  1 USD = {data.usdToZarRate.toFixed(2)} ZAR
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key Metrics Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Key Performance Indicators</CardTitle>
          <CardDescription>
            WhatsApp messaging cost efficiency metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {data.totalOutgoingMessages > 0 ? ((data.totalCostCents / data.totalOutgoingMessages) * data.usdToZarRate / 100).toFixed(4) : '0.0000'}
              </div>
              <div className="text-sm text-muted-foreground">ZAR per Message</div>
            </div>

            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {avgDailyMessages.toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground">Avg Messages/Day</div>
            </div>

            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {formatCurrency(avgDailyCost)}
              </div>
              <div className="text-sm text-muted-foreground">Avg Cost/Day</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}