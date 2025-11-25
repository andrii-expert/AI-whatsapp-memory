// AI Services Package - Main Exports

// Transcription
export { TranscriptionService } from './transcription';
export type { TranscriptionOptions, TranscriptionResult, TranscriptSegment } from './transcription';
export { getTranscriptionModel, getProviderCostPerMinute } from './transcription/providers';

// Timezone Utilities
export { formatDateToLocalIso, tryFormatDateToLocalIso } from './utils/timezone';

// Intent Analysis
export { IntentAnalysisService } from './intent';
export type { CalendarIntent, IntentContext, IntentAction } from './intent';
export { calendarIntentSchema, intentActionEnum } from './intent';
export {
  runIntentPipeline,
  type IntentPipelineOptions,
  type IntentPipelineResult,
  type IntentSnapshot,
  type IntentFollowUp,
  type NormalizedIntentSnapshot,
  type IntentPromptContext,
} from './intent';

// Resolution Pipeline
export { ResolutionPipeline, ContactResolver } from './resolvers';
export type {
  ResolutionResult,
  ResolutionContext,
  ContactResolutionResult,
  ContactMatch,
  EventMatchResult,
  EventMatch,
  ConflictInfo,
  ICalendarService,
} from './resolvers';
