import { createMessagingAdapter } from '../providers/messaging/factory.js';
import { logger } from '../utils/logger.js';

export async function notifyCustomerPaymentApproved({ phone, durationDays, reference }) {
  if (!phone) return;
  try {
    const provider = createMessagingAdapter();
    await provider.sendMessage({
      to: phone,
      text:
        '✅ PREMIUM ACTIVATED\n\n' +
        'Your payment was verified (ref ' + reference + ').\n' +
        'Access duration: ' + durationDays + ' day(s).\n\n' +
        'Try: ANALYZE Arsenal vs Chelsea\nOr: SEASON Premier League 2023\n\nReply MENU anytime. Enjoy ELISHA SPORTS BOT.'
    });
  } catch (error) {
    logger.error({ error, phone, reference }, 'Could not notify customer of approval');
  }
}

export async function notifyCustomerPaymentRejected({ phone, reference }) {
  if (!phone) return;
  try {
    const provider = createMessagingAdapter();
    await provider.sendMessage({
      to: phone,
      text:
        '❌ PAYMENT NOT VERIFIED\n\n' +
        'Reference ' + reference + ' was not approved. Premium was not activated.\n' +
        'If you paid, double-check the transaction ID and amount, then reply UPGRADE and submit again.\n' +
        'Never share your Mobile Money PIN or OTP.'
    });
  } catch (error) {
    logger.error({ error, phone, reference }, 'Could not notify customer of rejection');
  }
}
