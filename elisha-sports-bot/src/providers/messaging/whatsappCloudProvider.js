import { MessagingProvider } from './messagingProvider.js';
import { env } from '../../config/env.js';

export class WhatsAppCloudProvider extends MessagingProvider {
  constructor({
    accessToken = env.WHATSAPP_TOKEN,
    phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID,
    apiBaseUrl = env.WHATSAPP_API_BASE_URL
  } = {}) {
    super();
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  async sendMessage({ to, text }) {
    if (!to || typeof to !== 'string') throw new Error('Target phone number (to) is required.');
    if (!text || typeof text !== 'string' || !text.trim()) throw new Error('Message text is required.');
    if (!this.accessToken || this.accessToken === 'replace-me' || !this.phoneNumberId || this.phoneNumberId === 'replace-me') {
      throw new Error('WhatsApp Cloud API credentials are missing. Configure WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
    }

    const response = await fetch(`${this.apiBaseUrl}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text.trim() }
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`WhatsApp Cloud API request failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const data = await response.json().catch(() => ({}));
    return { ok: true, provider: 'whatsapp-cloud', to, messageId: data.messages?.[0]?.id ?? null };
  }

  getConfigStatus() {
    const tokenSet = Boolean(this.accessToken && this.accessToken !== 'replace-me');
    const phoneNumberIdSet = Boolean(this.phoneNumberId && this.phoneNumberId !== 'replace-me');
    return { configured: tokenSet && phoneNumberIdSet, provider: 'whatsapp-cloud', tokenSet, phoneNumberIdSet, endpoint: this.apiBaseUrl };
  }
}

export default WhatsAppCloudProvider;
