"use client";

import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@imaginecalendar/ui/dialog";
import { Badge } from "@imaginecalendar/ui/badge";
import { Card, CardContent } from "@imaginecalendar/ui/card";
import { 
  User, 
  Mail, 
  Phone, 
  Building2, 
  Calendar, 
  CreditCard,
  Shield,
  Info,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Crown,
  Globe,
  Users,
  Cake,
  Target,
  Megaphone,
  UserCircle,
} from "lucide-react";
import { cn } from "@imaginecalendar/ui/cn";

interface UserDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    email: string;
    name?: string | null;
    phone?: string | null;
    company?: string | null;
    createdAt: string | Date;
    isAdmin: boolean;
    // Onboarding/Profile fields
    country?: string | null;
    ageGroup?: string | null;
    gender?: string | null;
    birthday?: string | Date | null;
    mainUse?: string | null;
    howHeardAboutUs?: string | null;
    // Subscription fields
    plan?: string | null;
    subscriptionStatus?: string | null;
    currentPeriodEnd?: string | Date | null;
    cancelAtPeriodEnd?: boolean;
    cancelledAt?: string | Date | null;
  };
}

export function UserDetailsModal({
  open,
  onOpenChange,
  user,
}: UserDetailsModalProps) {
  const getStatusConfig = (status: string) => {
    const configs = {
      active: { 
        label: "Active", 
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: CheckCircle2,
        iconColor: "text-emerald-500"
      },
      trial: { 
        label: "Trial", 
        className: "bg-blue-50 text-blue-700 border-blue-200",
        icon: Info,
        iconColor: "text-blue-500"
      },
      monthly: { 
        label: "Monthly Plan", 
        className: "bg-purple-50 text-purple-700 border-purple-200",
        icon: CreditCard,
        iconColor: "text-purple-500"
      },
      annual: { 
        label: "Annual Plan", 
        className: "bg-indigo-50 text-indigo-700 border-indigo-200",
        icon: Crown,
        iconColor: "text-indigo-500"
      },
      cancelled: { 
        label: "Cancelled", 
        className: "bg-red-50 text-red-700 border-red-200",
        icon: XCircle,
        iconColor: "text-red-500"
      },
      expired: { 
        label: "Expired", 
        className: "bg-gray-50 text-gray-700 border-gray-200",
        icon: AlertCircle,
        iconColor: "text-gray-500"
      },
      past_due: { 
        label: "Past Due", 
        className: "bg-orange-50 text-orange-700 border-orange-200",
        icon: AlertCircle,
        iconColor: "text-orange-500"
      },
      paused: { 
        label: "Paused", 
        className: "bg-yellow-50 text-yellow-700 border-yellow-200",
        icon: Clock,
        iconColor: "text-yellow-500"
      },
    };

    return configs[status as keyof typeof configs] || configs.active;
  };

  const planConfig = getStatusConfig(user.plan || "trial");
  const statusConfig = getStatusConfig(user.subscriptionStatus || "active");

  // Helper functions for formatting profile data
  const formatGender = (gender: string | null | undefined) => {
    if (!gender) return null;
    const genderMap: Record<string, string> = {
      male: "Male",
      female: "Female",
      other: "Other",
      prefer_not_to_say: "Prefer not to say",
    };
    return genderMap[gender] || gender;
  };

  const formatAgeGroup = (ageGroup: string | null | undefined) => {
    if (!ageGroup) return null;
    // Age groups are already formatted like "18-25", "26-35", etc.
    if (ageGroup === "46 and over") return "46+ years";
    return `${ageGroup} years`;
  };

  const formatCountry = (country: string | null | undefined) => {
    if (!country) return null;
    
    // Country codes mapping (ISO 3166-1 alpha-2)
    const countryMap: Record<string, string> = {
      ZA: "South Africa",
      US: "United States",
      GB: "United Kingdom",
      CA: "Canada",
      AU: "Australia",
      NZ: "New Zealand",
      IE: "Ireland",
      IN: "India",
      PK: "Pakistan",
      NG: "Nigeria",
      KE: "Kenya",
      GH: "Ghana",
      ZW: "Zimbabwe",
      BW: "Botswana",
      NA: "Namibia",
      DE: "Germany",
      FR: "France",
      IT: "Italy",
      ES: "Spain",
      NL: "Netherlands",
      BE: "Belgium",
      SE: "Sweden",
      NO: "Norway",
      DK: "Denmark",
      FI: "Finland",
      PT: "Portugal",
      CH: "Switzerland",
      AT: "Austria",
      BR: "Brazil",
      MX: "Mexico",
      AR: "Argentina",
      CL: "Chile",
      CO: "Colombia",
      CN: "China",
      JP: "Japan",
      KR: "South Korea",
      SG: "Singapore",
      MY: "Malaysia",
      TH: "Thailand",
      PH: "Philippines",
      ID: "Indonesia",
      VN: "Vietnam",
      AE: "United Arab Emirates",
      SA: "Saudi Arabia",
      IL: "Israel",
      EG: "Egypt",
      RU: "Russia",
      TR: "Turkey",
    };
    
    const upperCountry = country.toUpperCase();
    return countryMap[upperCountry] || country;
  };

  // Check if user has any profile information
  const hasProfileInfo = user.country || user.ageGroup || user.gender || user.birthday || user.mainUse || user.howHeardAboutUs;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {user.name || "Unknown User"}
                {user.isAdmin && (
                  <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-0">
                    <Shield className="mr-1 h-3 w-3" />
                    Admin
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-sm font-normal mt-1">
                Member since {format(new Date(user.createdAt), "MMMM d, yyyy")}
              </DialogDescription>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Status Overview Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Plan Card */}
            <Card className="border-2 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", 
                      planConfig.className.replace('bg-', 'bg-').replace('-50', '-100'))}>
                      <planConfig.icon className={cn("h-4 w-4", planConfig.iconColor)} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Current Plan</p>
                    </div>
                  </div>
                </div>
                <p className="text-lg font-bold text-foreground">{planConfig.label}</p>
              </CardContent>
            </Card>

            {/* Status Card */}
            <Card className="border-2 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", 
                      statusConfig.className.replace('bg-', 'bg-').replace('-50', '-100'))}>
                      <statusConfig.icon className={cn("h-4 w-4", statusConfig.iconColor)} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Status</p>
                    </div>
                  </div>
                </div>
                <p className="text-lg font-bold text-foreground">{statusConfig.label}</p>
              </CardContent>
            </Card>
          </div>

          {/* Cancellation Warning */}
          {user.cancelAtPeriodEnd && user.currentPeriodEnd && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-orange-900 mb-1">Subscription Ending</h4>
                    <p className="text-sm text-orange-700">
                      This subscription will be cancelled on{" "}
                      <span className="font-semibold">
                        {format(new Date(user.currentPeriodEnd), "MMMM d, yyyy")}
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contact Information */}
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                Contact Information
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                  <span className="text-sm text-muted-foreground font-medium">Email</span>
                  <span className="text-sm text-foreground break-all">{user.email}</span>
                </div>
                
                {user.phone ? (
                  <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                    <span className="text-sm text-muted-foreground font-medium">Phone</span>
                    <span className="text-sm text-foreground">{user.phone}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                    <span className="text-sm text-muted-foreground font-medium">Phone</span>
                    <span className="text-sm text-muted-foreground italic">Not provided</span>
                  </div>
                )}

                {user.company ? (
                  <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                    <span className="text-sm text-muted-foreground font-medium">Company</span>
                    <span className="text-sm text-foreground">{user.company}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                    <span className="text-sm text-muted-foreground font-medium">Company</span>
                    <span className="text-sm text-muted-foreground italic">Not provided</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Profile Information */}
          {hasProfileInfo && (
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <UserCircle className="h-4 w-4 text-primary" />
                  Profile Information
                </h3>
                <div className="space-y-4">
                  {user.country && (
                    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                      <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" />
                        Country
                      </span>
                      <span className="text-sm text-foreground">{formatCountry(user.country)}</span>
                    </div>
                  )}

                  {user.ageGroup && (
                    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                      <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Age Group
                      </span>
                      <span className="text-sm text-foreground">{formatAgeGroup(user.ageGroup)}</span>
                    </div>
                  )}

                  {user.gender && (
                    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                      <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        Gender
                      </span>
                      <span className="text-sm text-foreground">{formatGender(user.gender)}</span>
                    </div>
                  )}

                  {user.birthday && (
                    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                      <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                        <Cake className="h-3.5 w-3.5" />
                        Birthday
                      </span>
                      <span className="text-sm text-foreground">
                        {format(new Date(user.birthday), "MMMM d, yyyy")}
                      </span>
                    </div>
                  )}

                  {user.mainUse && (
                    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                      <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5" />
                        Primary Use
                      </span>
                      <span className="text-sm text-foreground">
                        {user.mainUse.split(/[-_]/).map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                        ).join(' ')}
                      </span>
                    </div>
                  )}

                  {user.howHeardAboutUs && (
                    <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                      <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                        <Megaphone className="h-3.5 w-3.5" />
                        Referral Source
                      </span>
                      <span className="text-sm text-foreground">
                        {user.howHeardAboutUs.split(/[-_]/).map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                        ).join(' ')}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Subscription Details */}
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Subscription Details
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                  <span className="text-sm text-muted-foreground font-medium">Account Type</span>
                  <div>
                    {user.isAdmin ? (
                      <Badge className="bg-blue-500 hover:bg-blue-600 text-white">
                        <Shield className="mr-1 h-3 w-3" />
                        Administrator
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Regular User
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                  <span className="text-sm text-muted-foreground font-medium">Joined</span>
                  <div>
                    <span className="text-sm text-foreground">
                      {format(new Date(user.createdAt), "MMMM d, yyyy")}
                    </span>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      {format(new Date(user.createdAt), "h:mm a")}
                    </span>
                  </div>
                </div>

                {user.currentPeriodEnd && (
                  <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                    <span className="text-sm text-muted-foreground font-medium">
                      {user.cancelAtPeriodEnd ? "Expires" : "Next Billing"}
                    </span>
                    <div>
                      <span className="text-sm text-foreground">
                        {format(new Date(user.currentPeriodEnd), "MMMM d, yyyy")}
                      </span>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        {format(new Date(user.currentPeriodEnd), "h:mm a")}
                      </span>
                    </div>
                  </div>
                )}

                {user.cancelledAt && (
                  <div className="grid grid-cols-[150px_1fr] items-start gap-3">
                    <span className="text-sm text-muted-foreground font-medium">Cancelled</span>
                    <div>
                      <span className="text-sm text-red-600 font-medium">
                        {format(new Date(user.cancelledAt), "MMMM d, yyyy")}
                      </span>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        {format(new Date(user.cancelledAt), "h:mm a")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* User ID */}
          <Card className="border shadow-sm bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium mb-1.5">User ID</p>
                  <p className="text-xs font-mono bg-background px-3 py-2 rounded border break-all">
                    {user.id}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
