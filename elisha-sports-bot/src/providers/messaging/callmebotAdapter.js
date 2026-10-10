import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const callmebotConfigSchema = z.object({
  apiKey: z.string().min(1),
  phone: z.string().min(1),
  endpoint: z.string().url().default('https://api.callmebot.com/whatsapp.php')
});

export class CallMeBotAdapter {
  constructor(config = {}) {
    const finalConfig = callmebotConfigSchema.parse({
      apiKey: config.apiKey || env.CALLMEBOT_API_KEY,
      phone: config.phone || env.CALLMEBOT_PHONE,
      endpoint: config.endpoint || env.CALLMEBOT_ENDPOINT
    });

    this.apiKey = finalConfig.apiKey;
    this.phone = finalConfig.phone;
    this.endpoint = finalConfig.endpoint;
    this.timeout = config.timeout || 10_000;
  }

  async sendMessage({ to, text }) {
    if (!this.apiKey || this.apiKey === 'replace-me') {
      throw new Error('CallMeBot API key is not configured. Set CALLMEBOT_API_KEY in environment variables.');
    }

    if (!this.phone || this.phone === 'replace-me') {
      throw new Error('CallMeBot phone is not configured. Set CALLMEBOT_PHONE in environment variables.');
    }

    if (!to || typeof to !== 'string') {
      throw new Error('Target phone number (to) is required and must be a string.');
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Message text is required and must be a string.');
    }

    const params = new URLSearchParams();
    params.append('phone', to);
    params.append('text', text);
    params.append('apikey', this.apiKey);

    const url = new URL(this.endpoint);
    url.search = params.toString();

    logger.info(
      { endpoint: this.endpoint, to, messageLength: text.length },
      'Sending message via CallMeBot'
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url.toString(), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'User-Agent': 'elisha-sports-bot/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error(
          { status: response.status, to },
          `CallMeBot API returned status ${response.status}`
        );
        throw new Error(`CallMeBot API request failed with status ${response.status}`);
      }

      const result = await response.text();
      logger.info({ to }, 'Message sent successfully via CallMeBot');

      return {
        ok: true,
        provider: 'callmebot',
        to,
        messageLength: text.length,
        result: result.substring(0, 100)
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error({ to }, `CallMeBot request timeout after ${this.timeout}ms`);
        throw new Error(`CallMeBot request timed out after ${this.timeout}ms`);
      }

      logger.error({ to, errorMessage: error.message }, 'CallMeBot request failed');
      throw error;
    }
  }

  getConfigStatus() {
    const hasKey = this.apiKey && this.apiKey !== 'replace-me';
    const hasPhone = this.phone && this.phone !== 'replace-me';

    return {
      configured: hasKey && hasPhone,
      apiKeySet: hasKey,
      phoneSet: hasPhone,
      endpoint: this.endpoint,
      timeout: this.timeout
    };
  }
}

export default CallMeBotAdapter;
