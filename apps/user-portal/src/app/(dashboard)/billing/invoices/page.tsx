"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@imaginecalendar/ui/table";
import { Badge } from "@imaginecalendar/ui/badge";
import { useToast } from "@imaginecalendar/ui/use-toast";
import { Download, FileText, Loader2, Receipt, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { format } from "date-fns";

export default function InvoicesPage() {
  const trpc = useTRPC();
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  
  // Fetch invoices
  const { data, isLoading, error } = useQuery(
    trpc.invoices.list.queryOptions({
      page,
      limit: 10,
    })
  );
  
  // Fetch stats
  const { data: stats } = useQuery(
    trpc.invoices.stats.queryOptions()
  );

  const handleDownload = async (invoiceId: string, invoiceNumber: string) => {
    try {
      setDownloadingId(invoiceId);
      
      // Open PDF download URL in new tab
      const url = `/api/download/invoice?id=${invoiceId}`;
      window.open(url, '_blank');
      
      toast({
        title: "Download started",
        description: `Invoice ${invoiceNumber} is being downloaded.`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download invoice. Please try again.",
        variant: "error",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePreview = (invoiceId: string) => {
    // Open PDF preview in new tab
    const url = `/api/download/invoice?id=${invoiceId}&preview=true`;
    window.open(url, '_blank');
  };

  const formatCurrency = (amount: number, currency: string) => {
    const symbol = currency === 'ZAR' ? 'R' : 
                   currency === 'USD' ? '$' : 
                   currency === 'EUR' ? '€' : '£';
    return `${symbol}${(amount / 100).toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 border-green-200">Paid</span>;
      case 'pending':
      case 'processing':
        return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800 border-yellow-200">Pending</span>;
      case 'failed':
        return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 border-red-200">Failed</span>;
      case 'refunded':
        return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 border-purple-200">Refunded</span>;
      default:
        return <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">{status}</span>;
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-destructive">
              <p className="text-sm">Failed to load invoices. Please try again later.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 p-4 sm:p-6 shadow-[0_-4px_33px_0_rgba(0,0,0,0.05)] rounded-xl">
          <h1 className="text-xl font-bold text-gray-900">Invoices & Payments</h1>
        </div>

        {/* Invoices Section */}
        <div className="mb-8 px-4 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Invoices</h2>
          
          {/* Stats Cards - 2x2 Grid */}
          {stats && (
            <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard
            number={stats.counts.total.toString()}
            label="Total Invoices"
            iconBg="#F2FBFF"
            borderColor="#ECF7FC"
            blurColor="#C5EEFF"
            icon={<ReceiptIcon />}
          />
          
          <StatCard
            number={stats.counts.completed.toString()}
            label="Paid"
            iconBg="#FFF7F1"
            borderColor="#FCF3EC"
            blurColor="#FFDEC5"
            icon={<CheckCircleIcon />}
          />
          
          <StatCard
            number={stats.counts.pending.toString()}
            label="Pending"
            iconBg="#F2FBFF"
            borderColor="#ECF7FC"
            blurColor="#C5EEFF"
            icon={<ClockIcon />}
          />
          
          <StatCard
            number={formatCurrency(stats.amounts.totalAmount, 'ZAR')}
            label="Total per month"
            iconBg="#FFF7F1"
            borderColor="#FCF3EC"
            blurColor="#FFDEC5"
            icon={<DollarIcon />}
          />
            </div>
          )}
        </div>

        {/* Invoices Table */}
        <div className="px-4 sm:px-6">
          <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
          <CardDescription>
            All your invoices and receipts in one place
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.invoices?.length ? (
            <div className="text-center py-12">
              <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No invoices found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your invoices will appear here once you make a payment
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          {invoice.invoiceNumber}
                        </TableCell>
                        <TableCell>
                          {invoice.createdAt
                            ? format(new Date(invoice.createdAt), "MMM dd, yyyy")
                            : "N/A"}
                        </TableCell>
                        <TableCell>
                          {invoice.description || `${invoice.subscription?.plan || 'Subscription'} Plan`}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(invoice.totalAmount, invoice.currency)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(invoice.status)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePreview(invoice.id)}
                            >
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={downloadingId === invoice.id}
                              onClick={() => handleDownload(invoice.id, invoice.invoiceNumber)}
                            >
                              {downloadingId === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {data.currentPage} of {data.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === data.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}

// StatCard component matching dashboard design
function StatCard({ number, label, iconBg, borderColor, blurColor, icon }: {
  number: string;
  label: string;
  iconBg: string;
  borderColor: string;
  blurColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="relative p-4 rounded-xl border bg-white shadow-[0_2px_16px_0_rgba(0,0,0,0.02)] overflow-hidden"
      style={{ borderColor }}
    >
      <div className="absolute top-0 left-0 w-[55px] h-[55px] rounded-full" style={{ background: blurColor, filter: 'blur(50px)' }} />
      <div className="relative flex items-start">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center justify-between w-full gap-2">
            <div className="text-[32px] font-medium leading-none tracking-[-1.28px] text-black">
              {number}
            </div>
            <div className="w-8 h-8 flex items-center justify-center rounded-[19px]" style={{ background: iconBg }}>
              {icon}
            </div>
          </div>
          <div className="text-[12px] font-normal tracking-[-0.48px] text-[#4C4C4C]">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

// Icon components
function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 2H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2Z" stroke="#4C4C4C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 6H11M5 9H11M5 12H9" stroke="#4C4C4C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <CheckCircle2 className="h-4 w-4 text-[#4C4C4C]" />
  );
}

function ClockIcon() {
  return (
    <Clock className="h-4 w-4 text-[#4C4C4C]" />
  );
}

function DollarIcon() {
  return (
    <DollarSign className="h-4 w-4 text-[#4C4C4C]" />
  );
}