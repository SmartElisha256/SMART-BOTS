import { MessagingProvider } from './messagingProvider.js';

export class MockMessagingProvider extends MessagingProvider {
  async sendMessage({ to, text }) {
    return {
      ok: true,
      provider: 'mock',
      to,
      text,
      message: 'Mock provider accepted the outbound message.'
    };
  }
}

export default MockMessagingProvider;
