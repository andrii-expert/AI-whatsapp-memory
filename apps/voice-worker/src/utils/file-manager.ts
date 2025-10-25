// Temporary file management for audio files

import { unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { logger } from '@imaginecalendar/logger';

export class FileManager {
  private tempDir: string;

  constructor() {
    this.tempDir = join(tmpdir(), 'imaginecalendar-voice');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error({ error, tempDir: this.tempDir }, 'Failed to create temp directory');
    }
  }

  /**
   * Save audio buffer to temporary file
   */
  async saveTemp(buffer: Buffer, mimeType?: string): Promise<string> {
    const extension = this.getExtensionFromMimeType(mimeType);
    const filename = `voice-${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
    const filePath = join(this.tempDir, filename);

    try {
      await writeFile(filePath, buffer);
      logger.info({ filePath, size: buffer.length }, 'Audio file saved to temp');
      return filePath;
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to save temp file');
      throw new Error('Failed to save audio file');
    }
  }

  /**
   * Clean up temporary file
   */
  async cleanup(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
      logger.info({ filePath }, 'Temp file cleaned up');
    } catch (error) {
      // File might not exist, that's okay
      logger.warn({ error, filePath }, 'Failed to cleanup temp file');
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType?: string): string {
    if (!mimeType) return 'ogg';

    const mimeMap: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/opus': 'opus',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
    };

    return mimeMap[mimeType] || 'ogg';
  }
}
