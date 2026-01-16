import { createHash } from "crypto";

/**
 * Generate a device fingerprint from request headers
 * This creates a unique identifier for the device/browser combination
 * Uses SHA256 hash for consistency
 */
export function generateDeviceFingerprint(
  userAgent: string | null,
  acceptLanguage: string | null,
  acceptEncoding: string | null
): string {
  // Combine various headers to create a fingerprint
  const fingerprintData = [
    userAgent || "",
    acceptLanguage || "",
    acceptEncoding || "",
  ].join("|");

  // Create a hash of the fingerprint data
  const hash = createHash("sha256").update(fingerprintData).digest("hex");
  
  return hash;
}

/**
 * Generate device fingerprint from client-provided data
 * This matches the client-side generation method
 */
export function generateDeviceFingerprintFromClientData(
  userAgent: string,
  language: string
): string {
  // Match client-side generation: [userAgent, language, "gzip, deflate, br"]
  const fingerprintData = [userAgent, language, "gzip, deflate, br"].join("|");
  
  // Use SHA256 for consistency (client uses simple hash, but we'll normalize to SHA256)
  const hash = createHash("sha256").update(fingerprintData).digest("hex");
  
  return hash;
}

/**
 * Get device fingerprint from NextRequest
 */
export function getDeviceFingerprintFromRequest(req: Request): string {
  const userAgent = req.headers.get("user-agent");
  const acceptLanguage = req.headers.get("accept-language");
  const acceptEncoding = req.headers.get("accept-encoding");

  return generateDeviceFingerprint(userAgent, acceptLanguage, acceptEncoding);
}

/**
 * Get IP address from NextRequest
 */
export function getIpAddressFromRequest(req: Request): string | undefined {
  // Try various headers that might contain the IP
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(",")[0]?.trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return undefined;
}

