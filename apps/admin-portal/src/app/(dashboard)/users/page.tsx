"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
  Search,
  Download,
  MoreHorizontal,
  Pause,
  Ban,
  RefreshCw,
  Trash,
  DollarSign,
  Shield,
  ShieldOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@imaginecalendar/ui/dropdown-menu";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { format } from "date-fns";
import { DeleteUserModal } from "@/components/users/delete-user-modal";
import { PauseSubscriptionModal } from "@/components/users/pause-subscription-modal";
import { CancelSubscriptionModal } from "@/components/users/cancel-subscription-modal";
import { RefundModal } from "@/components/users/refund-modal";
import { ToggleAdminModal } from "@/components/users/toggle-admin-modal";

export default function UsersPage() {
  const { toast } = useToast();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);

  // Modal states
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [toggleAdminModalOpen, setToggleAdminModalOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [planFilter, statusFilter]);

  // Fetch users with server-side filtering
  const { data, isLoading, error, refetch } = useQuery({
    ...trpc.admin.getUsers.queryOptions({
      search: debouncedSearch || undefined,
      page: currentPage,
      limit: 50,
      filters: {
        plan: planFilter as any,
        status: statusFilter as any,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const handleExportUsers = async () => {
    try {
      const exportData = await queryClient.fetchQuery(
        trpc.admin.exportUsers.queryOptions({
          filters: {
            search: debouncedSearch || undefined,
            plan: planFilter as any,
            status: statusFilter as any,
          },
        })
      );

      const csv = convertToCSV(exportData);
      downloadCSV(csv, "users-export.csv");

      toast({
        title: "Export successful",
        description: `Exported ${exportData.length} users`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export users data",
        variant: "destructive",
      });
    }
  };

  const convertToCSV = (data: any[]) => {
    if (data.length === 0) return "";

    const headers = [
      "ID",
      "Email",
      "Name",
      "Phone",
      "Company",
      "Plan",
      "Status",
      "Created At",
      "Current Period End",
      "Total Spent",
      "Last Payment",
    ];

    const rows = data.map(user => [
      user.id,
      user.email,
      user.name,
      user.phone,
      user.company,
      user.plan,
      user.subscriptionStatus,
      format(new Date(user.createdAt), "yyyy-MM-dd HH:mm:ss"),
      user.currentPeriodEnd ? format(new Date(user.currentPeriodEnd), "yyyy-MM-dd") : "",
      (user.totalSpent / 100).toFixed(2), // Convert cents to currency
      user.lastPaymentDate ? format(new Date(user.lastPaymentDate), "yyyy-MM-dd") : "",
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(","))
      .join("\n");
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleModalSuccess = () => {
    refetch();
  };

  const openDeleteModal = (user: any) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  const openPauseModal = (user: any) => {
    setSelectedUser(user);
    setPauseModalOpen(true);
  };

  const openCancelModal = (user: any) => {
    setSelectedUser(user);
    setCancelModalOpen(true);
  };

  const openRefundModal = (user: any) => {
    setSelectedUser(user);
    setRefundModalOpen(true);
  };

  const openToggleAdminModal = (user: any) => {
    setSelectedUser(user);
    setToggleAdminModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      trial: "secondary",
      cancelled: "destructive",
      expired: "destructive",
      past_due: "destructive",
      paused: "outline",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Users</h1>
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

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Users</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load users</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Users</h1>
        <Button onClick={handleExportUsers} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2">
              <Select 
                value={planFilter || "all"} 
                onValueChange={(val) => setPlanFilter(val === "all" ? undefined : val)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Plans" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={statusFilter || "all"} 
                onValueChange={(val) => setStatusFilter(val === "all" ? undefined : val)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Period End</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.users || data.users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  data.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{user.name || "Unknown"}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                        {user.phone && (
                          <div className="text-sm text-muted-foreground">{user.phone}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(user.plan || "trial")}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(user.subscriptionStatus || "active")}
                    </TableCell>
                    <TableCell>
                      {user.isAdmin ? (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          <Shield className="mr-1 h-3 w-3" />
                          Admin
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">User</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(user.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>
                          {user.currentPeriodEnd
                            ? format(new Date(user.currentPeriodEnd), "MMM d, yyyy")
                            : "—"}
                        </div>
                        {user.cancelAtPeriodEnd && user.currentPeriodEnd && (
                          <div className="text-xs text-orange-600 font-medium">
                            Cancels on this date
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openRefundModal(user)}>
                            <DollarSign className="mr-2 h-4 w-4" />
                            Process Refund
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openToggleAdminModal(user)}>
                            {user.isAdmin ? (
                              <>
                                <ShieldOff className="mr-2 h-4 w-4" />
                                Remove Admin Access
                              </>
                            ) : (
                              <>
                                <Shield className="mr-2 h-4 w-4" />
                                Grant Admin Access
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openPauseModal(user)}>
                            <Pause className="mr-2 h-4 w-4" />
                            Pause Subscription
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openCancelModal(user)}>
                            <Ban className="mr-2 h-4 w-4" />
                            Cancel Subscription
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => openDeleteModal(user)}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  ))
                )}
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

      {/* Modals */}
      {selectedUser && (
        <>
          <DeleteUserModal
            open={deleteModalOpen}
            onOpenChange={setDeleteModalOpen}
            user={selectedUser}
            onSuccess={handleModalSuccess}
          />
          <PauseSubscriptionModal
            open={pauseModalOpen}
            onOpenChange={setPauseModalOpen}
            user={selectedUser}
            onSuccess={handleModalSuccess}
          />
          <CancelSubscriptionModal
            open={cancelModalOpen}
            onOpenChange={setCancelModalOpen}
            user={selectedUser}
            onSuccess={handleModalSuccess}
          />
          <RefundModal
            open={refundModalOpen}
            onOpenChange={setRefundModalOpen}
            user={selectedUser}
            onSuccess={handleModalSuccess}
          />
          <ToggleAdminModal
            open={toggleAdminModalOpen}
            onOpenChange={setToggleAdminModalOpen}
            user={selectedUser}
            onSuccess={handleModalSuccess}
          />
        </>
      )}
    </div>
  );
}