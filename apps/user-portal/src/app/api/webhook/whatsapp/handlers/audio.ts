import type { Database } from '@imaginecalendar/database/client';
import {
  getVerifiedWhatsappNumberByPhone,
  logIncomingWhatsAppMessage,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService, getWhatsAppConfig, getWhatsAppApiUrl } from '@imaginecalendar/whatsapp';
import type { WebhookProcessingSummary } from '../types';
import { TranscriptionService } from '@imaginecalendar/ai-services';
import { handleTextMessage } from './text';

export async function handleAudioMessage(
  message: any,
  db: Database,
  summary: WebhookProcessingSummary
): Promise<void> {
  const audioData = message.audio ?? message.voice;

  if (!audioData) {
    logger.warn({ messageId: message.id }, 'Audio message missing media payload');
    return;
  }

  const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, message.from);

  if (!whatsappNumber || !whatsappNumber.isVerified) {
    logger.info(
      {
        senderPhone: message.from,
        found: !!whatsappNumber,
        verified: whatsappNumber?.isVerified,
      },
      'Ignoring audio from unverified number'
    );
    return;
  }

  try {
    await logIncomingWhatsAppMessage(db, {
      whatsappNumberId: whatsappNumber.id,
      userId: whatsappNumber.userId,
      messageId: message.id,
      messageType: 'voice',
    });
  } catch (error) {
    logger.error(
      {
        error,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to log incoming audio message'
    );
  }

  const whatsappService = new WhatsAppService();

  if (message.id && message.from) {
    try {
      await whatsappService.sendTypingIndicator(message.from, message.id, 'audio');
    } catch (error) {
      logger.warn(
        {
          error,
          messageId: message.id,
          senderPhone: message.from,
        },
        'Failed to send typing indicator for audio message'
      );
    }
  }

  try {
    logger.info(
      {
        messageId: message.id,
        mediaId: audioData.id,
        userId: whatsappNumber.userId,
      },
      'Starting audio transcription process'
    );

    // Step 1: Download audio file from WhatsApp
    const audioBuffer = await downloadAudioFromWhatsApp(audioData.id);
    
    logger.info(
      {
        messageId: message.id,
        audioSize: audioBuffer.length,
      },
      'Audio downloaded successfully'
    );

    // Step 2: Transcribe audio
    const transcriptionService = new TranscriptionService();
    const transcriptionResult = await transcriptionService.transcribe(audioBuffer, {
      language: 'en',
      enableFallback: true,
      enableTimestamps: false,
    });

    const transcribedText = transcriptionResult.text.trim();

    logger.info(
      {
        messageId: message.id,
        textLength: transcribedText.length,
        provider: transcriptionResult.provider,
      },
      'Audio transcribed successfully'
    );

    // Step 3: Check if transcription is valid
    if (!transcribedText) {
      logger.warn(
        {
          messageId: message.id,
        },
        'Transcription returned empty text'
      );
      await whatsappService.sendTextMessage(
        message.from,
        "I'm sorry, I couldn't transcribe your voice message. Please try again or send a text message."
      );
      return;
    }

    // Step 4: Process transcribed text as a text message
    const textMessage = {
      ...message,
      type: 'text',
      text: {
        body: transcribedText,
      },
    };

    await handleTextMessage(textMessage, db, summary);

    logger.info(
      {
        messageId: message.id,
        originalType: 'audio',
        transcribedTextLength: transcribedText.length,
      },
      'Voice message processed as text message'
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        messageId: message.id,
        senderPhone: message.from,
      },
      'Failed to process audio message'
    );

    try {
      await whatsappService.sendTextMessage(
        message.from,
        "I'm sorry, I encountered an error processing your voice message. Please try again or send a text message."
      );
    } catch (sendError) {
      logger.error(
        {
          error: sendError,
          senderPhone: message.from,
        },
        'Failed to send error message to user'
      );
    }
  }
}

/**
 * Download audio file from WhatsApp using media ID
 */
async function downloadAudioFromWhatsApp(mediaId: string): Promise<Buffer> {
  const config = getWhatsAppConfig();
  const apiUrl = getWhatsAppApiUrl();

  try {
    // Step 1: Get media URL from WhatsApp
    logger.info({ mediaId }, 'Fetching media URL from WhatsApp');
    const mediaUrlResponse = await fetch(`${apiUrl}/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!mediaUrlResponse.ok) {
      throw new Error(`WhatsApp API error: ${mediaUrlResponse.status} ${mediaUrlResponse.statusText}`);
    }

    const mediaUrlData = await mediaUrlResponse.json() as { url?: string };

    if (!mediaUrlData?.url) {
      throw new Error('No media URL in response');
    }

    const mediaUrl = mediaUrlData.url;

    // Step 2: Download the actual media file
    logger.info({ mediaId, mediaUrl }, 'Downloading audio file');
    const audioResponse = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout for download
    });

    if (!audioResponse.ok) {
      throw new Error(`Media download error: ${audioResponse.status} ${audioResponse.statusText}`);
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(
        {
          mediaId,
          error: error.message,
          errorStack: error.stack,
        },
        'Failed to download audio from WhatsApp'
      );
      throw error;
    }
    throw new Error('Unknown error downloading audio');
  }
}

