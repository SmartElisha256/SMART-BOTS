import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createMessagingAdapter } from '../providers/messaging/factory.js';
import { processIncomingMessage } from '../services/commandService.js';
import { checkAndConsumeDailyRequest, recordOutgoingMessage, formatQuotaLimitMessage } from '../services/usageService.js';
import {
  handlePaymentCommand,
  isPaymentCommand,
  submitScreenshotProof,
  getAdminPhones
} from '../services/manualPaymentService.js';

function safeEqualText(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function handleVerifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && safeEqualText(token, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN !== 'replace-me') {
    return res.status(200).type('text/plain').send(String(challenge ?? ''));
  }
  return res.status(403).json({ ok: false, message: 'Webhook verification failed' });
}

function validSignature(req) {
  if (!env.WHATSAPP_APP_SECRET || env.WHATSAPP_APP_SECRET === 'replace-me') return env.NODE_ENV !== 'production';
  const signature = req.get('x-hub-signature-256');
  if (!signature?.startsWith('sha256=') || !req.rawBody) return false;
  const expected = 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(req.rawBody).digest('hex');
  return safeEqualText(signature, expected);
}

async function notifyPaymentAdmins({ provider, sender, reference, proofType, transactionId, mediaId }) {
  const admins = getAdminPhones();
  if (!admins.length) {
    logger.warn({ reference }, 'Payment proof received but PAYMENT_ADMIN_PHONES is not configured');
    return;
  }

  const details = '💳 PREMIUM PAYMENT PROOF\n' +
    'Reference: ' + reference + '\n' +
    'Customer: ' + sender + '\n' +
    'Proof: ' + proofType +
    (transactionId ? '\nTransaction ID: ' + transactionId : '') + '\n' +
    'Amount expected: UGX ' + Number(env.PREMIUM_PRICE_UGX).toLocaleString('en-UG') + '\n\n' +
    'Verify the transaction in the merchant account before replying: APPROVE ' + reference +
    '\nTo decline the proof, reply: REJECT ' + reference;

  for (const admin of admins) {
    try {
      await provider.sendMessage({ to: admin, text: details });
      if (mediaId && typeof provider.sendImageById === 'function') {
        await provider.sendImageById({
          to: admin,
          mediaId,
          caption: 'Receipt screenshot for payment reference ' + reference + ' from ' + sender
        });
      } else if (mediaId) {
        await provider.sendMessage({
          to: admin,
          text: 'The configured messaging provider cannot relay receipt images. Media ID: ' + mediaId +
            '. Review the original receipt in the business inbox before approving.'
        });
      }
    } catch (error) {
      logger.error({ error, admin, reference }, 'Could not notify payment administrator');
    }
  }
}

export async function handleIncomingWebhook(req, res) {
  if (!validSignature(req)) return res.status(401).json({ ok: false, message: 'Invalid webhook signature' });

  const entries = req.body?.entry ?? [];
  const messages = [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        if (!message.from) continue;
        const text = message.text?.body;
        if (typeof text === 'string' && text.trim()) {
          messages.push({ sender: message.from, type: 'text', text: text.trim() });
        } else if (message.type === 'image' && typeof message.image?.id === 'string') {
          messages.push({ sender: message.from, type: 'image', mediaId: message.image.id });
        }
      }
    }
  }
  if (!messages.length) return res.sendStatus(200);

  const provider = createMessagingAdapter();
  try {
    for (const message of messages) {
      let reply;
      let paymentNotification = null;

      if (message.type === 'image') {
        reply = await submitScreenshotProof({ phone: message.sender, mediaId: message.mediaId });
        if (reply.startsWith('🧾 Screenshot proof received. Reference: ')) {
          const match = reply.match(/Reference:\s*(\d+)/);
          if (match) paymentNotification = {
            reference: match[1], proofType: 'receipt screenshot', mediaId: message.mediaId
          };
        }
      } else if (isPaymentCommand(message.text)) {
        reply = await handlePaymentCommand({ phone: message.sender, message: message.text });
        if (reply.startsWith('✅ Payment proof received. Reference: ')) {
          const match = reply.match(/Reference:\s*(\d+)/);
          const transactionMatch = message.text.match(/^PAY\s+(.+)$/i);
          if (match) paymentNotification = {
            reference: match[1], proofType: 'transaction ID',
            transactionId: transactionMatch?.[1]?.trim()
          };
        }
      } else {
        const quota = await checkAndConsumeDailyRequest(message.sender, message.text);
        reply = quota.allowed
          ? await processIncomingMessage({ sender: message.sender, message: message.text, provider: 'whatsapp' })
          : formatQuotaLimitMessage(quota);
      }

      await provider.sendMessage({ to: message.sender, text: reply || 'I could not process that message. Send HELP for available commands.' });
      try {
        await recordOutgoingMessage(message.sender);
      } catch (usageError) {
        logger.warn({ error: usageError, phone: message.sender }, 'Could not record outgoing message usage');
      }

      if (paymentNotification) {
        await notifyPaymentAdmins({
          provider,
          sender: message.sender,
          ...paymentNotification
        });
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    logger.error({ error, requestId: req.id }, 'WhatsApp webhook processing failed');
    return res.status(500).json({ ok: false, message: 'Webhook processing failed; retry later' });
  }
}
