/**
 * Timezone utility functions for normalizing timestamps to local time
 * without external dependencies using Intl.DateTimeFormat
 */

/**
 * Formats a date to local ISO string in the specified timezone
 * Output format: YYYY-MM-DDTHH:mm:ss.000Z (local time with Z suffix)
 * 
 * Important: The Z suffix is intentional to keep existing schemas happy,
 * but the time represents the LOCAL time in the specified timezone,
 * not UTC time.
 * 
 * @param date - Date object or ISO string to convert
 * @param timeZone - IANA timezone identifier (e.g., 'Africa/Johannesburg')
 * @returns ISO-formatted string with local time and Z suffix
 */
export function formatDateToLocalIso(
  date: Date | string,
  timeZone: string
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  // Use Intl.DateTimeFormat to get date parts in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(dateObj);
  const partsMap: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      partsMap[part.type] = part.value;
    }
  }

  // Construct ISO string: YYYY-MM-DDTHH:mm:ss.000Z
  const year = partsMap.year;
  const month = partsMap.month;
  const day = partsMap.day;
  const hour = partsMap.hour;
  const minute = partsMap.minute;
  const second = partsMap.second;

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

/**
 * Safe wrapper for formatDateToLocalIso that handles null/undefined inputs
 * 
 * @param date - Date object, ISO string, null, or undefined
 * @param timeZone - IANA timezone identifier
 * @returns ISO-formatted string with local time, or null if input is null/undefined
 */
export function tryFormatDateToLocalIso(
  date: Date | string | null | undefined,
  timeZone: string
): string | null {
  if (date === null || date === undefined) {
    return null;
  }

  try {
    return formatDateToLocalIso(date, timeZone);
  } catch {
    return null;
  }
}

export function formatDateToLocalLabel(
  date: Date | string,
  timeZone: string
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(dateObj);
  const partsMap: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      partsMap[part.type] = part.value;
    }
  }

  return `${partsMap.year}-${partsMap.month}-${partsMap.day} ${partsMap.hour}:${partsMap.minute}`;
}
