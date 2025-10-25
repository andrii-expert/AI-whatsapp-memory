"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@imaginecalendar/ui/table";
import { Badge } from "@imaginecalendar/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@imaginecalendar/ui/dialog";
import {
  Search,
  Eye,
  RefreshCw,
  Users,
  MessageSquare,
  DollarSign,
  Calendar,
  ArrowUpDown,
} from "lucide-react";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { format } from "date-fns";

export function UserCostBreakdown() {
  const { toast } = useToast();
  const trpc = useTRPC();

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"totalCost" | "messageCount" | "lastMessage">("totalCost");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Fetch user costs
  const { data, isLoading, error, refetch } = useQuery(
    trpc.whatsappAnalytics.getUserCosts.queryOptions({
      page: currentPage,
      limit: 25,
      search: searchTerm || undefined,
      sortBy,
      sortOrder,
    })
  );

  // Fetch user details when modal is opened
  const { data: userDetails, isLoading: detailsLoading } = useQuery({
    ...trpc.whatsappAnalytics.getUserCostDetails.queryOptions({
      userId: selectedUserId || "",
    }),
    enabled: !!selectedUserId && detailsModalOpen,
  });

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleSort = (field: "totalCost" | "messageCount" | "lastMessage") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const openUserDetails = (userId: string) => {
    setSelectedUserId(userId);
    setDetailsModalOpen(true);
  };

  const formatCurrency = (cents: number) => {
    const zarAmount = (cents / 100) * 18.5; // Using approximate rate
    return `R${zarAmount.toFixed(2)}`;
  };

  const formatUsdCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(4)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
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

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load user cost data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>User WhatsApp Cost Breakdown</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters and Search */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={(value) => handleSort(value as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="totalCost">Total Cost</SelectItem>
                  <SelectItem value="messageCount">Message Count</SelectItem>
                  <SelectItem value="lastMessage">Last Message</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                <ArrowUpDown className="h-4 w-4" />
                {sortOrder === "asc" ? "Asc" : "Desc"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("messageCount")}
                  >
                    <div className="flex items-center space-x-1">
                      <MessageSquare className="h-4 w-4" />
                      <span>Messages</span>
                      {sortBy === "messageCount" && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("totalCost")}
                  >
                    <div className="flex items-center space-x-1">
                      <DollarSign className="h-4 w-4" />
                      <span>Total Cost</span>
                      {sortBy === "totalCost" && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>This Month</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("lastMessage")}
                  >
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span>Last Message</span>
                      {sortBy === "lastMessage" && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.users.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{user.userName || "Unknown"}</div>
                        <div className="text-sm text-muted-foreground">{user.userEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {user.phoneNumber}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{user.outgoingMessageCount.toLocaleString()}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{formatCurrency(user.totalCostCents)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatUsdCurrency(user.totalCostCents)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{formatCurrency(user.currentMonthCostCents)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatUsdCurrency(user.currentMonthCostCents)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.lastOutgoingMessageAt ? (
                        <div className="text-sm">
                          {format(new Date(user.lastOutgoingMessageAt), "MMM dd, yyyy")}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openUserDetails(user.userId)}
                      >
                        <Eye className="h-4 w-4" />
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data?.pagination && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to{" "}
                {Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalCount)} of{" "}
                {data.pagination.totalCount} users
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={!data.pagination.hasPreviousPage}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={!data.pagination.hasNextPage}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Details Modal */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>User Cost Details</span>
            </DialogTitle>
            <DialogDescription>
              Detailed WhatsApp messaging costs and history
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : userDetails ? (
            <div className="space-y-6">
              {/* User Info */}
              <Card>
                <CardHeader>
                  <CardTitle>User Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Name</label>
                      <p className="font-medium">{userDetails.user.name || "Unknown"}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="font-medium">{userDetails.user.email}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Phone</label>
                      <p className="font-medium">{userDetails.phoneNumber}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Cost Tracking Since</label>
                      <p className="font-medium">
                        {format(new Date(userDetails.totalStats.costTrackingStartAt), "MMM dd, yyyy")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cost Summary */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Total Messages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{userDetails.totalStats.outgoingMessageCount.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Total Cost</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{formatCurrency(userDetails.totalStats.totalCostCents)}</div>
                    <p className="text-sm text-muted-foreground">
                      {formatUsdCurrency(userDetails.totalStats.totalCostCents)} USD
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">This Month</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{formatCurrency(userDetails.totalStats.currentMonthCostCents)}</div>
                    <p className="text-sm text-muted-foreground">
                      {formatUsdCurrency(userDetails.totalStats.currentMonthCostCents)} USD
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Breakdown */}
              {userDetails.monthlyBreakdown.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {userDetails.monthlyBreakdown.reverse().map((month) => (
                        <div key={month.month} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div>
                            <span className="font-medium">
                              {format(new Date(month.month + "-01"), "MMMM yyyy")}
                            </span>
                          </div>
                          <div className="text-right space-y-1">
                            <div className="font-medium">{formatCurrency(month.costCents)}</div>
                            <div className="text-xs text-muted-foreground">
                              {month.messageCount} messages
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">User details not found</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}