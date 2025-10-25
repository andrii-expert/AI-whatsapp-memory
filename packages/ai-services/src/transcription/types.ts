// Transcription types and interfaces

export interface TranscriptionOptions {
  provider?: string;           // Override default provider
  language?: string;           // ISO 639-1 code ('en', 'es', etc.)
  enableTimestamps?: boolean;  // Get word-level timestamps
  enableFallback?: boolean;    // Use fallback on failure
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationInSeconds?: number;
  segments?: TranscriptSegment[];
  provider: string;
  fallbackUsed?: boolean;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}
