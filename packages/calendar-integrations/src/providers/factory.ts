import { GoogleCalendarProvider } from "./google";
import { MicrosoftCalendarProvider } from "./microsoft";
import type { CalendarProvider, CalendarProviderType } from "../types";

export function createCalendarProvider(provider: CalendarProviderType): CalendarProvider {
  switch (provider) {
    case "google":
      return new GoogleCalendarProvider();
    case "microsoft":
      return new MicrosoftCalendarProvider();
    default:
      throw new Error(`Unsupported calendar provider: ${provider}`);
  }
}