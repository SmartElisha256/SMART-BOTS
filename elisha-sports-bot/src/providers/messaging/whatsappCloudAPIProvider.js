import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import crypto from 'node:crypto';

const whatsappConfigSchema = z.object({
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  appSecret: z.string().optional(),
  apiVersion: z.string().default('v19.0'),
  apiBaseUrl: z.string().url().default('https://graph.instagram.com'),
  webhookVerifyToken: z.string().min(1)
});

export class WhatsAppCloudAPIProvider {
  constructor(config = {}) {
    const finalConfig = whatsappConfigSchema.parse({
      phoneNumberId: config.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: config.accessToken || env.WHATSAPP_TOKEN,
      appSecret: config.appSecret || env.WHATSAPP_APP_SECRET,
      apiVersion: config.apiVersion || env.WHATSAPP_API_VERSION,
      apiBaseUrl: config.apiBaseUrl || env.WHATSAPP_API_BASE_URL,
      webhookVerifyToken: config.webhookVerifyToken || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    });

    this.phoneNumberId = finalConfig.phoneNumberId;
    this.accessToken = finalConfig.accessToken;
    this.appSecret = finalConfig.appSecret;
    this.apiVersion = finalConfig.apiVersion;
    this.apiBaseUrl = finalConfig.apiBaseUrl;
    this.webhookVerifyToken = finalConfig.webhookVerifyToken;
    this.timeout = config.timeout || 15_000;
    this.processedMessageIds = new Set();
  }

  verifyWebhookToken(token) {
    return token === this.webhookVerifyToken;
  }

  verifyWebhookSignature(payload, xHubSignature) {
    if (!this.appSecret) {
      logger.warn('App secret not configured. Webhook signature verification skipped.');
      return true;
    }

    if (!xHubSignature) {
      logger.warn('Missing X-Hub-Signature header');
      return false;
    }

    const hash = crypto.createHmac('sha256', this.appSecret).update(payload).digest('hex');
    const expected = `sha256=${hash}`;

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(xHubSignature)
    );

    return isValid;
  }

  isDuplicateMessage(messageId, ttlMs = 3600_000) {
    if (this.processedMessageIds.has(messageId)) {
      return true;
    }

    this.processedMessageIds.add(messageId);

    setTimeout(() => {
      this.processedMessageIds.delete(messageId);
    }, ttlMs);

    return false;
  }

  parseIncomingWebhook(payload) {
    const schema = z.object({
      object: z.literal('whatsapp_business_account'),
      entry: z.array(
        z.object({
          id: z.string(),
          changes: z.array(
            z.object({
              value: z.object({
                messaging_product: z.literal('whatsapp'),
                messages: z.array(
                  z.object({
                    id: z.string(),
                    from: z.string(),
                    timestamp: z.string(),
                    type: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'interactive', 'sticker']),
                    text: z.object({ body: z.string() }).optional(),
                    image: z.object({ id: z.string(), mime_type: z.string() }).optional(),
                    video: z.object({ id: z.string(), mime_type: z.string() }).optional(),
                    audio: z.object({ id: z.string(), mime_type: z.string() }).optional(),
                    document: z.object({ id: z.string(), mime_type: z.string(), filename: z.string().optional() }).optional(),
                    location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
                    interactive: z.object({ type: z.string(), button_reply: z.object({ id: z.string(), title: z.string() }).optional() }).optional()
                  })
                ).optional().default([]),
                statuses: z.array(
                  z.object({
                    id: z.string(),
                    status: z.enum(['sent', 'delivered', 'read', 'failed']),
                    timestamp: z.string(),
                    recipient_id: z.string().optional()
                  })
                ).optional().default([])
              })
            })
          )
        })
      )
    });

    return schema.parse(payload);
  }

  async sendMessage({ to, text }) {
    if (!this.phoneNumberId || this.phoneNumberId === 'replace-me') {
      throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured.');
    }

    if (!this.accessToken || this.accessToken === 'replace-me') {
      throw new Error('WHATSAPP_TOKEN is not configured.');
    }

    if (!to || typeof to !== 'string') {
      throw new Error('Target phone number (to) is required and must be a string.');
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Message text is required and must be a string.');
    }

    const url = `${this.apiBaseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    });

    logger.info(
      { endpoint: url, to, messageLength: text.length },
      'Sending message via WhatsApp Cloud API'
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'elisha-sports-bot/1.0'
        },
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseBody = await response.json().catch(() => ({}));

      if (!response.ok) {
        logger.error(
          { status: response.status, to, error: responseBody.error },
          `WhatsApp Cloud API returned status ${response.status}`
        );

        if (response.status === 429) {
          throw new Error('Rate limited by WhatsApp Cloud API. Please retry after some time.');
        }

        if (response.status >= 500) {
          throw new Error(`WhatsApp Cloud API server error: ${response.status}`);
        }

        throw new Error(`WhatsApp Cloud API request failed: ${responseBody.error?.message || response.statusText}`);
      }

      logger.info({ to, messageId: responseBody.messages?.[0]?.id }, 'Message sent successfully via WhatsApp Cloud API');

      return {
        ok: true,
        provider: 'whatsapp-cloud',
        to,
        messageLength: text.length,
        messageId: responseBody.messages?.[0]?.id,
        result: responseBody
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error({ to }, `WhatsApp Cloud API request timeout after ${this.timeout}ms`);
        throw new Error(`WhatsApp Cloud API request timed out after ${this.timeout}ms`);
      }

      logger.error({ to, errorMessage: error.message }, 'WhatsApp Cloud API request failed');
      throw error;
    }
  }

  getConfigStatus() {
    const hasPhoneId = this.phoneNumberId && this.phoneNumberId !== 'replace-me';
    const hasToken = this.accessToken && this.accessToken !== 'replace-me';
    const hasVerifyToken = this.webhookVerifyToken && this.webhookVerifyToken !== 'replace-me';

    return {
      configured: hasPhoneId && hasToken && hasVerifyToken,
      phoneNumberIdSet: hasPhoneId,
      accessTokenSet: hasToken,
      webhookVerifyTokenSet: hasVerifyToken,
      appSecretSet: Boolean(this.appSecret && this.appSecret !== 'replace-me'),
      apiVersion: this.apiVersion,
      apiBaseUrl: this.apiBaseUrl,
      timeout: this.timeout
    };
  }
}

export default WhatsAppCloudAPIProvider;
