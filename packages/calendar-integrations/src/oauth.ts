import type { OAuthConfig } from "./types";


export const GOOGLE_OAUTH_CONFIG: OAuthConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  scopes: [
    "https://www.googleapis.com/auth/calendar", // Full calendar access (read/write)
    "https://www.googleapis.com/auth/userinfo.email", // User email
    "https://www.googleapis.com/auth/userinfo.profile", // User profile info
    "https://www.googleapis.com/auth/contacts.readonly", // Read contacts (for attendee suggestions)
  ],
};

export const MICROSOFT_OAUTH_CONFIG: OAuthConfig = {
  clientId: process.env.MICROSOFT_CLIENT_ID || "",
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
  redirectUri: process.env.MICROSOFT_REDIRECT_URI || "",
  scopes: [
    "https://graph.microsoft.com/Calendars.ReadWrite", // Full calendar access
    "https://graph.microsoft.com/User.Read", // User profile
    "https://graph.microsoft.com/Contacts.Read", // Read contacts (for attendee suggestions)
    "offline_access", // Refresh token
  ],
};

// OAuth endpoints
export const OAUTH_ENDPOINTS = {
  google: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userInfo: "https://www.googleapis.com/oauth2/v2/userinfo",
  },
  microsoft: {
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfo: "https://graph.microsoft.com/v1.0/me",
  },
} as const;