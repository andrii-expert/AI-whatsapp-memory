import { z } from "zod";
import { logger } from '@imaginecalendar/logger';

export const WhatsAppConfig = z.object({
  accessToken: z.string(),
  phoneNumberId: z.string(),
  apiVersion: z.string().default('v23.0'),
  verifyToken: z.string(),
  // CTA Welcome Message Configuration
  welcomeHeaderImage: z.string().optional(),
  welcomeBodyText: z.string().default('Welcome to CrackOn, your personal WhatsApp assistant for meetings and reminders.\n\nYou can talk to me in any language over text message or a voice note, for example:\n\n"Set up a meeting tomorrow at 1pm"\n\n"Move my call with John to next Wednesday at 3pm"\n\n"What\'s on my calendar Friday morning?"\n\n✅ To get started, please connect your calendar so I can create and manage events for you.'),
  welcomeButtonText: z.string().default('Link Calendars'),
  welcomeButtonUrl: z.string().default('https://dashboard.crackon.ai/settings/calendars'),
  welcomeFooterText: z.string().default('Start managing your schedule effortlessly!'),
});

export type WhatsAppConfigType = z.infer<typeof WhatsAppConfig>;

export const getWhatsAppConfig = (): WhatsAppConfigType => {
  try {
    return WhatsAppConfig.parse({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      // CTA Welcome Message Configuration
      welcomeHeaderImage: process.env.WHATSAPP_WELCOME_HEADER_IMAGE,
      welcomeBodyText: process.env.WHATSAPP_WELCOME_BODY_TEXT || 'Welcome to CrackOn, your personal WhatsApp assistant for meetings and reminders.\n\nYou can talk to me in any language over text message or a voice note, for example:\n\n"Set up a meeting tomorrow at 1pm"\n\n"Move my call with John to next Wednesday at 3pm"\n\n"What\'s on my calendar Friday morning?"\n\n✅ To get started, please connect your calendar so I can create and manage events for you.',
      welcomeButtonText: process.env.WHATSAPP_WELCOME_BUTTON_TEXT || 'Link Calendars',
      welcomeButtonUrl: process.env.WHATSAPP_WELCOME_BUTTON_URL || 'https://dashboard.crackon.ai/settings/calendars',
      welcomeFooterText: process.env.WHATSAPP_WELCOME_FOOTER_TEXT || 'Start managing your schedule effortlessly!',
    });
  } catch (error) {
    logger.error({ error }, 'WhatsApp configuration error');
    logger.error({}, 'Missing environment variables. Please check your environment settings.');
    throw new Error('WhatsApp service is not properly configured. Missing required environment variables.');
  }
};

export const getWhatsAppApiUrl = (): string => {
  const config = getWhatsAppConfig();
  return `https://graph.facebook.com/${config.apiVersion}`;
};