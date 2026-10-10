import { MessagingProvider } from './messagingProvider.js';
import { env } from '../../config/env.js';

export class WhatsAppCloudProvider extends MessagingProvider {
  constructor({
    accessToken = env.WHATSAPP_TOKEN,
    phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID,
    apiBaseUrl = env.WHATSAPP_API_BASE_URL
  } = {}) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.apiBaseUrl = apiBaseUrl;
  }

  async sendMessage({ to, text }) {
    if (!this.accessToken || this.accessToken === 'replace-me' || !this.phoneNumberId || this.phoneNumberId === 'replace-me') {
      throw new Error('WhatsApp Cloud API credentials are missing. Configure WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
    }

    const url = `${this.apiBaseUrl}/${this.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      })
    });

    if (!response.ok) {
      throw new Error(`WhatsApp Cloud API request failed with status ${response.status}`);
    }

    return { ok: true, provider: 'whatsapp-cloud', to, text };
  }
}

export default WhatsAppCloudProvider;
