export class MessagingProvider {
  async sendMessage({ to, text }) {
    throw new Error('Messaging provider must implement sendMessage()');
  }
}
