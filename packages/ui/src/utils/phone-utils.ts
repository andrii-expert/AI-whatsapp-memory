import { countryCodes } from "./country-codes";

/**
 * Normalizes a phone number to international format
 * @param phoneNumber - The input phone number (can include country code or not)
 * @param defaultCountryCode - Default country code to use if none is detected (e.g., "+27")
 * @returns Normalized phone number in international format (e.g., "+27821234567")
 */
export function normalizePhoneNumber(
  phoneNumber: string,
  defaultCountryCode = "+27"
): string {
  if (!phoneNumber) return "";

  // Remove all non-digit characters except the leading +
  let cleaned = phoneNumber.replace(/[^\d+]/g, "");

  // If the number doesn't start with +, check if it starts with a 0
  if (!cleaned.startsWith("+")) {
    // Check if it starts with 0 (common local format)
    if (cleaned.startsWith("0")) {
      // Remove the leading 0 and add the default country code
      cleaned = defaultCountryCode + cleaned.substring(1);
    } else {
      // If no country code and no leading 0, add default country code
      cleaned = defaultCountryCode + cleaned;
    }
  } else {
    // Number already has country code, but check for common formatting issues
    // For South Africa specifically, handle +270 (incorrect) to +27
    if (cleaned.startsWith("+270") && defaultCountryCode === "+27") {
      cleaned = "+27" + cleaned.substring(4);
    }

    // For any country code, if user entered something like +27 0821234567
    // We need to remove the 0 after the country code
    const matchedCountry = countryCodes.find(country =>
      cleaned.startsWith(country.dial_code)
    );

    if (matchedCountry) {
      const afterCode = cleaned.substring(matchedCountry.dial_code.length);
      if (afterCode.startsWith("0")) {
        cleaned = matchedCountry.dial_code + afterCode.substring(1);
      }
    }
  }

  return cleaned;
}

/**
 * Formats a phone number for display
 * @param phoneNumber - The normalized phone number
 * @param format - The display format ("international" | "national" | "raw")
 * @returns Formatted phone number for display
 */
export function formatPhoneNumber(
  phoneNumber: string,
  format: "international" | "national" | "raw" = "international"
): string {
  if (!phoneNumber) return "";

  const matchedCountry = countryCodes.find(country =>
    phoneNumber.startsWith(country.dial_code)
  );

  if (!matchedCountry) {
    return phoneNumber; // Return as-is if no country code matches
  }

  const nationalNumber = phoneNumber.substring(matchedCountry.dial_code.length);

  switch (format) {
    case "national":
      // For South Africa, format as 082 123 4567
      if (matchedCountry.code === "ZA" && nationalNumber.length === 9) {
        return `0${nationalNumber.slice(0, 2)} ${nationalNumber.slice(2, 5)} ${nationalNumber.slice(5)}`;
      }
      // For US/Canada, format as (123) 456-7890
      if ((matchedCountry.code === "US" || matchedCountry.code === "CA") && nationalNumber.length === 10) {
        return `(${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
      }
      // Default: just add 0 prefix for other countries
      return `0${nationalNumber}`;

    case "international":
      // For South Africa, format as +27 82 123 4567
      if (matchedCountry.code === "ZA" && nationalNumber.length === 9) {
        return `${matchedCountry.dial_code} ${nationalNumber.slice(0, 2)} ${nationalNumber.slice(2, 5)} ${nationalNumber.slice(5)}`;
      }
      // For US/Canada, format as +1 (123) 456-7890
      if ((matchedCountry.code === "US" || matchedCountry.code === "CA") && nationalNumber.length === 10) {
        return `${matchedCountry.dial_code} (${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
      }
      // Default: country code + space + number
      return `${matchedCountry.dial_code} ${nationalNumber}`;

    case "raw":
    default:
      return phoneNumber;
  }
}

/**
 * Validates if a phone number is valid
 * @param phoneNumber - The phone number to validate
 * @returns true if valid, false otherwise
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber) return false;

  // Normalize the number first
  const normalized = normalizePhoneNumber(phoneNumber);

  // Check if it starts with a + and has at least 10 digits total
  if (!normalized.startsWith("+")) return false;

  // Remove the + and check if the rest are all digits
  const digitsOnly = normalized.substring(1);
  if (!/^\d+$/.test(digitsOnly)) return false;

  // Check minimum and maximum length (typically 7-15 digits excluding country code)
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;

  // Check against known country codes
  const matchedCountry = countryCodes.find(country =>
    normalized.startsWith(country.dial_code)
  );

  if (!matchedCountry) return false;

  const nationalNumber = normalized.substring(matchedCountry.dial_code.length);

  // Country-specific validations
  if (matchedCountry.code === "ZA") {
    // South African numbers should be exactly 9 digits after country code
    return nationalNumber.length === 9 && /^[67-8]\d{8}$/.test(nationalNumber);
  }

  if (matchedCountry.code === "US" || matchedCountry.code === "CA") {
    // US/Canada numbers should be exactly 10 digits after country code
    return nationalNumber.length === 10;
  }

  // For other countries, just check reasonable length
  return nationalNumber.length >= 6 && nationalNumber.length <= 12;
}