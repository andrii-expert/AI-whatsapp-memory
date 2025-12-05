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
 */
function getTimezoneOffset(tz: string): number {
  try {
    const now = new Date();
    
    // Use Intl to get timezone offset
    const dateInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const dateInUtc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    
    // Calculate the difference in milliseconds
    const offsetMs = dateInTz.getTime() - dateInUtc.getTime();
    
    // Convert to hours (accounting for potential day boundary crossing)
    let offsetHours = offsetMs / (1000 * 60 * 60);
    
    // Normalize to -12 to +12 range
    if (offsetHours > 12) {
      offsetHours -= 24;
    } else if (offsetHours < -12) {
      offsetHours += 24;
    }
    
    return offsetHours;
  } catch (error) {
    // Fallback to 0 if calculation fails
    console.warn(`Failed to calculate offset for timezone ${tz}:`, error);
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
 */
export function getTimezoneOptions(): TimezoneOption[] {
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
    timezones[region].forEach((tz) => {
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

