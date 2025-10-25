// WhatsApp media download service

import axios from 'axios';
import { logger } from '@imaginecalendar/logger';
import { getWhatsAppConfig, getWhatsAppApiUrl } from '@imaginecalendar/whatsapp';

export interface AudioData {
  buffer: Buffer;
  mimeType: string;
  duration?: number; // Duration in seconds if available
  size: number; // Size in bytes
}

export class AudioDownloader {
  /**
   * Download audio file from WhatsApp using media ID
   */
  async download(mediaId: string): Promise<AudioData> {
    const startTime = Date.now();

    try {
      // Step 1: Get media URL from WhatsApp
      logger.info({ mediaId }, 'Fetching media URL from WhatsApp');
      const mediaUrl = await this.getMediaUrl(mediaId);

      // Step 2: Download the actual media file
      logger.info({ mediaId, mediaUrl }, 'Downloading audio file');
      const audioData = await this.downloadMedia(mediaUrl);

      const duration = Date.now() - startTime;
      logger.info(
        {
          mediaId,
          size: audioData.size,
          mimeType: audioData.mimeType,
          durationMs: duration,
        },
        'Audio download completed'
      );

      return audioData;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          mediaId,
        },
        'Audio download failed'
      );
      throw error;
    }
  }

  /**
   * Get media URL from WhatsApp Graph API
   */
  private async getMediaUrl(mediaId: string): Promise<string> {
    const config = getWhatsAppConfig();

    try {
      const response = await axios.get(
        `${getWhatsAppApiUrl()}/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
          },
          timeout: 10000, // 10 second timeout
        }
      );

      if (!response.data?.url) {
        throw new Error('No media URL in response');
      }

      return response.data.url;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(
          {
            mediaId,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
          },
          'Failed to get media URL from WhatsApp'
        );
        throw new Error(`WhatsApp API error: ${error.response?.status || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Download media file from WhatsApp CDN
   */
  private async downloadMedia(url: string): Promise<AudioData> {
    const config = getWhatsAppConfig();

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout for download
        maxContentLength: 16 * 1024 * 1024, // Max 16MB
      });

      const buffer = Buffer.from(response.data);
      const mimeType = response.headers['content-type'] || 'audio/ogg';

      return {
        buffer,
        mimeType,
        size: buffer.length,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(
          {
            url,
            status: error.response?.status,
            statusText: error.response?.statusText,
          },
          'Failed to download media file'
        );
        throw new Error(`Media download error: ${error.response?.status || error.message}`);
      }
      throw error;
    }
  }
}
