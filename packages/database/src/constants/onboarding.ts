// ============================================
// Onboarding Form Options
// ============================================
// These constants define the available options for onboarding form fields.
// Stored as TypeScript constants (not DB enums) for easier modification.

export const AGE_GROUP_OPTIONS = [
  "18-25",
  "26-35",
  "36-45",
  "46 and over",
] as const;

export const MAIN_USE_OPTIONS = [
  "Manage calendars",
  "Scheduling meetings",
  "Personal organization",
  "Team coordination",
  "Event planning",
  "Business appointments",
] as const;

export const HOW_HEARD_OPTIONS = [
  "Social media",
  "Google search",
  "Word of mouth",
  "Blog/Article",
  "Advertisement",
  "Other",
] as const;

export const GENDER_OPTIONS = [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
] as const;

export const COUNTRY_OPTIONS = [
  "South Africa",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Netherlands",
  "Other",
] as const;

// TypeScript types derived from constants
export type AgeGroup = typeof AGE_GROUP_OPTIONS[number];
export type MainUse = typeof MAIN_USE_OPTIONS[number];
export type HowHeard = typeof HOW_HEARD_OPTIONS[number];
export type Gender = typeof GENDER_OPTIONS[number];
export type Country = typeof COUNTRY_OPTIONS[number];
