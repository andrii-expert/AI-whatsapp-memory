// Provider configuration for AI SDK transcription models

import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { elevenlabs } from '@ai-sdk/elevenlabs';

export function getTranscriptionModel(provider: string) {
  switch (provider) {
    case 'openai-whisper':
      return openai.transcription('whisper-1');

    case 'openai-gpt4o':
      return openai.transcription('gpt-4o-transcribe');

    case 'google-chirp':
      // Google Chirp model for speech recognition
      // Note: transcription() might not be available on GoogleGenerativeAIProvider yet
      return google('models/chirp-2') as any;

    case 'elevenlabs':
      return elevenlabs.transcription('scribe_v1');

    default:
      throw new Error(`Unknown transcription provider: ${provider}`);
  }
}

export function getProviderCostPerMinute(provider: string): number {
  const costs: Record<string, number> = {
    'openai-whisper': 0.006,
    'openai-gpt4o': 0.006,
    'google-chirp': 0.024,
    'elevenlabs': 0.005,
  };

  return costs[provider] || 0;
}

export function isProviderEnabled(provider: string): boolean {
  const envMap: Record<string, string> = {
    'openai-whisper': 'STT_OPENAI_ENABLED',
    'openai-gpt4o': 'STT_OPENAI_ENABLED',
    'google-chirp': 'STT_GOOGLE_ENABLED',
    'elevenlabs': 'STT_ELEVENLABS_ENABLED',
  };

  const envVar = envMap[provider];
  return envVar ? process.env[envVar] !== 'false' : false;
}
