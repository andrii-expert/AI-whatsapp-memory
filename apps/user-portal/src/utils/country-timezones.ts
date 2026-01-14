// Mapping of country codes to their timezones
// Based on IANA timezone database

export const countryTimezones: Record<string, string[]> = {
  ZA: ["Africa/Johannesburg"], // South Africa
  US: [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "Pacific/Honolulu",
  ],
  GB: ["Europe/London"], // United Kingdom
  CA: [
    "America/Toronto",
    "America/Vancouver",
    "America/Edmonton",
    "America/Winnipeg",
    "America/Halifax",
    "America/St_Johns",
  ],
  AU: [
    "Australia/Sydney",
    "Australia/Melbourne",
    "Australia/Brisbane",
    "Australia/Perth",
    "Australia/Adelaide",
    "Australia/Darwin",
    "Australia/Hobart",
  ],
  NZ: ["Pacific/Auckland", "Pacific/Chatham"],
  IN: ["Asia/Kolkata"], // India
  CN: ["Asia/Shanghai"], // China
  JP: ["Asia/Tokyo"], // Japan
  KR: ["Asia/Seoul"], // South Korea
  SG: ["Asia/Singapore"], // Singapore
  MY: ["Asia/Kuala_Lumpur"], // Malaysia
  TH: ["Asia/Bangkok"], // Thailand
  PH: ["Asia/Manila"], // Philippines
  ID: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"], // Indonesia
  VN: ["Asia/Ho_Chi_Minh"], // Vietnam
  AE: ["Asia/Dubai"], // UAE
  SA: ["Asia/Riyadh"], // Saudi Arabia
  IL: ["Asia/Jerusalem"], // Israel
  EG: ["Africa/Cairo"], // Egypt
  RU: [
    "Europe/Moscow",
    "Asia/Yekaterinburg",
    "Asia/Novosibirsk",
    "Asia/Krasnoyarsk",
    "Asia/Irkutsk",
    "Asia/Yakutsk",
    "Asia/Vladivostok",
    "Asia/Magadan",
    "Asia/Kamchatka",
  ],
  TR: ["Europe/Istanbul"], // Turkey
  DE: ["Europe/Berlin"], // Germany
  FR: ["Europe/Paris"], // France
  IT: ["Europe/Rome"], // Italy
  ES: ["Europe/Madrid"], // Spain
  NL: ["Europe/Amsterdam"], // Netherlands
  BE: ["Europe/Brussels"], // Belgium
  SE: ["Europe/Stockholm"], // Sweden
  NO: ["Europe/Oslo"], // Norway
  DK: ["Europe/Copenhagen"], // Denmark
  FI: ["Europe/Helsinki"], // Finland
  PT: ["Europe/Lisbon", "Atlantic/Azores"], // Portugal
  CH: ["Europe/Zurich"], // Switzerland
  AT: ["Europe/Vienna"], // Austria
  BR: [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Fortaleza",
    "America/Recife",
    "America/Belem",
  ],
  MX: [
    "America/Mexico_City",
    "America/Tijuana",
    "America/Mazatlan",
    "America/Merida",
    "America/Monterrey",
  ],
  AR: ["America/Argentina/Buenos_Aires"], // Argentina
  CL: ["America/Santiago"], // Chile
  CO: ["America/Bogota"], // Colombia
  PK: ["Asia/Karachi"], // Pakistan
  NG: ["Africa/Lagos"], // Nigeria
  KE: ["Africa/Nairobi"], // Kenya
  GH: ["Africa/Accra"], // Ghana
  ZW: ["Africa/Harare"], // Zimbabwe
  BW: ["Africa/Gaborone"], // Botswana
  NA: ["Africa/Windhoek"], // Namibia
  IE: ["Europe/Dublin"], // Ireland
};

// Get timezones for a country code
export function getTimezonesForCountry(countryCode: string): string[] {
  return countryTimezones[countryCode] || [];
}

// Get country code from timezone (reverse lookup)
export function getCountryFromTimezone(timezone: string): string | null {
  for (const [countryCode, timezones] of Object.entries(countryTimezones)) {
    if (timezones.includes(timezone)) {
      return countryCode;
    }
  }
  return null;
}

