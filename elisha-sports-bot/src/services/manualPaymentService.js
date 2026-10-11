import pool from '../database/pool.js';
import { env } from '../config/env.js';
import { subscribeUser } from './subscriptionService.js';

const memoryPayments = new Map();

export function isPaymentCommand(message) {
  return /^(premium|upgrade|pay|payment|approve|reject)(?:\s|$)/i.test(String(message ?? '').trim());
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
  const network = String(env.MOMO_NETWORK ?? '').trim();
  const merchantCode = String(env.MOMO_MERCHANT_CODE ?? '').trim();
  const merchantName = String(env.MOMO_MERCHANT_NAME ?? '').trim();
  const price = Number(env.PREMIUM_PRICE_UGX);

  if (!network || !merchantCode || !merchantName || !Number.isInteger(price) || price <= 0 || merchantCode === 'SET_YOUR_MERCHANT_CODE') {
    return '⭐ PREMIUM UPGRADE\n\nManual Mobile Money payments are being set up. Payment instructions are not configured yet. Please contact the bot administrator; do not send money until the official merchant code and price are displayed here.';
  }

  const networkSteps = network.toLowerCase().includes('airtel')
    ? '1. On your Airtel line, dial *185*9# (Airtel Money Pay merchant payments).\n2. Follow the prompts to enter the merchant number/code.\n3. If asked for a payment reference, enter PREMIUM. Enter UGX ' + price + ' when prompted.\n4. Before confirming, check the merchant/business name and amount shown on your phone.\n5. Enter your Mobile Money PIN only on the official Airtel USSD screen to complete payment.'
    : '1. Open your network’s official Mobile Money menu or app.\n2. Choose the official merchant/business payment option and follow its prompts.\n3. Enter the merchant code, reference PREMIUM if requested, and the displayed amount.\n4. Check the business name and amount on your phone before confirming with your Mobile Money PIN.';

  return '⭐ ELISHA SPORTS BOT — PREMIUM UPGRADE\n\n' +
    'Price: UGX ' + price.toLocaleString('en-UG') + '\n' +
    'Network: ' + network + '\n' +
    'Merchant/business name: ' + merchantName + '\n' +
    'Merchant code: ' + merchantCode + '\n\n' +
    'HOW TO PAY\n' + networkSteps + '\n\n' +
    'SUBMIT PROOF\n' +
    'Reply PAY followed by your transaction ID, for example:\nPAY ABC123XYZ\n\n' +
    'You may also send a screenshot of the successful receipt in this WhatsApp chat. The screenshot is recorded as pending proof.\n\n' +
    'IMPORTANT: Proof is not payment verification. Premium is not activated automatically. The administrator checks the merchant account and activates Premium only after confirming the payment. Never share your Mobile Money PIN or OTP.';
}

export async function submitPaymentProof({ phone, transactionId }) {
  const id = String(transactionId ?? '').trim().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9-]{6,80}$/.test(id)) {
    return 'Please send the transaction ID from the successful Mobile Money receipt. Example: PAY ABC123XYZ. Do not send your PIN or OTP.';
  }

  if (pool) {
    const result = await pool.query(
      "INSERT INTO manual_payment_requests (phone, transaction_id, amount_ugx, network, status) " +
      "VALUES ($1, $2, $3, $4, 'pending') " +
      'ON CONFLICT (transaction_id) DO NOTHING RETURNING id',
      [phone, id, env.PREMIUM_PRICE_UGX, env.MOMO_NETWORK || 'not-configured']
    );
    if (!result.rows[0]) {
      const existing = await pool.query(
        'SELECT phone, status, id FROM manual_payment_requests WHERE transaction_id = $1',
        [id]
      );
      if (existing.rows[0]?.phone !== phone) {
        return 'That transaction ID has already been submitted. If you believe this is an error, contact the administrator.';
      }
      return 'Payment proof already received. Reference: ' + existing.rows[0].id +
        '. Status: ' + (existing.rows[0]?.status ?? 'pending') +
        '. Please wait while the administrator verifies it.';
    }
    return '✅ Payment proof received. Reference: ' + result.rows[0].id +
      '\nStatus: PENDING VERIFICATION. Your Premium access is not active yet. The administrator will check the merchant account and activate it after confirming the transaction.';
  }

  const existing = [...memoryPayments.values()].find((item) => item.transactionId === id);
  if (existing) {
    return existing.phone === phone
      ? 'Payment proof already received. Reference: ' + existing.id + '. Status: ' + existing.status + '.'
      : 'That transaction ID has already been submitted. Contact the administrator if you believe this is an error.';
  }
  const payment = { id: memoryPayments.size + 1, phone, transactionId: id, status: 'pending' };
  memoryPayments.set(payment.id, payment);
  return '✅ Payment proof received. Reference: ' + payment.id +
    '\nStatus: PENDING VERIFICATION. Premium is not active yet; the administrator must verify the transaction.';
}

export async function submitScreenshotProof({ phone, mediaId }) {
  if (!mediaId || typeof mediaId !== 'string') {
    return 'I could not read that image attachment. Please send PAY followed by the transaction ID from your receipt.';
  }
  if (!pool) {
    const existing = [...memoryPayments.values()].find((item) => item.screenshotMediaId === mediaId);
    if (existing) {
      return existing.phone === phone
        ? 'Screenshot proof already received. Reference: ' + existing.id + '. Status: ' + existing.status + '.'
        : 'That screenshot has already been submitted. Contact the administrator if you believe this is an error.';
    }
    const payment = {
      id: memoryPayments.size + 1,
      phone,
      screenshotMediaId: mediaId,
      status: 'pending'
    };
    memoryPayments.set(payment.id, payment);
    return '🧾 Screenshot proof received. Reference: ' + payment.id +
      '\nStatus: PENDING VERIFICATION. Premium remains inactive until the administrator verifies the payment.';
  }

  const result = await pool.query(
    "INSERT INTO manual_payment_requests (phone, screenshot_media_id, amount_ugx, network, status) " +
    "VALUES ($1, $2, $3, $4, 'pending') " +
    'ON CONFLICT (screenshot_media_id) WHERE screenshot_media_id IS NOT NULL DO NOTHING RETURNING id',
    [phone, mediaId, env.PREMIUM_PRICE_UGX, env.MOMO_NETWORK || 'not-configured']
  );
  if (!result.rows[0]) {
    const existing = await pool.query(
      'SELECT phone, status, id FROM manual_payment_requests WHERE screenshot_media_id = $1',
      [mediaId]
    );
    if (existing.rows[0]?.phone !== phone) {
      return 'That screenshot has already been submitted. Contact the administrator if you believe this is an error.';
    }
    return 'Screenshot proof already received. Reference: ' + existing.rows[0].id +
      '. Status: ' + existing.rows[0].status + '.';
  }
  return '🧾 Screenshot proof received. Reference: ' + result.rows[0].id +
    '\nStatus: PENDING VERIFICATION. The administrator must review the receipt and confirm the payment in the merchant account before Premium is activated.';
}

export async function approvePayment({ adminPhone, paymentReference }) {
  if (!isPaymentAdmin(adminPhone)) return '⛔ You are not authorized to approve payments.';
  const ref = Number(paymentReference);
  if (!Number.isSafeInteger(ref) || ref < 1) return 'Usage: APPROVE PAYMENT_REFERENCE_NUMBER';

  let payment;
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        "SELECT * FROM manual_payment_requests WHERE id = $1 AND status = 'pending' FOR UPDATE",
        [ref]
      );
      payment = result.rows[0];
      if (!payment) {
        await client.query('ROLLBACK');
        return 'No pending payment found for that reference. Check the reference number and payment status.';
      }
      await client.query(
        'INSERT INTO subscriptions (phone, plan, is_active) VALUES ($1, $2, TRUE) ' +
        'ON CONFLICT (phone, plan) DO UPDATE SET is_active = TRUE, updated_at = NOW()',
        [payment.phone, 'premium']
      );
      await client.query(
        "UPDATE manual_payment_requests SET status = 'approved', reviewed_by = $2, reviewed_at = NOW() WHERE id = $1",
        [ref, String(adminPhone)]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } else {
    payment = memoryPayments.get(ref);
    if (!payment || payment.status !== 'pending') {
      return 'No pending payment found for that reference. Check the reference number and payment status.';
    }
    await subscribeUser({ phone: payment.phone, plan: 'premium' });
    payment.status = 'approved';
    payment.reviewedBy = String(adminPhone);
  }

  return '✅ Premium activated for ' + payment.phone + '. Payment reference: ' + ref +
    '. Only use this command after confirming the payment in the merchant account.';
}

export async function rejectPayment({ adminPhone, paymentReference }) {
  if (!isPaymentAdmin(adminPhone)) return '⛔ You are not authorized to reject payments.';
  const ref = Number(paymentReference);
  if (!Number.isSafeInteger(ref) || ref < 1) return 'Usage: REJECT PAYMENT_REFERENCE_NUMBER';

  if (pool) {
    const result = await pool.query(
      "UPDATE manual_payment_requests SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW() " +
      "WHERE id = $1 AND status = 'pending' RETURNING phone",
      [ref, String(adminPhone)]
    );
    if (!result.rows[0]) return 'No pending payment found for that reference.';
    return 'Payment reference ' + ref + ' was rejected. Premium was not activated for ' + result.rows[0].phone + '.';
  }

  const payment = memoryPayments.get(ref);
  if (!payment || payment.status !== 'pending') return 'No pending payment found for that reference.';
  payment.status = 'rejected';
  payment.reviewedBy = String(adminPhone);
  return 'Payment reference ' + ref + ' was rejected. Premium was not activated for ' + payment.phone + '.';
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
  if (/^reject$/i.test(command)) {
    const match = args.match(/^(?:payment\s+)?(\d+)$/i);
    if (!match) return 'Admin usage: REJECT PAYMENT_REFERENCE_NUMBER';
    return rejectPayment({ adminPhone: phone, paymentReference: match[1] });
  }
  return null;
}
