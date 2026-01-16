/**
 * Client-side utility to generate device fingerprint
 * This should match the server-side implementation
 */
export function generateDeviceFingerprintClient(): string {
  // Collect browser/device information
  const userAgent = navigator.userAgent || "";
  const acceptLanguage = navigator.language || "";
  const acceptEncoding = "gzip, deflate, br"; // Common encoding
  
  // Combine to create fingerprint data
  const fingerprintData = [userAgent, acceptLanguage, acceptEncoding].join("|");
  
  // Create a simple hash (for client-side, we'll use a simple approach)
  // In production, you might want to use a more sophisticated hashing
  let hash = 0;
  for (let i = 0; i < fingerprintData.length; i++) {
    const char = fingerprintData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to hex string
  return Math.abs(hash).toString(16);
}

/**
 * Get device fingerprint from browser
 */
export async function getDeviceFingerprint(): Promise<string> {
  // Try to get from localStorage first (for consistency)
  const stored = localStorage.getItem("device_fingerprint");
  if (stored) {
    return stored;
  }
  
  // Generate new fingerprint
  const fingerprint = generateDeviceFingerprintClient();
  
  // Store for future use
  localStorage.setItem("device_fingerprint", fingerprint);
  
  return fingerprint;
}

