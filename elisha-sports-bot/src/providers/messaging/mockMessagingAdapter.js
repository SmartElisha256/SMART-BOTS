import { z } from 'zod';
import { logger } from '../../utils/logger.js';

const mockConfigSchema = z.object({
  enabled: z.boolean().default(true)
});

export class MockMessagingAdapter {
  constructor(config = {}) {
    const finalConfig = mockConfigSchema.parse(config);
    this.enabled = finalConfig.enabled;
    this.sentMessages = [];
  }

  async sendMessage({ to, text }) {
    if (!to || typeof to !== 'string') {
      throw new Error('Target phone number (to) is required and must be a string.');
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Message text is required and must be a string.');
    }

    const message = {
      id: `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      to,
      text,
      timestamp: new Date().toISOString()
    };

    this.sentMessages.push(message);

    logger.info(
      { to, messageLength: text.length, messageId: message.id },
      'Mock message sent'
    );

    return {
      ok: true,
      provider: 'mock',
      to,
      messageLength: text.length,
      messageId: message.id,
      message: 'Mock adapter accepted the outbound message.'
    };
  }

  getConfigStatus() {
    return {
      configured: this.enabled,
      provider: 'mock',
      messageCount: this.sentMessages.length
    };
  }

  getSentMessages() {
    return [...this.sentMessages];
  }

  clearSentMessages() {
    this.sentMessages = [];
  }
}

export default MockMessagingAdapter;
