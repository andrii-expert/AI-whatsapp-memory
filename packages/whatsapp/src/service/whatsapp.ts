import axios from 'axios';
import { logger } from '@imaginecalendar/logger';
import { getWhatsAppConfig, getWhatsAppApiUrl } from './config';

// Normalize phone number to handle both +27828045752 and 27828045752 formats
function normalizePhoneForWhatsApp(phone: string): string {
  // Remove all non-digit characters
  return phone.replace(/\D/g, '');
}

export interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface CTAButtonMessage {
  headerType?: 'text' | 'image' | 'video' | 'document';
  headerContent?: string; // For text header or media URL for others
  bodyText: string;
  footerText?: string;
  buttonText: string;
  buttonUrl: string;
}

export interface ListMessageOption {
  id: string;
  title: string;
  description?: string;
}

export interface ListMessage {
  bodyText: string;
  buttonText: string; // e.g., "Select an option"
  options: ListMessageOption[];
  headerText?: string;
  footerText?: string;
}

export interface ReplyButton {
  id: string;
  title: string; // Max 20 characters
}

export interface ReplyButtonMessage {
  bodyText: string;
  buttons: ReplyButton[]; // Max 3 buttons
  headerText?: string;
  footerText?: string;
}

export class WhatsAppService {
  /**
   * Send a plain text message (for conversations within 24-hour window)
   */
  async sendTextMessage(to: string, message: string): Promise<WhatsAppMessageResponse> {
    const config = getWhatsAppConfig();
    try {
      const response = await axios.post<WhatsAppMessageResponse>(
        `${getWhatsAppApiUrl()}/${config.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizePhoneForWhatsApp(to),
          type: 'text',
          text: {
            body: message
          }
        },
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({
        to: normalizePhoneForWhatsApp(to),
        messageLength: message.length,
        messageId: response.data.messages?.[0]?.id
      }, 'WhatsApp text message sent successfully');

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error({
          error,
          to: normalizePhoneForWhatsApp(to),
          apiError: error.response?.data
        }, 'WhatsApp text message API Error');
        throw new Error(`WhatsApp API Error: ${error.message}`);
      }
      logger.error({ error, to }, 'Unknown WhatsApp text message error');
      throw error;
    }
  }

  /**
   * Send a message using a template
   */
  async sendMessage(to: string, message: string, templateName = 'cc_me'): Promise<WhatsAppMessageResponse> {
    const config = getWhatsAppConfig();
    try {
      const response = await axios.post<WhatsAppMessageResponse>(
        `${getWhatsAppApiUrl()}/${config.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizePhoneForWhatsApp(to),
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: 'en'
            },
            components: [
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: message
                  }
                ]
              }
            ]
          }
        },
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({
        to: normalizePhoneForWhatsApp(to),
        templateName,
        messageId: response.data.messages?.[0]?.id
      }, 'WhatsApp message sent successfully');

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error({
          error,
          to: normalizePhoneForWhatsApp(to),
          templateName,
          apiError: error.response?.data
        }, 'WhatsApp API Error');
        throw new Error(`WhatsApp API Error: ${error.message}`);
      }
      logger.error({ error, to, templateName }, 'Unknown WhatsApp error');
      throw error;
    }
  }

  /**
   * Send an interactive CTA URL button message
   */
  async sendCTAButtonMessage(to: string, message: CTAButtonMessage): Promise<WhatsAppMessageResponse> {
    const config = getWhatsAppConfig();
    try {
      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhoneForWhatsApp(to),
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: {
            text: message.bodyText
          },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: message.buttonText,
              url: message.buttonUrl
            }
          }
        }
      };

      // Add header if specified
      if (message.headerType && message.headerContent) {
        if (message.headerType === 'text') {
          payload.interactive.header = {
            type: 'text',
            text: message.headerContent
          };
        } else {
          // For image, video, document
          payload.interactive.header = {
            type: message.headerType,
            [message.headerType]: {
              link: message.headerContent
            }
          };
        }
      }

      // Add footer if specified
      if (message.footerText) {
        payload.interactive.footer = {
          text: message.footerText
        };
      }

      const response = await axios.post<WhatsAppMessageResponse>(
        `${getWhatsAppApiUrl()}/${config.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({
        to: normalizePhoneForWhatsApp(to),
        buttonText: message.buttonText,
        buttonUrl: message.buttonUrl,
        messageId: response.data.messages?.[0]?.id
      }, 'WhatsApp CTA button message sent successfully');

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error({
          error,
          to: normalizePhoneForWhatsApp(to),
          buttonText: message.buttonText,
          apiError: error.response?.data
        }, 'WhatsApp CTA button message API Error');
        throw new Error(`WhatsApp API Error: ${error.message}`);
      }
      logger.error({ error, to, message }, 'Unknown WhatsApp CTA button message error');
      throw error;
    }
  }

  /**
   * Send an interactive reply button message (max 3 buttons)
   */
  async sendReplyButtonMessage(to: string, message: ReplyButtonMessage): Promise<WhatsAppMessageResponse> {
    const config = getWhatsAppConfig();
    try {
      if (message.buttons.length > 3) {
        throw new Error('WhatsApp reply buttons support maximum 3 buttons');
      }

      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhoneForWhatsApp(to),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: message.bodyText
          },
          action: {
            buttons: message.buttons.map(button => ({
              type: 'reply',
              reply: {
                id: button.id,
                title: button.title.substring(0, 20) // Max 20 chars
              }
            }))
          }
        }
      };

      // Add header if specified
      if (message.headerText) {
        payload.interactive.header = {
          type: 'text',
          text: message.headerText
        };
      }

      // Add footer if specified
      if (message.footerText) {
        payload.interactive.footer = {
          text: message.footerText
        };
      }

      const response = await axios.post<WhatsAppMessageResponse>(
        `${getWhatsAppApiUrl()}/${config.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({
        to: normalizePhoneForWhatsApp(to),
        buttonCount: message.buttons.length,
        messageId: response.data.messages?.[0]?.id
      }, 'WhatsApp reply button message sent successfully');

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error({
          error,
          to: normalizePhoneForWhatsApp(to),
          apiError: error.response?.data
        }, 'WhatsApp reply button message API Error');
        throw new Error(`WhatsApp API Error: ${error.message}`);
      }
      logger.error({ error, to, message }, 'Unknown WhatsApp reply button message error');
      throw error;
    }
  }

  /**
   * Send an interactive list message
   */
  async sendListMessage(to: string, message: ListMessage): Promise<WhatsAppMessageResponse> {
    const config = getWhatsAppConfig();
    try {
      // WhatsApp requires list items to be in sections
      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhoneForWhatsApp(to),
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: message.bodyText
          },
          action: {
            button: message.buttonText,
            sections: [
              {
                title: 'Options', // Section title (required)
                rows: message.options.map(option => ({
                  id: option.id,
                  title: option.title.substring(0, 24), // Max 24 chars
                  description: option.description?.substring(0, 72) // Max 72 chars
                }))
              }
            ]
          }
        }
      };

      // Add header if specified
      if (message.headerText) {
        payload.interactive.header = {
          type: 'text',
          text: message.headerText
        };
      }

      // Add footer if specified
      if (message.footerText) {
        payload.interactive.footer = {
          text: message.footerText
        };
      }

      const response = await axios.post<WhatsAppMessageResponse>(
        `${getWhatsAppApiUrl()}/${config.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({
        to: normalizePhoneForWhatsApp(to),
        optionCount: message.options.length,
        messageId: response.data.messages?.[0]?.id
      }, 'WhatsApp list message sent successfully');

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error({
          error,
          to: normalizePhoneForWhatsApp(to),
          apiError: error.response?.data
        }, 'WhatsApp list message API Error');
        throw new Error(`WhatsApp API Error: ${error.message}`);
      }
      logger.error({ error, to, message }, 'Unknown WhatsApp list message error');
      throw error;
    }
  }

  async sendTypingIndicator(to: string, messageId: string, type: 'text' | 'audio' | 'video' = 'text'): Promise<void> {
    const config = getWhatsAppConfig();

    try {
      await axios.post(
        `${getWhatsAppApiUrl()}/${config.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
          typing_indicator: {
            type: 'text'
          },
        },
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(
        {
          to: normalizePhoneForWhatsApp(to),
          messageId,
          type,
        },
        'WhatsApp typing indicator sent'
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.warn(
          {
            error,
            to: normalizePhoneForWhatsApp(to),
            messageId,
            apiError: error.response?.data,
          },
          'Failed to send WhatsApp typing indicator'
        );
        return;
      }

      logger.warn(
        {
          error,
          to,
          messageId,
        },
        'Unexpected error sending WhatsApp typing indicator'
      );
    }
  }

  /**
   * Send a welcome message to a newly verified user using CTA button
   */
  async sendWelcomeMessage(to: string, contactName?: string, logData?: { db: any, whatsappNumberId: string, userId: string }): Promise<WhatsAppMessageResponse> {
    const config = getWhatsAppConfig();

    // Personalize the welcome message with the contact name
    const personalizedBodyText = contactName
      ? config.welcomeBodyText.replace(/Welcome to ImagineCalendar!/, `Welcome to ImagineCalendar, ${contactName}!`)
      : config.welcomeBodyText;

    const welcomeMessage: CTAButtonMessage = {
      headerType: config.welcomeHeaderImage ? 'image' : undefined,
      headerContent: config.welcomeHeaderImage,
      bodyText: personalizedBodyText,
      footerText: config.welcomeFooterText,
      buttonText: config.welcomeButtonText,
      buttonUrl: config.welcomeButtonUrl,
    };

    try {
      const response = await this.sendCTAButtonMessage(to, welcomeMessage);

      logger.info({
        to: normalizePhoneForWhatsApp(to),
        contactName,
        buttonUrl: config.welcomeButtonUrl,
        messageId: response.messages?.[0]?.id
      }, 'WhatsApp welcome CTA message sent successfully');

      // Log the outgoing message if database logging data is provided
      if (logData) {
        try {
          const { logOutgoingWhatsAppMessage, isWithinFreeMessageWindow } = await import('@imaginecalendar/database/queries');

          // Check if message is within free 24-hour window
          const isFreeMessage = await isWithinFreeMessageWindow(logData.db, logData.whatsappNumberId);

          await logOutgoingWhatsAppMessage(logData.db, {
            whatsappNumberId: logData.whatsappNumberId,
            userId: logData.userId,
            messageId: response.messages?.[0]?.id,
            messageType: 'interactive',
            isFreeMessage,
          });

          logger.info({
            to: normalizePhoneForWhatsApp(to),
            userId: logData.userId,
            messageId: response.messages?.[0]?.id,
            isFreeMessage
          }, 'Welcome message logged to analytics');
        } catch (logError) {
          logger.error({
            error: logError,
            to: normalizePhoneForWhatsApp(to),
            userId: logData.userId
          }, 'Failed to log outgoing welcome message');
        }
      }

      return response;
    } catch (error) {
      logger.error({
        error,
        to: normalizePhoneForWhatsApp(to),
        contactName,
        buttonUrl: config.welcomeButtonUrl
      }, 'WhatsApp welcome CTA message failed');
      throw error;
    }
  }

  /**
   * Verify webhook token
   */
  verifyWebhookToken(token: string): boolean {
    const config = getWhatsAppConfig();
    return token === config.verifyToken;
  }
}