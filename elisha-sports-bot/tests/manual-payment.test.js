import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

process.env.PREMIUM_PRICE_DAY_UGX = '1000';
process.env.PREMIUM_PRICE_WEEK_UGX = '5000';
process.env.PREMIUM_PRICE_MONTH_UGX = '15000';
process.env.PREMIUM_PRICE_UGX = '5000';
process.env.MOMO_NETWORK = 'Airtel Money';
process.env.MOMO_MERCHANT_CODE = '6949337';
process.env.MOMO_MERCHANT_NAME = 'SMART ELISHA 256';
process.env.PAYMENT_ADMIN_PHONES = '256700000001';

const { formatPaymentInstructions, handlePaymentCommand, isPaymentAdmin, isPaymentCommand, listPendingPayments, PREMIUM_PLANS } =
  await import('../src/services/manualPaymentService.js');

test('recognizes payment/admin commands but not football commands', () => {
  for (const text of ['PREMIUM', 'UPGRADE', 'PAY ABC123XYZ', 'PAY DAY ABC123XYZ', 'PAY WEEK ABC123XYZ', 'PAY MONTH ABC123XYZ', 'APPROVE 12', 'REJECT 12', 'SETPLAN 12 DAY', 'CHANGEPLAN 12 MONTH', 'PENDING', 'PENDING 2', 'PAYMENTS']) assert.equal(isPaymentCommand(text), true, text);
  assert.equal(isPaymentCommand('FIXTURES'), false);
  assert.equal(isPaymentCommand('HELP'), false);
});
test('plans use UGX 1,000/day, 5,000/week, 15,000/month', () => {
  assert.deepEqual([PREMIUM_PLANS.day.price, PREMIUM_PLANS.day.durationDays], [1000, 1]);
  assert.deepEqual([PREMIUM_PLANS.week.price, PREMIUM_PLANS.week.durationDays], [5000, 7]);
  assert.deepEqual([PREMIUM_PLANS.month.price, PREMIUM_PLANS.month.durationDays], [15000, 30]);
});
test('instructions show merchant code, all prices, and transaction-ID-only process', () => {
  const message = formatPaymentInstructions();
  for (const value of ['UGX 1,000', 'UGX 5,000', 'UGX 15,000', '6949337', 'SMART ELISHA 256', 'PAY WEEK YOUR_TRANSACTION_ID', 'PIN or OTP']) assert.ok(message.includes(value), value);
  assert.doesNotMatch(message, /screenshot/i);
});
test('only configured administrator can approve/reject', async () => {
  assert.equal(isPaymentAdmin('256 700 000 001'), true);
  assert.equal(isPaymentAdmin(''), false);
  assert.equal(await handlePaymentCommand({ phone: '256700000002', message: 'APPROVE 1' }), '⛔ You are not authorized to approve payments.');
  assert.equal(await handlePaymentCommand({ phone: '256700000002', message: 'REJECT 1' }), '⛔ You are not authorized to reject payments.');
});
test('PAY without a plan asks the customer to choose one', async () => {
  const result = await handlePaymentCommand({ phone: '256700000010', message: 'PAY ABC123XYZ' });
  assert.match(result, /specify the plan explicitly/);
  assert.match(result, /No plan is assumed/);
});
test('PAY supports day and month plans', async () => {
  const day = await handlePaymentCommand({ phone: '256700000011', message: 'PAY DAY DAYTX123456' });
  const month = await handlePaymentCommand({ phone: '256700000012', message: 'PAY MONTH MONTHTX123456' });
  assert.match(day, /1 day — UGX 1,000/);
  assert.match(month, /1 month \(30 days\) — UGX 15,000/);
});

test('only admin can correct a pending payment plan', async () => {
  const submitted = await handlePaymentCommand({ phone: '256700000020', message: 'PAY WEEK PLANFIX12345' });
  const reference = submitted.match(/Reference: (\d+)/)?.[1];
  assert.ok(reference, submitted);
  const denied = await handlePaymentCommand({ phone: '256700000020', message: 'SETPLAN ' + reference + ' DAY' });
  assert.equal(denied, '⛔ You are not authorized to change payment plans.');
  const corrected = await handlePaymentCommand({ phone: '256700000001', message: 'SETPLAN ' + reference + ' DAY' });
  assert.match(corrected, /updated to DAY/);
  assert.match(corrected, /UGX 1,000/);
  const duplicate = await handlePaymentCommand({ phone: '256700000020', message: 'PAY WEEK PLANFIX12345' });
  assert.match(duplicate, /Saved plan: DAY/);
});

test('pending payment queue is admin-only and groups requests by page', async () => {
  const submitted = await handlePaymentCommand({ phone: '256700000030', message: 'PAY WEEK QUEUETEST12345' });
  const reference = submitted.match(/Reference: (\d+)/)?.[1];
  assert.ok(reference, submitted);

  const denied = await handlePaymentCommand({ phone: '256700000030', message: 'PENDING' });
  assert.equal(denied, '⛔ You are not authorized to view pending payments.');

  const queue = await handlePaymentCommand({ phone: '256700000001', message: 'PENDING' });
  assert.match(queue, /PENDING PAYMENTS/);
  assert.ok(queue.includes('#' + reference), queue);
  assert.match(queue, /QUEUETEST12345/);
  assert.match(queue, /APPROVE/);
});

test('PENDING accepts numeric page numbers and rejects invalid page input', async () => {
  const invalid = await handlePaymentCommand({ phone: '256700000001', message: 'PENDING abc' });
  assert.equal(invalid, 'Usage: PENDING [PAGE_NUMBER]');

  const secondPage = await handlePaymentCommand({ phone: '256700000001', message: 'PENDING 2' });
  assert.doesNotMatch(secondPage, /^Usage: PENDING/);
  assert.match(secondPage, /does not exist|PENDING PAYMENTS/);
});
