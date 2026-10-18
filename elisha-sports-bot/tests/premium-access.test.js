import test from 'node:test';
import assert from 'node:assert/strict';

// Force the in-memory adapters before importing modules; these tests never contact a live database.
process.env.NODE_ENV = 'test';
process.env.PAYMENT_ADMIN_PHONES = '256700000001';

const [
  { processIncomingMessage },
  { submitPaymentProof, approvePayment, rejectPayment },
  { getUserSubscriptions, isSubscriptionActive, subscribeUser }
] = await Promise.all([
  import('../src/services/commandService.js'),
  import('../src/services/manualPaymentService.js'),
  import('../src/services/subscriptionService.js')
]);

test('free users are blocked from Premium analysis and historical reports', async () => {
  const analysis = await processIncomingMessage({
    sender: '256700000010',
    message: 'ANALYZE Arsenal vs Chelsea',
    provider: 'mock'
  });
  assert.match(analysis, /PREMIUM FEATURE/);
  assert.match(analysis, /UPGRADE/);

  const season = await processIncomingMessage({
    sender: '256700000011',
    message: 'SEASON Premier League 2025',
    provider: 'mock'
  });
  assert.match(season, /PREMIUM FEATURE/);
});

test('active Premium subscriber can access the analysis command', async () => {
  const sender = '256700000015';
  await subscribeUser({ phone: sender, plan: 'premium', durationDays: 7 });
  const response = await processIncomingMessage({
    sender,
    message: 'ANALYZE Arsenal vs Chelsea',
    provider: 'mock'
  });
  assert.doesNotMatch(response, /PREMIUM FEATURE/);
  assert.match(response, /MATCH ANALYSIS|AI MATCH ANALYSIS|could not analyze/i);
});

test('payment transaction stays pending and does not activate access before approval', async () => {
  const phone = '256700000012';
  const transactionId = 'TESTTX' + Date.now().toString().slice(-8);
  const submitted = await submitPaymentProof({ phone, transactionId, planKey: 'week' });
  assert.match(submitted, /PENDING VERIFICATION/);

  const beforeApproval = await getUserSubscriptions(phone);
  assert.equal(beforeApproval.some((item) => item.plan === 'premium'), false);

  const unauthorized = await approvePayment({ adminPhone: '256700000099', paymentReference: 1 });
  assert.match(unauthorized, /not authorized/i);
});

test('only configured administrator can approve, and approval activates Premium access', async () => {
  const phone = '256700000013';
  const transactionId = 'APPROVETX' + Date.now().toString().slice(-7);
  const submitted = await submitPaymentProof({ phone, transactionId, planKey: 'day' });
  assert.match(submitted, /Reference: (\d+)/);
  const reference = Number(submitted.match(/Reference: (\d+)/)[1]);

  const approved = await approvePayment({ adminPhone: '256700000001', paymentReference: reference });
  assert.match(approved, /Premium activated/);
  const subscriptions = await getUserSubscriptions(phone);
  assert.equal(subscriptions.some((item) => item.plan === 'premium'), true);
});

test('rejected payment does not activate Premium access', async () => {
  const phone = '256700000014';
  const transactionId = 'REJECTTX' + Date.now().toString().slice(-7);
  const submitted = await submitPaymentProof({ phone, transactionId, planKey: 'week' });
  const reference = Number(submitted.match(/Reference: (\d+)/)[1]);
  const rejected = await rejectPayment({ adminPhone: '256700000001', paymentReference: reference });
  assert.match(rejected, /rejected/i);
  assert.equal((await getUserSubscriptions(phone)).some((item) => item.plan === 'premium'), false);
});

test('subscription expiry makes an otherwise active Premium record inactive', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z');
  assert.equal(isSubscriptionActive({ plan: 'premium', is_active: true, expires_at: '2026-10-18T11:59:59.000Z' }, now), false);
  assert.equal(isSubscriptionActive({ plan: 'premium', is_active: true, expires_at: '2026-10-18T12:00:01.000Z' }, now), true);
  assert.equal(isSubscriptionActive({ plan: 'premium', is_active: false, expires_at: '2026-10-19T12:00:00.000Z' }, now), false);
});
