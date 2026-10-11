import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createMessagingAdapter } from '../providers/messaging/factory.js';
import { processIncomingMessage } from '../services/commandService.js';
import { checkAndConsumeDailyRequest, recordOutgoingMessage, formatQuotaLimitMessage } from '../services/usageService.js';

function safeEqualText(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function handleVerifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && safeEqualText(token, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) &&
      env.WHATSAPP_WEBHOOK_VERIFY_TOKEN !== 'replace-me') {
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

export async function handleIncomingWebhook(req, res) {
  if (!validSignature(req)) {
    return res.status(401).json({ ok: false, message: 'Invalid webhook signature' });
  }

  const entries = req.body?.entry ?? [];
  const messages = [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        const text = message.text?.body;
        if (message.from && typeof text === 'string' && text.trim()) {
          messages.push({ sender: message.from, text: text.trim() });
        }
      }
    }
  }

  // Meta sends delivery/status callbacks too; acknowledge callbacks with no user text.
  if (!messages.length) return res.sendStatus(200);

  const provider = createMessagingAdapter();
  try {
    for (const message of messages) {
      const quota = await checkAndConsumeDailyRequest(message.sender, message.text);
      const reply = quota.allowed
        ? await processIncomingMessage({
            sender: message.sender,
            message: message.text,
            provider: 'whatsapp'
          })
        : formatQuotaLimitMessage(quota);

      await provider.sendMessage({ to: message.sender, text: reply });
      try {
        await recordOutgoingMessage(message.sender);
      } catch (usageError) {
        // Message delivery should not be reported as failed just because analytics failed.
        logger.warn({ error: usageError, phone: message.sender }, 'Could not record outgoing message usage');
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    logger.error({ error, requestId: req.id }, 'WhatsApp webhook processing failed');
    return res.status(500).json({ ok: false, message: 'Webhook processing failed; retry later' });
  }
}
