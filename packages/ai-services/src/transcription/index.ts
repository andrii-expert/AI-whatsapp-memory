// Main transcription service using AI SDK

import { experimental_transcribe as transcribe } from 'ai';
import { getTranscriptionModel, isProviderEnabled } from './providers';
import { logger } from '@imaginecalendar/logger';
import type { TranscriptionOptions, TranscriptionResult } from './types';

export class TranscriptionService {
  async transcribe(
    audio: Buffer,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();
    const primaryProvider = options.provider || process.env.STT_PROVIDER || 'openai-whisper';

    try {
      logger.info(
        { provider: primaryProvider, audioSize: audio.length },
        'Starting transcription'
      );

      const model = getTranscriptionModel(primaryProvider);

      const result = await transcribe({
        model,
        audio,
        providerOptions: this.getProviderOptions(primaryProvider, options),
      });

      const duration = Date.now() - startTime;

      logger.info(
        {
          provider: primaryProvider,
          durationMs: duration,
          textLength: result.text.length,
          language: result.language,
        },
        'Transcription completed'
      );

      return {
        text: result.text,
        language: result.language,
        durationInSeconds: result.durationInSeconds,
        segments: result.segments?.map(s => ({
          text: s.text,
          start: s.startSecond,
          end: s.endSecond,
        })),
        provider: primaryProvider,
      };
    } catch (error) {
      logger.error(
        {
          provider: primaryProvider,
          error: error instanceof Error ? error.message : String(error),
        },
        'Transcription failed with primary provider'
      );

      // Try fallback if enabled
      if (options.enableFallback) {
        return await this.transcribeWithFallback(audio, primaryProvider, options);
      }

      throw error;
    }
  }

  private async transcribeWithFallback(
    audio: Buffer,
    failedProvider: string,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const fallbackProvider = this.getFallbackProvider(failedProvider);

    if (!fallbackProvider) {
      throw new Error('No fallback provider available');
    }

    logger.warn(
      { primary: failedProvider, fallback: fallbackProvider },
      'Attempting transcription with fallback provider'
    );

    try {
      const model = getTranscriptionModel(fallbackProvider);

      const result = await transcribe({
        model,
        audio,
        providerOptions: this.getProviderOptions(fallbackProvider, options),
      });

      logger.info({ fallback: fallbackProvider }, 'Fallback transcription succeeded');

      return {
        text: result.text,
        language: result.language,
        durationInSeconds: result.durationInSeconds,
        segments: result.segments?.map(s => ({
          text: s.text,
          start: s.startSecond,
          end: s.endSecond,
        })),
        provider: fallbackProvider,
        fallbackUsed: true,
      };
    } catch (error) {
      logger.error(
        { fallback: fallbackProvider, error },
        'Fallback transcription also failed'
      );
      throw new Error('All transcription providers failed');
    }
  }

  private getProviderOptions(provider: string, options: TranscriptionOptions) {
    const baseOptions: any = {};

    // Provider-specific options
    if (provider.startsWith('openai')) {
      baseOptions.openai = {
        language: options.language,
        ...(options.enableTimestamps && {
          timestampGranularities: ['word'],
        }),
      };
    } else if (provider === 'elevenlabs') {
      baseOptions.elevenlabs = {
        language_code: options.language,
        ...(options.enableTimestamps && {
          timestamp_granularity: 'word',
        }),
      };
    } else if (provider.startsWith('google')) {
      baseOptions.google = {
        languageCode: options.language || 'en-US',
        enableWordTimeOffsets: options.enableTimestamps,
      };
    }

    return baseOptions;
  }

  private getFallbackProvider(failedProvider: string): string | null {
    // Fallback hierarchy
    const fallbackMap: Record<string, string> = {
      'openai-whisper': 'elevenlabs',
      'elevenlabs': 'google-chirp',
      'google-chirp': 'openai-whisper',
      'openai-gpt4o': 'openai-whisper',
    };

    const fallback = fallbackMap[failedProvider];

    // Check if fallback provider is enabled
    if (fallback && isProviderEnabled(fallback)) {
      return fallback;
    }

    return null;
  }
}

// Export types
export type { TranscriptionOptions, TranscriptionResult, TranscriptSegment } from './types';
