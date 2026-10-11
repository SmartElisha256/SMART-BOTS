import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createMessagingAdapter } from '../providers/messaging/factory.js';
import { processIncomingMessage } from '../services/commandService.js';
import { checkAndConsumeDailyRequest, recordOutgoingMessage, formatQuotaLimitMessage, claimQuotaNotice, claimCommandCooldown } from '../services/usageService.js';
import { handlePaymentCommand, isPaymentCommand, getAdminPhones } from '../services/manualPaymentService.js';

function safeEqualText(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
export function handleVerifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && safeEqualText(token, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN !== 'replace-me') return res.status(200).type('text/plain').send(String(challenge ?? ''));
  return res.status(403).json({ ok: false, message: 'Webhook verification failed' });
}
function validSignature(req) {
  if (!env.WHATSAPP_APP_SECRET || env.WHATSAPP_APP_SECRET === 'replace-me') return env.NODE_ENV !== 'production';
  const signature = req.get('x-hub-signature-256');
  if (!signature?.startsWith('sha256=') || !req.rawBody) return false;
  const expected = 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(req.rawBody).digest('hex');
  return safeEqualText(signature, expected);
}
async function notifyPaymentAdmins({ provider, sender, reference, transactionId, amount, durationDays }) {
  const admins = getAdminPhones();
  if (!admins.length) {
    logger.warn({ reference }, 'Payment transaction received but PAYMENT_ADMIN_PHONES is not configured');
    return;
  }
  const details = '💳 PREMIUM PAYMENT — TRANSACTION ID\nReference: ' + reference +
    '\nCustomer: ' + sender + '\nTransaction ID: ' + transactionId +
    '\nExpected amount: UGX ' + Number(amount).toLocaleString('en-UG') +
    '\nAccess duration: ' + durationDays + ' day(s)\n\nVerify this transaction in the merchant account before replying: APPROVE ' + reference +
    '\nTo decline it, reply: REJECT ' + reference;
  for (const admin of admins) {
    try { await provider.sendMessage({ to: admin, text: details }); }
    catch (error) { logger.error({ error, admin, reference }, 'Could not notify payment administrator'); }
  }
}
export async function handleIncomingWebhook(req, res) {
  if (!validSignature(req)) return res.status(401).json({ ok: false, message: 'Invalid webhook signature' });
  const entries = req.body?.entry ?? [];
  const messages = [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.from && typeof message.text?.body === 'string' && message.text.body.trim()) messages.push({ sender: message.from, text: message.text.body.trim() });
      }
    }
  }
  if (!messages.length) return res.sendStatus(200);
  const provider = createMessagingAdapter();
  try {
    for (const message of messages) {
      const utilityCommand = String(message.text ?? '').trim().split(/\s+/, 1)[0].toLowerCase();
      if (['help', 'menu', 'upgrade'].includes(utilityCommand)) {
        try {
          // Ignore repeated utility commands for 30 seconds without sending a reply.
          if (!(await claimCommandCooldown(message.sender, utilityCommand))) continue;
        } catch (cooldownError) {
          logger.warn({ error: cooldownError, phone: message.sender, command: utilityCommand }, 'Could not enforce utility-command cooldown');
        }
      }
      let reply;
      let paymentNotification = null;
      if (isPaymentCommand(message.text)) {
        reply = await handlePaymentCommand({ phone: message.sender, message: message.text });
        if (reply.startsWith('✅ Transaction ID received. Reference: ')) {
          const ref = reply.match(/Reference:\s*(\d+)/);
          const tx = message.text.match(/^PAY\s+(?:(DAY|WEEK|MONTH)\s+)?(.+)$/i);
          const planKey = tx?.[1]?.toLowerCase() || 'week';
          const price = planKey === 'day' ? env.PREMIUM_PRICE_DAY_UGX : planKey === 'month' ? env.PREMIUM_PRICE_MONTH_UGX : (env.PREMIUM_PRICE_WEEK_UGX ?? env.PREMIUM_PRICE_UGX);
          const durationDays = planKey === 'day' ? 1 : planKey === 'month' ? 30 : 7;
          if (ref) paymentNotification = { reference: ref[1], transactionId: tx?.[2]?.trim(), amount: price, durationDays };
        }
      } else {
        const quota = await checkAndConsumeDailyRequest(message.sender, message.text);
        if (!quota.allowed) {
          const period = quota.period === 'month' ? 'month' : 'day';
          // Once the user has received this period's limit notice, stop replying
          // to repeated over-limit commands to avoid unnecessary WhatsApp charges.
          if (!(await claimQuotaNotice(message.sender, period))) continue;
          reply = formatQuotaLimitMessage(quota);
        } else {
          reply = await processIncomingMessage({ sender: message.sender, message: message.text, provider: 'whatsapp' });
        }
      }
      await provider.sendMessage({ to: message.sender, text: reply || 'I could not process that message. Send HELP for available commands.' });
      try { await recordOutgoingMessage(message.sender); }
      catch (usageError) { logger.warn({ error: usageError, phone: message.sender }, 'Could not record outgoing message usage'); }
      if (paymentNotification) await notifyPaymentAdmins({ provider, sender: message.sender, ...paymentNotification });
    }
    return res.sendStatus(200);
  } catch (error) {
    logger.error({ error, requestId: req.id }, 'WhatsApp webhook processing failed');
    return res.status(500).json({ ok: false, message: 'Webhook processing failed; retry later' });
  }
}
