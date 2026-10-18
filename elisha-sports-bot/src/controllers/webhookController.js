import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createMessagingAdapter } from '../providers/messaging/factory.js';
import { processIncomingMessage } from '../services/commandService.js';
import { checkAndConsumeDailyRequest, recordOutgoingMessage, formatQuotaLimitMessage, claimQuotaNotice } from '../services/usageService.js';
import { handlePaymentCommand, isPaymentCommand, isPaymentAdmin, getAdminPhones, getPaymentRequestByReference } from '../services/manualPaymentService.js';

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
async function notifyPaymentAdmins({ provider, sender, reference, transactionId, amount, planLabel, durationDays }) {
  const admins = getAdminPhones();
  if (!admins.length) {
    logger.warn({ reference }, 'Payment transaction received but PAYMENT_ADMIN_PHONES is not configured');
    return;
  }
  const details = '💳 PREMIUM PAYMENT — TRANSACTION ID\nReference: ' + reference +
    '\nCustomer: ' + sender + '\nTransaction ID: ' + transactionId +
    '\nCustomer-selected plan: ' + planLabel +
    '\nExpected amount (verify; not confirmed): UGX ' + Number(amount).toLocaleString('en-UG') +
    '\nAccess duration if approved: ' + durationDays + ' day(s)\nStatus: PENDING — not yet verified\n\nVerify the transaction ID and exact amount in the merchant account before replying: APPROVE ' + reference +
    '\nTo decline it, reply: REJECT ' + reference + '\nFor the grouped queue, reply: PENDING.';
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
        if (message.from && typeof message.text?.body === 'string' && message.text.body.trim()) messages.push({ sender: message.from, text: message.text.body.trim(), type: 'text' });
        else if (message.from && (message.type === 'audio' || message.type === 'image')) messages.push({ sender: message.from, text: '', type: message.type });
      }
    }
  }
  if (!messages.length) return res.sendStatus(200);
  const provider = createMessagingAdapter();
  try {
    for (const message of messages) {
      let reply;
      let paymentNotification = null;
      const adminControlCommand = /^(approve|reject|setplan|changeplan|pending|pendingpayments|payments)(?:\s|$)/i.test(message.text);
      if (message.type === 'audio' || message.type === 'image') {
        if (isPaymentAdmin(message.sender)) {
          reply = '🔐 This number is reserved for payment alerts and admin controls. Use the customer-facing bot number for sports features.';
        } else {
          const quota = await checkAndConsumeDailyRequest(message.sender, message.type === 'audio' ? '[voice note]' : '[image or screenshot]');
          if (!quota.allowed) {
            const period = quota.period === 'month' ? 'month' : 'day';
            if (!(await claimQuotaNotice(message.sender, period))) continue;
            reply = formatQuotaLimitMessage(quota);
          } else {
            reply = message.type === 'audio'
              ? '🎙️ Thanks for the voice note! Voice-message understanding is planned for a future upgrade. For now, please type your football question, for example: “What matches are on today?” or “Arsenal vs Chelsea, who might win?”'
              : '🖼️ Thanks for sharing the image! Image and screenshot analysis is planned for the next upgrade. You can still get help now by typing the match, teams, or statistics shown in the image. I look forward to helping you with image analysis soon!';
          }
        }
        await provider.sendMessage({ to: message.sender, text: reply });
        try { await recordOutgoingMessage(message.sender); }
        catch (usageError) { logger.warn({ error: usageError, phone: message.sender }, 'Could not record outgoing message usage'); }
        continue;
      }
      if (isPaymentAdmin(message.sender) && !adminControlCommand) {
        // Keep the personal admin number out of customer sports flows and quotas.
        reply = '🔐 This number is reserved for payment alerts and admin controls. Use the customer-facing bot number for sports features. Admin commands: PENDING, APPROVE REF, REJECT REF, SETPLAN REF DAY|WEEK|MONTH.';
      } else if (isPaymentCommand(message.text)) {
        reply = await handlePaymentCommand({ phone: message.sender, message: message.text });
        if (reply.startsWith('✅ Transaction ID received. Reference: ')) {
          const ref = reply.match(/Reference:\s*(\d+)/);
          if (ref) {
            // Always build the admin alert from the saved payment record, not by
            // re-parsing customer text; this keeps plan, amount and duration aligned.
            const savedPayment = await getPaymentRequestByReference(ref[1]);
            if (savedPayment) {
              paymentNotification = {
                reference: String(savedPayment.id),
                transactionId: savedPayment.transactionId,
                amount: savedPayment.amountUgx,
                planLabel: savedPayment.planKey.toUpperCase() + ' (' + savedPayment.durationDays + ' day(s))',
                durationDays: savedPayment.durationDays
              };
            }
          }
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
