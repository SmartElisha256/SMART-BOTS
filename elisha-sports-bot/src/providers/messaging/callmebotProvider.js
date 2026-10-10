import { MessagingProvider } from './messagingProvider.js';
import { env } from '../../config/env.js';

export class CallMeBotProvider extends MessagingProvider {
  constructor({ baseUrl = env.CALLMEBOT_API_URL, token = env.CALLMEBOT_TOKEN } = {}) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async sendMessage({ to, text }) {
    if (!this.token || this.token === 'replace-me') {
      throw new Error('CallMeBot is not configured. Set CALLMEBOT_TOKEN in environment variables.');
    }

    // CallMeBot does not support public multi-user inbound WhatsApp messaging or arbitrary target management in the same way as a full WhatsApp Business API.
    // This integration is limited to configured one-to-one outbound messaging flows and requires explicit setup.
    const url = new URL(this.baseUrl);
    url.searchParams.set('phone', to);
    url.searchParams.set('text', text);
    url.searchParams.set('apikey', this.token);

    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`CallMeBot request failed with status ${response.status}`);
    }

    return { ok: true, provider: 'callmebot', url: url.toString() };
  }
}

export default CallMeBotProvider;
