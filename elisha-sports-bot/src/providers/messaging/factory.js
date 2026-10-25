import { env } from '../../config/env.js';
import { MockMessagingAdapter } from './mockMessagingAdapter.js';
import { WhatsAppCloudProvider } from './whatsappCloudProvider.js';

export function createMessagingAdapter(provider = env.MESSAGING_PROVIDER) {
  switch (provider) {
    case 'mock':
      return new MockMessagingAdapter({ enabled: true });
    case 'whatsapp-cloud':
      return new WhatsAppCloudProvider();
    default:
      throw new Error(
        `Unsupported messaging provider: ${provider}. Use "mock" or "whatsapp-cloud".`
      );
  }
}

export function getAvailableProviders() {
  return ['mock', 'whatsapp-cloud'];
}
