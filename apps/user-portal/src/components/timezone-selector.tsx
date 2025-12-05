"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@imaginecalendar/ui/select";
import { Label } from "@imaginecalendar/ui/label";
import { getTimezoneOptions, getUserTimezone, type TimezoneOption } from "@/lib/timezones";

interface TimezoneSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  error?: boolean;
  label?: string;
  required?: boolean;
  className?: string;
}

export function TimezoneSelector({
  value,
  onValueChange,
  error = false,
  label = "Timezone",
  required = false,
  className,
}: TimezoneSelectorProps) {
  const [isMounted, setIsMounted] = useState(false);
  
  // Only calculate timezones after component mounts (client-side only)
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  const timezoneOptions = useMemo(() => {
    if (!isMounted) return [];
    return getTimezoneOptions();
  }, [isMounted]);
  
  // Group timezones by region for better organization
  const groupedOptions = useMemo(() => {
    const grouped: { [key: string]: TimezoneOption[] } = {};
    
    timezoneOptions.forEach((option) => {
      if (!grouped[option.region]) {
        grouped[option.region] = [];
      }
      grouped[option.region].push(option);
    });
    
    return grouped;
  }, [timezoneOptions]);

  // Get default value if not provided
  const selectedValue = value || (isMounted ? getUserTimezone() : 'Africa/Johannesburg');

  return (
    <div className={className}>
      <Label htmlFor="timezone">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Select value={selectedValue} onValueChange={onValueChange} disabled={!isMounted}>
        <SelectTrigger
          id="timezone"
          className={error ? "border-red-500" : ""}
        >
          <SelectValue placeholder={isMounted ? "Select timezone" : "Loading..."} />
        </SelectTrigger>
        {isMounted && (
          <SelectContent className="max-h-[300px]">
            {Object.keys(groupedOptions).map((region) => (
              <div key={region}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground sticky top-0 bg-background">
                  {region}
                </div>
                {groupedOptions[region].map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        )}
      </Select>
    </div>
  );
}

