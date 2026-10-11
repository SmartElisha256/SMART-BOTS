import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PREMIUM_PRICE_UGX = '5000';
process.env.MOMO_NETWORK = 'Airtel Money';
process.env.MOMO_MERCHANT_CODE = 'TEST-MERCHANT-123';
process.env.MOMO_MERCHANT_NAME = 'Test Merchant';
process.env.PAYMENT_ADMIN_PHONES = '256700000001';

const {
  formatPaymentInstructions,
  handlePaymentCommand,
  isPaymentAdmin,
  isPaymentCommand
} = await import('../src/services/manualPaymentService.js');

test('recognizes supported manual payment and admin commands', () => {
  for (const text of ['PREMIUM', 'UPGRADE', 'PAY ABC123XYZ', 'APPROVE 12', 'REJECT 12']) {
    assert.equal(isPaymentCommand(text), true, text);
  }
  assert.equal(isPaymentCommand('FIXTURES'), false);
  assert.equal(isPaymentCommand('HELP'), false);
});

test('configured payment instructions show amount and merchant and require manual verification', () => {
  const message = formatPaymentInstructions();
  assert.match(message, /UGX 5,000/);
  assert.match(message, /Test Merchant/);
  assert.match(message, /TEST-MERCHANT-123/);
  assert.match(message, /dial \*185\*9#/);
  assert.match(message, /Premium is not activated automatically/i);
  assert.match(message, /PIN or OTP/i);
});

test('only configured administrator can approve or reject payment references', async () => {
  assert.equal(isPaymentAdmin('256 700 000 001'), true);
  assert.equal(isPaymentAdmin(''), false);
  assert.equal(await handlePaymentCommand({ phone: '256700000002', message: 'APPROVE 1' }), '⛔ You are not authorized to approve payments.');
  assert.equal(await handlePaymentCommand({ phone: '256700000002', message: 'REJECT 1' }), '⛔ You are not authorized to reject payments.');
});
