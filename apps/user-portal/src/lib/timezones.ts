/**
 * Comprehensive list of IANA timezone identifiers organized by region
 * Used for timezone selection in onboarding and preferences
 */

export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
  region: string;
}

/**
 * Get timezone offset in hours from UTC
 * Uses Intl.DateTimeFormat for efficient calculation
 */
function getTimezoneOffset(tz: string): number {
  try {
    // Check if we're in a browser environment
    if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) {
      return 0;
    }
    
    const now = new Date();
    
    // Use Intl to get the timezone offset directly
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    });
    
    const parts = formatter.formatToParts(now);
    const offsetString = parts.find(p => p.type === 'timeZoneName')?.value;
    
    if (offsetString) {
      // Parse offset string like "GMT+2" or "GMT-5:30"
      const match = offsetString.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (match && match[1] && match[2]) {
        const sign = match[1] === '+' ? 1 : -1;
        const hours = parseInt(match[2], 10);
        const minutes = match[3] ? parseInt(match[3], 10) : 0;
        return sign * (hours + minutes / 60);
      }
    }
    
    // Fallback: calculate using time difference
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    let offsetHours = offsetMs / (1000 * 60 * 60);
    
    // Normalize to -12 to +12 range
    if (offsetHours > 12) offsetHours -= 24;
    if (offsetHours < -12) offsetHours += 24;
    
    return offsetHours;
  } catch (error) {
    // Return 0 as fallback
    return 0;
  }
}

/**
 * Format timezone offset as GMT+XX:XX
 */
function formatOffset(offsetHours: number): string {
  const sign = offsetHours >= 0 ? '+' : '-';
  const absHours = Math.abs(offsetHours);
  const hours = Math.floor(absHours);
  const minutes = Math.round((absHours - hours) * 60);
  
  if (minutes === 0) {
    return `GMT${sign}${hours.toString().padStart(2, '0')}`;
  }
  return `GMT${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Get all timezone options grouped by region
 * Only executes on client side to avoid build-time memory issues
 */
export function getTimezoneOptions(): TimezoneOption[] {
  // Skip calculation during build/SSR
  if (typeof window === 'undefined') {
    // Return a minimal list during SSR/build
    return [
      { value: 'Africa/Johannesburg', label: 'Johannesburg (GMT+02)', offset: 'GMT+02', region: 'Africa' },
      { value: 'America/New_York', label: 'New York (GMT-05)', offset: 'GMT-05', region: 'America' },
      { value: 'Europe/London', label: 'London (GMT+00)', offset: 'GMT+00', region: 'Europe' },
      { value: 'Asia/Tokyo', label: 'Tokyo (GMT+09)', offset: 'GMT+09', region: 'Asia' },
    ];
  }
  
  const timezones: { [key: string]: string[] } = {
    'Africa': [
      'Africa/Cairo',
      'Africa/Casablanca',
      'Africa/Johannesburg',
      'Africa/Lagos',
      'Africa/Nairobi',
    ],
    'America': [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Toronto',
      'America/Mexico_City',
      'America/Sao_Paulo',
      'America/Buenos_Aires',
      'America/Lima',
      'America/Vancouver',
    ],
    'Asia': [
      'Asia/Dubai',
      'Asia/Karachi',
      'Asia/Kolkata',
      'Asia/Bangkok',
      'Asia/Hong_Kong',
      'Asia/Shanghai',
      'Asia/Tokyo',
      'Asia/Seoul',
      'Asia/Singapore',
      'Asia/Jakarta',
      'Asia/Manila',
      'Asia/Riyadh',
      'Asia/Istanbul',
    ],
    'Australia': [
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Brisbane',
      'Australia/Perth',
      'Australia/Adelaide',
    ],
    'Europe': [
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Madrid',
      'Europe/Amsterdam',
      'Europe/Stockholm',
      'Europe/Zurich',
      'Europe/Vienna',
      'Europe/Warsaw',
      'Europe/Moscow',
      'Europe/Athens',
    ],
    'Pacific': [
      'Pacific/Auckland',
      'Pacific/Honolulu',
      'Pacific/Fiji',
    ],
  };

  const options: TimezoneOption[] = [];

  Object.keys(timezones).forEach((region) => {
    const regionTimezones = timezones[region];
    if (!regionTimezones) return;
    
    regionTimezones.forEach((tz) => {
      try {
        const offsetHours = getTimezoneOffset(tz);
        const offset = formatOffset(offsetHours);
        
        // Format label with city name and offset
        const cityName = tz.split('/')[1]?.replace(/_/g, ' ') || tz;
        const label = `${cityName} (${offset})`;
        
        options.push({
          value: tz,
          label,
          offset,
          region,
        });
      } catch (error) {
        // Skip invalid timezones
        console.warn(`Invalid timezone: ${tz}`, error);
      }
    });
  });

  // Sort by region, then by offset, then by city name
  return options.sort((a, b) => {
    if (a.region !== b.region) {
      return a.region.localeCompare(b.region);
    }
    // Compare offsets numerically
    const offsetA = parseFloat(a.offset.replace('GMT', '').replace(':', '.'));
    const offsetB = parseFloat(b.offset.replace('GMT', '').replace(':', '.'));
    if (offsetA !== offsetB) {
      return offsetA - offsetB;
    }
    return a.label.localeCompare(b.label);
  });
}

/**
 * Get user's current timezone from browser
 */
export function getUserTimezone(): string {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return 'Africa/Johannesburg'; // Default fallback
}

/**
 * Format timezone for display
 */
export function formatTimezone(tz: string): string {
  try {
    const cityName = tz.split('/')[1]?.replace(/_/g, ' ') || tz;
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    const offset = offsetPart?.value || '';
    
    return `${cityName} (${offset})`;
  } catch (error) {
    return tz;
  }
}

