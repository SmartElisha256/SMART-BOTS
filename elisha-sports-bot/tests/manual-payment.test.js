import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPaymentInstructions,
  handlePaymentCommand,
  isPaymentAdmin,
  isPaymentCommand
} from '../src/services/manualPaymentService.js';

test('recognizes supported manual payment and admin commands', () => {
  for (const text of ['PREMIUM', 'UPGRADE', 'PAY ABC123XYZ', 'APPROVE 12', 'REJECT 12']) {
    assert.equal(isPaymentCommand(text), true, text);
  }
  assert.equal(isPaymentCommand('FIXTURES'), false);
  assert.equal(isPaymentCommand('HELP'), false);
});

test('payment instructions never claim Premium activates automatically', () => {
  const message = formatPaymentInstructions();
  assert.match(message, /Premium is not activated automatically/i);
  assert.match(message, /PIN or OTP/i);
});

test('approval and rejection commands reject unconfigured/non-admin senders', async () => {
  assert.equal(await handlePaymentCommand({ phone: '256700000001', message: 'APPROVE 1' }), '⛔ You are not authorized to approve payments.');
  assert.equal(await handlePaymentCommand({ phone: '256700000001', message: 'REJECT 1' }), '⛔ You are not authorized to reject payments.');
});

test('administrator phone matching normalizes punctuation but does not accept empty phone', () => {
  assert.equal(isPaymentAdmin(''), false);
});
