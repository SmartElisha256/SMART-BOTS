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

  return `⭐ ELISHA SPORTS BOT — PREMIUM UPGRADE

Price: UGX ${price}
Network: ${network}
Merchant/business name: ${merchantName}
Merchant code: ${merchantCode}

HOW TO PAY
1. Open your network's official Mobile Money menu on your phone (USSD or Mobile Money app).
2. Choose the merchant/business payment option shown by your network.
3. Enter merchant code ${merchantCode} and confirm the business name is "${merchantName}".
4. Enter exactly UGX ${price}. Review the name and amount carefully before confirming with your Mobile Money PIN.
5. Keep the successful transaction confirmation.

SUBMIT PAYMENT PROOF
Reply: PAY YOUR_TRANSACTION_ID
Example: PAY ABC123XYZ

You may also send your payment screenshot to this WhatsApp chat, but a transaction ID is the fastest way for us to locate the payment. Premium is NOT activated automatically. The administrator checks the merchant account and activates it after confirming payment. Never share your Mobile Money PIN or OTP.`;
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

export async function approvePayment({ adminPhone, paymentReference }) {
  if (!isPaymentAdmin(adminPhone)) {
    return '⛔ You are not authorized to approve payments.';
  }
  const ref = Number(paymentReference);
  if (!Number.isSafeInteger(ref) || ref < 1) {
    return 'Usage: APPROVE PAYMENT_REFERENCE_NUMBER';
  }

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
  // Only run this command after the administrator has checked the actual merchant account.
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

  return `✅ Premium activated for ${payment.phone}. Payment reference: ${ref}. Make sure you have independently confirmed the transaction in the merchant account.`;
}

export async function handlePaymentCommand({ phone, message }) {
  const trimmed = String(message ?? '').trim();
  const [command, ...rest] = trimmed.split(/\s+/);
  const args = rest.join(' ').trim();

  if (/^(premium|upgrade|payment)$/i.test(command)) {
    return formatPaymentInstructions();
  }
  if (/^pay$/i.test(command)) {
    if (!args) return 'To submit payment proof, reply: PAY YOUR_TRANSACTION_ID. Example: PAY ABC123XYZ. Never share your Mobile Money PIN or OTP.';
    return submitPaymentProof({ phone, transactionId: args });
  }
  if (/^approve$/i.test(command)) {
    const match = args.match(/^(?:payment\s+)?(\d+)$/i);
    if (!match) return 'Admin usage: APPROVE PAYMENT_REFERENCE_NUMBER';
    return approvePayment({ adminPhone: phone, paymentReference: match[1] });
  }
  return null;
}
