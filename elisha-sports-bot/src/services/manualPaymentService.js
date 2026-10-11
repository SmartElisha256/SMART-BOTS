import pool from '../database/pool.js';
import { env } from '../config/env.js';
import { subscribeUser } from './subscriptionService.js';

const memoryPayments = new Map();

export function isPaymentCommand(message) {
  return /^(premium|upgrade|pay|payment|approve)(?:\s|$)/i.test(String(message ?? '').trim());
}

export function getAdminPhones() {
  return String(env.PAYMENT_ADMIN_PHONES ?? '')
    .split(',')
    .map((phone) => phone.trim().replace(/[^0-9]/g, ''))
    .filter(Boolean);
}

export function isPaymentAdmin(phone) {
  const normalized = String(phone ?? '').replace(/[^0-9]/g, '');
  return normalized.length > 0 && getAdminPhones().includes(normalized);
}

export function formatPaymentInstructions() {
  const network = env.MOMO_NETWORK.trim();
  const merchantCode = env.MOMO_MERCHANT_CODE.trim();
  const merchantName = env.MOMO_MERCHANT_NAME.trim();
  const price = env.PREMIUM_PRICE_UGX;

  if (!network || !merchantCode || !merchantName || !price || merchantCode === 'SET_YOUR_MERCHANT_CODE') {
    return '⭐ PREMIUM UPGRADE\n\nManual Mobile Money payments are being set up. Payment instructions are not configured yet. Please contact the bot administrator; do not send money until the official merchant code and price are displayed here.';
  }

  const networkSteps = network.toLowerCase().includes('airtel')
    ? '1. On your Airtel line, dial *185*9# (Airtel Money Pay merchant payments).\n2. Follow the prompts to enter the merchant number/code.\n3. If asked for a payment reference, enter PREMIUM. Enter UGX amount 5000 when prompted.\n4. Before confirming, check the merchant/business name and amount shown on your own phone.\n5. Enter your Mobile Money PIN only on the official Airtel USSD screen to complete payment.'
    : '1. Open your network’s official Mobile Money menu or app.\n2. Choose the official merchant/business payment option and follow its prompts.\n3. Enter the merchant code, reference PREMIUM if requested, and the displayed amount.\n4. Check the business name and amount on your own phone before confirming with your Mobile Money PIN.';

  return `⭐ ELISHA SPORTS BOT — PREMIUM UPGRADE

Price: UGX ${price}
Network: ${network}
Merchant/business name: ${merchantName}
Merchant code: ${merchantCode}

HOW TO PAY
${networkSteps}
Keep the successful transaction confirmation SMS.

SUBMIT PROOF
Reply PAY followed by your transaction ID, for example:
PAY ABC123XYZ

You may also send a screenshot of the successful receipt in this WhatsApp chat. The screenshot must be sent as an image message. If you submit a transaction ID, use the exact ID on the receipt.

IMPORTANT: Proof is only marked PENDING. Premium is not activated automatically. The administrator checks the merchant account and activates Premium only after confirming the payment. Never share your Mobile Money PIN or OTP.`;
}

export async function submitPaymentProof({ phone, transactionId }) {
  const id = String(transactionId ?? '').trim().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9-]{6,80}$/.test(id)) {
    return 'Please send the transaction ID from the successful Mobile Money receipt. Example: PAY ABC123XYZ. Do not send your PIN or OTP.';
  }

  if (pool) {
    const result = await pool.query(
      `INSERT INTO manual_payment_requests (phone, transaction_id, amount_ugx, network, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (transaction_id) DO NOTHING
       RETURNING id`,
      [phone, id, env.PREMIUM_PRICE_UGX, env.MOMO_NETWORK || 'not-configured']
    );
    if (!result.rows[0]) {
      const existing = await pool.query(
        'SELECT phone, status FROM manual_payment_requests WHERE transaction_id = $1',
        [id]
      );
      if (existing.rows[0]?.phone !== phone) {
        return 'That transaction ID has already been submitted. If you believe this is an error, contact the administrator.';
      }
      return `Payment proof already received. Status: ${existing.rows[0]?.status ?? 'pending'}. Please wait while the administrator verifies it.`;
    }
    return `✅ Payment proof received. Reference: ${result.rows[0].id}\nStatus: PENDING VERIFICATION. Your Premium access is not active yet. The administrator will check the merchant account and activate it after confirming the transaction.`;
  }

  const existing = [...memoryPayments.values()].find((item) => item.transactionId === id);
  if (existing) {
    return existing.phone === phone
      ? `Payment proof already received. Status: ${existing.status}.`
      : 'That transaction ID has already been submitted. Contact the administrator if you believe this is an error.';
  }
  const payment = { id: memoryPayments.size + 1, phone, transactionId: id, status: 'pending' };
  memoryPayments.set(payment.id, payment);
  return `✅ Payment proof received. Reference: ${payment.id}\nStatus: PENDING VERIFICATION. Premium is not active yet; the administrator must verify the transaction.`;
}

export async function submitScreenshotProof({ phone, mediaId }) {
  if (!mediaId || typeof mediaId !== 'string') {
    return 'I could not read that image attachment. Please send PAY followed by the transaction ID from your receipt.';
  }
  if (!pool) {
    return 'Screenshot received in WhatsApp. Please also send PAY followed by the transaction ID so it can be tracked. Premium remains inactive until the administrator verifies payment.';
  }
  const result = await pool.query(
    `INSERT INTO manual_payment_requests (phone, screenshot_media_id, amount_ugx, network, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id`,
    [phone, mediaId, env.PREMIUM_PRICE_UGX, env.MOMO_NETWORK || 'not-configured']
  );
  return `🧾 Screenshot proof received. Reference: ${result.rows[0].id}\nStatus: PENDING VERIFICATION. The administrator must review the image in the WhatsApp conversation and confirm the payment in the merchant account before Premium is activated. Keep the transaction ID ready if requested.`;
}

export async function approvePayment({ adminPhone, paymentReference }) {
  if (!isPaymentAdmin(adminPhone)) return '⛔ You are not authorized to approve payments.';
  const ref = Number(paymentReference);
  if (!Number.isSafeInteger(ref) || ref < 1) return 'Usage: APPROVE PAYMENT_REFERENCE_NUMBER';

  let payment;
  if (pool) {
    const result = await pool.query(
      'SELECT * FROM manual_payment_requests WHERE id = $1 AND status = \'pending\' LIMIT 1',
      [ref]
    );
    payment = result.rows[0];
  } else {
    payment = memoryPayments.get(ref);
    if (payment?.status !== 'pending') payment = null;
  }
  if (!payment) return 'No pending payment found for that reference. Check the reference number and payment status.';

  // Only run after the administrator has checked the actual merchant account.
  await subscribeUser({ phone: payment.phone, plan: 'premium' });
  if (pool) {
    await pool.query(
      `UPDATE manual_payment_requests
          SET status = 'approved', reviewed_by = $2, reviewed_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [ref, String(adminPhone)]
    );
  } else {
    payment.status = 'approved';
  }
  return `✅ Premium activated for ${payment.phone}. Payment reference: ${ref}. This command must only be used after confirming the payment in the merchant account.`;
}

export async function handlePaymentCommand({ phone, message }) {
  const trimmed = String(message ?? '').trim();
  const [command, ...rest] = trimmed.split(/\s+/);
  const args = rest.join(' ').trim();

  if (/^(premium|upgrade|payment)$/i.test(command)) return formatPaymentInstructions();
  if (/^pay$/i.test(command)) {
    if (!args) return 'To submit proof, reply PAY YOUR_TRANSACTION_ID. Example: PAY ABC123XYZ. Never share your Mobile Money PIN or OTP.';
    return submitPaymentProof({ phone, transactionId: args });
  }
  if (/^approve$/i.test(command)) {
    const match = args.match(/^(?:payment\s+)?(\d+)$/i);
    if (!match) return 'Admin usage: APPROVE PAYMENT_REFERENCE_NUMBER';
    return approvePayment({ adminPhone: phone, paymentReference: match[1] });
  }
  return null;
}
