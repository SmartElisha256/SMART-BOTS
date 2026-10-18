import pool from '../database/pool.js';
import { env } from '../config/env.js';
import { subscribeUser } from './subscriptionService.js';

const memoryPayments = new Map();

export const PREMIUM_PLANS = Object.freeze({
  day: { label: '1 day', durationDays: 1, price: Number(env.PREMIUM_PRICE_DAY_UGX) },
  week: { label: '1 week', durationDays: 7, price: Number(env.PREMIUM_PRICE_WEEK_UGX ?? env.PREMIUM_PRICE_UGX) },
  month: { label: '1 month (30 days)', durationDays: 30, price: Number(env.PREMIUM_PRICE_MONTH_UGX) }
});

export function isPaymentCommand(message) {
  return /^(premium|upgrade|pay|payment|approve|reject|setplan|changeplan|pending|pendingpayments|payments)(?:\s|$)/i.test(String(message ?? '').trim());
}
export function getAdminPhones() {
  return String(env.PAYMENT_ADMIN_PHONES ?? '').split(',').map((phone) => phone.trim().replace(/[^0-9]/g, '')).filter(Boolean);
}
export function isPaymentAdmin(phone) {
  const normalized = String(phone ?? '').replace(/[^0-9]/g, '');
  return normalized.length > 0 && getAdminPhones().includes(normalized);
}
function validPlan(plan) {
  return Boolean(plan && Number.isInteger(plan.price) && plan.price > 0 && Number.isInteger(plan.durationDays));
}

export function formatPaymentInstructions() {
  const network = String(env.MOMO_NETWORK ?? '').trim();
  const merchantCode = String(env.MOMO_MERCHANT_CODE ?? '').trim();
  const merchantName = String(env.MOMO_MERCHANT_NAME ?? '').trim();
  if (!network || !merchantCode || !merchantName || !Object.values(PREMIUM_PLANS).every(validPlan) || merchantCode === 'SET_YOUR_MERCHANT_CODE') {
    return '⭐ PREMIUM UPGRADE\n\nManual Mobile Money payments are being set up. Do not send money until the official merchant code and prices are displayed here.';
  }
  const networkSteps = network.toLowerCase().includes('airtel')
    ? '1. On your Airtel line, dial *185*9#.\n2. Follow the prompts to enter the merchant number/code.\n3. Enter the exact amount for your selected plan. If asked for a reference, enter ELISHA PREMIUM.\n4. Verify the displayed business name and amount before confirming.\n5. Enter your PIN only on the official Airtel USSD screen.'
    : '1. Open your network’s official Mobile Money menu or app.\n2. Choose the official merchant payment option and follow the prompts.\n3. Enter the exact amount for your selected plan and reference ELISHA PREMIUM if requested.\n4. Verify the business name and amount before confirming with your PIN.';
  return '⭐ ELISHA SPORTS BOT — PREMIUM ACCESS\n\n' +
    'Choose a plan:\n• DAY — UGX ' + PREMIUM_PLANS.day.price.toLocaleString('en-UG') + ' for 1 day\n' +
    '• WEEK — UGX ' + PREMIUM_PLANS.week.price.toLocaleString('en-UG') + ' for 7 days\n' +
    '• MONTH — UGX ' + PREMIUM_PLANS.month.price.toLocaleString('en-UG') + ' for 30 days\n\n' +
    'Network: ' + network + '\nMerchant/business name: ' + merchantName + '\nMerchant code: ' + merchantCode +
    '\n\nHOW TO PAY\n' + networkSteps +
    '\n\nSUBMIT TRANSACTION ID ONLY\nAfter paying, send:\nPAY DAY YOUR_TRANSACTION_ID\nPAY WEEK YOUR_TRANSACTION_ID\nPAY MONTH YOUR_TRANSACTION_ID\nExample: PAY WEEK ABC123XYZ\n\n' +
    'Access stays pending until the administrator confirms the transaction in the merchant account. Never share your Mobile Money PIN or OTP.';
}

function planKeyForDuration(durationDays) {
  return Number(durationDays) === 1 ? 'day' : Number(durationDays) === 30 ? 'month' : 'week';
}

export async function getPaymentRequestByReference(paymentReference) {
  const ref = Number(paymentReference);
  if (!Number.isSafeInteger(ref) || ref < 1) return null;
  if (pool) {
    const result = await pool.query(
      'SELECT id, phone, transaction_id, amount_ugx, plan_duration_days, status FROM manual_payment_requests WHERE id = $1',
      [ref]
    );
    const row = result.rows[0];
    if (!row) return null;
    const key = planKeyForDuration(row.plan_duration_days);
    return {
      id: Number(row.id), phone: row.phone, transactionId: row.transaction_id,
      amountUgx: Number(row.amount_ugx), durationDays: Number(row.plan_duration_days),
      planKey: key, planLabel: PREMIUM_PLANS[key].label, status: row.status
    };
  }
  const payment = memoryPayments.get(ref);
  if (!payment) return null;
  const key = planKeyForDuration(payment.durationDays);
  return { ...payment, amountUgx: Number(payment.amountUgx ?? payment.amount_ugx), durationDays: Number(payment.durationDays ?? payment.plan_duration_days), planKey: key, planLabel: PREMIUM_PLANS[key].label };
}

export async function listPendingPayments({ adminPhone, page = 1 }) {
  if (!isPaymentAdmin(adminPhone)) return '⛔ You are not authorized to view pending payments.';
  const requestedPage = Number(page);
  const safePage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 10;

  let total;
  let payments;
  if (pool) {
    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM manual_payment_requests WHERE status = 'pending' AND transaction_id IS NOT NULL"
    );
    total = Number(countResult.rows[0]?.total ?? 0);
    const result = await pool.query(
      "SELECT id, phone, transaction_id, amount_ugx, plan_duration_days, created_at FROM manual_payment_requests WHERE status = 'pending' AND transaction_id IS NOT NULL ORDER BY created_at ASC, id ASC LIMIT $1 OFFSET $2",
      [pageSize, (safePage - 1) * pageSize]
    );
    payments = result.rows;
  } else {
    const allPending = [...memoryPayments.values()]
      .filter((payment) => payment.status === 'pending' && payment.transactionId)
      .sort((a, b) => Number(a.id) - Number(b.id));
    total = allPending.length;
    payments = allPending.slice((safePage - 1) * pageSize, safePage * pageSize);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (safePage > pageCount) return 'Page ' + safePage + ' does not exist. There are ' + pageCount + ' page(s). Send PENDING or PENDING ' + pageCount + '.';
  if (!total) return '✅ No pending payments. New verified transaction submissions will appear here.';

  const lines = payments.map((payment) => {
    const durationDays = Number(payment.plan_duration_days ?? payment.durationDays ?? 7);
    const key = planKeyForDuration(durationDays).toUpperCase();
    const amount = Number(payment.amount_ugx ?? payment.amountUgx ?? 0).toLocaleString('en-UG');
    const transactionId = String(payment.transaction_id ?? payment.transactionId ?? 'not recorded');
    const phone = String(payment.phone ?? 'unknown');
    return '#' + payment.id + ' — ' + phone + '\\n' +
      '   ' + key + ' (' + durationDays + 'd), expected UGX ' + amount + '\\n' +
      '   Txn: ' + transactionId + '\\n' +
      '   APPROVE ' + payment.id + ' | REJECT ' + payment.id;
  });
  return '📋 PENDING PAYMENTS — ' + total + ' total\\nPage ' + safePage + '/' + pageCount +
    '\\nVerify each transaction ID and exact amount in the merchant account before approval.\\n\\n' +
    lines.join('\\n\\n') +
    (pageCount > 1 ? '\\n\\nNext: PENDING ' + (safePage < pageCount ? safePage + 1 : 1) : '');
}

export async function setPaymentPlan({ adminPhone, paymentReference, planKey }) {
  if (!isPaymentAdmin(adminPhone)) return '⛔ You are not authorized to change payment plans.';
  const ref = Number(paymentReference);
  const key = String(planKey ?? '').toLowerCase();
  const plan = PREMIUM_PLANS[key];
  if (!Number.isSafeInteger(ref) || ref < 1 || !validPlan(plan)) {
    return 'Admin usage: SETPLAN PAYMENT_REFERENCE DAY|WEEK|MONTH';
  }
  if (pool) {
    const result = await pool.query(
      "UPDATE manual_payment_requests SET amount_ugx = $2, plan_duration_days = $3 WHERE id = $1 AND status = 'pending' AND transaction_id IS NOT NULL RETURNING id, phone, amount_ugx, plan_duration_days",
      [ref, plan.price, plan.durationDays]
    );
    if (!result.rows[0]) return 'No pending transaction-ID payment found for that reference. Approved or rejected payments cannot be changed.';
    return '✅ Payment reference ' + ref + ' updated to ' + key.toUpperCase() + ' (' + plan.durationDays + ' day(s)). Expected amount is now UGX ' + plan.price.toLocaleString('en-UG') + '. Verify the actual amount paid in the merchant account before approving.';
  }
  const payment = memoryPayments.get(ref);
  if (!payment || payment.status !== 'pending') return 'No pending transaction-ID payment found for that reference. Approved or rejected payments cannot be changed.';
  payment.amountUgx = plan.price;
  payment.durationDays = plan.durationDays;
  payment.planLabel = plan.label;
  return '✅ Payment reference ' + ref + ' updated to ' + key.toUpperCase() + ' (' + plan.durationDays + ' day(s)). Expected amount is now UGX ' + plan.price.toLocaleString('en-UG') + '. Verify the actual amount paid in the merchant account before approving.';
}

export async function submitPaymentProof({ phone, transactionId, planKey }) {
  const plan = PREMIUM_PLANS[String(planKey ?? '').toLowerCase()];
  if (!validPlan(plan)) return 'Choose a plan explicitly: PAY DAY TRANSACTION_ID, PAY WEEK TRANSACTION_ID, or PAY MONTH TRANSACTION_ID. No plan is assumed.';
  const id = String(transactionId ?? '').trim().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9-]{6,80}$/.test(id)) return 'Send the transaction ID from your successful receipt. Example: PAY WEEK ABC123XYZ. Never send your PIN or OTP.';

  if (pool) {
    const result = await pool.query(
      "INSERT INTO manual_payment_requests (phone, transaction_id, amount_ugx, network, plan_duration_days, status) VALUES ($1, $2, $3, $4, $5, 'pending') ON CONFLICT (transaction_id) DO NOTHING RETURNING id",
      [phone, id, plan.price, env.MOMO_NETWORK || 'not-configured', plan.durationDays]
    );
    if (!result.rows[0]) {
      const existing = await pool.query('SELECT phone, status, id, amount_ugx, plan_duration_days FROM manual_payment_requests WHERE transaction_id = $1', [id]);
      if (existing.rows[0]?.phone !== phone) return 'That transaction ID has already been submitted. Contact the administrator if needed.';
      const saved = existing.rows[0];
      const savedKey = planKeyForDuration(saved.plan_duration_days);
      return 'Transaction ID already received. Reference: ' + saved.id + '. Saved plan: ' + savedKey.toUpperCase() + ' (' + saved.plan_duration_days + ' day(s)), expected UGX ' + Number(saved.amount_ugx).toLocaleString('en-UG') + '. Status: ' + saved.status + '.';
    }
    return '✅ Transaction ID received. Reference: ' + result.rows[0].id + '\nSelected plan: ' + plan.label + ' — UGX ' + plan.price.toLocaleString('en-UG') + '\nStatus: PENDING VERIFICATION. Access is not active yet.';
  }

  const existing = [...memoryPayments.values()].find((item) => item.transactionId === id);
  if (existing) return existing.phone === phone
    ? 'Transaction ID already received. Reference: ' + existing.id + '. Saved plan: ' + planKeyForDuration(existing.durationDays).toUpperCase() + ' (' + existing.durationDays + ' day(s)), expected UGX ' + Number(existing.amountUgx).toLocaleString('en-UG') + '. Status: ' + existing.status + '.'
    : 'That transaction ID has already been submitted. Contact the administrator if needed.';
  const payment = { id: memoryPayments.size + 1, phone, transactionId: id, amountUgx: plan.price, durationDays: plan.durationDays, planLabel: plan.label, status: 'pending' };
  memoryPayments.set(payment.id, payment);
  return '✅ Transaction ID received. Reference: ' + payment.id + '\nSelected plan: ' + plan.label + ' — UGX ' + plan.price.toLocaleString('en-UG') + '\nStatus: PENDING VERIFICATION. Access is not active yet.';
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
      const result = await client.query("SELECT * FROM manual_payment_requests WHERE id = $1 AND status = 'pending' AND transaction_id IS NOT NULL FOR UPDATE", [ref]);
      payment = result.rows[0];
      if (!payment) {
        await client.query('ROLLBACK');
        return 'No pending transaction-ID payment found for that reference.';
      }
      const durationDays = Number(payment.plan_duration_days || 7);
      await client.query(
        "INSERT INTO subscriptions (phone, plan, is_active, expires_at) VALUES ($1, 'premium', TRUE, NOW() + ($2 * INTERVAL '1 day')) ON CONFLICT (phone, plan) DO UPDATE SET is_active = TRUE, expires_at = GREATEST(COALESCE(subscriptions.expires_at, NOW()), NOW()) + ($2 * INTERVAL '1 day'), updated_at = NOW()",
        [payment.phone, durationDays]
      );
      await client.query("UPDATE manual_payment_requests SET status = 'approved', reviewed_by = $2, reviewed_at = NOW() WHERE id = $1", [ref, String(adminPhone)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } else {
    payment = memoryPayments.get(ref);
    if (!payment || payment.status !== 'pending') return 'No pending transaction-ID payment found for that reference.';
    await subscribeUser({ phone: payment.phone, plan: 'premium', durationDays: payment.durationDays || 7 });
    payment.status = 'approved';
    payment.reviewedBy = String(adminPhone);
  }
  const durationDays = Number(payment.plan_duration_days || payment.durationDays || 7);
  return '✅ Premium activated for ' + payment.phone + ' for ' + durationDays + ' day(s). Payment reference: ' + ref + '. Approve only after verifying the transaction and amount.';
}

export async function rejectPayment({ adminPhone, paymentReference }) {
  if (!isPaymentAdmin(adminPhone)) return '⛔ You are not authorized to reject payments.';
  const ref = Number(paymentReference);
  if (!Number.isSafeInteger(ref) || ref < 1) return 'Usage: REJECT PAYMENT_REFERENCE_NUMBER';
  if (pool) {
    const result = await pool.query("UPDATE manual_payment_requests SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING phone", [ref, String(adminPhone)]);
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
    const parts = args.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Submit your transaction ID with a plan: PAY DAY TRANSACTION_ID, PAY WEEK TRANSACTION_ID, or PAY MONTH TRANSACTION_ID.';
    const first = parts[0].toLowerCase();
    const hasPlan = ['day', 'week', 'month'].includes(first);
    if (!hasPlan) return 'Please specify the plan explicitly: PAY DAY TRANSACTION_ID, PAY WEEK TRANSACTION_ID, or PAY MONTH TRANSACTION_ID. No plan is assumed.';
    const planKey = first;
    const transactionId = parts.slice(1).join(' ');
    return submitPaymentProof({ phone, transactionId, planKey });
  }
  if (/^(pending|pendingpayments|payments)$/i.test(command)) {
    const requestedPage = args ? Number(args) : 1;
    if (args && (!/^\\d+$/.test(args) || !Number.isSafeInteger(requestedPage) || requestedPage < 1)) {
      return 'Usage: PENDING [PAGE_NUMBER]';
    }
    return listPendingPayments({ adminPhone: phone, page: requestedPage });
  }
  if (/^(setplan|changeplan)$/i.test(command)) {
    const match = args.match(/^(?:payment\s+)?(\d+)\s+(day|week|month)$/i);
    if (!match) return 'Admin usage: SETPLAN PAYMENT_REFERENCE DAY|WEEK|MONTH';
    return setPaymentPlan({ adminPhone: phone, paymentReference: match[1], planKey: match[2] });
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
