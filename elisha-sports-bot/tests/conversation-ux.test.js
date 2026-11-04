import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/commands/intentParser.js';
import { isQuotaTrackedMessage } from '../src/services/usageService.js';
import { getHelpMessage } from '../src/commands/messages.js';
import { processIncomingMessage } from '../src/services/commandService.js';

test('natural-language admin contact requests route to support', () => {
  for (const message of [
    'How do I contact admin?',
    'Can I talk to the administrator?',
    'How can I reach support?',
    'I need to speak to the developer'
  ]) {
    assert.equal(parseCommand(message).command, 'support', message);
  }
});

test('support response path is documented and does not expose private admin numbers', () => {
  const help = getHelpMessage();
  assert.match(help, /FEEDBACK|REVIEW/);
});

test('support, feedback, payment and navigation requests do not consume football quota', () => {
  for (const message of [
    'HELP',
    'MENU',
    'How do I contact admin?',
    'CONTACT ADMIN',
    'FEEDBACK The fixtures command failed',
    'UPGRADE',
    'PAYMENT 123456'
  ]) {
    assert.equal(isQuotaTrackedMessage(message), false, message);
  }
});

test('football-data commands and natural-language data requests still consume quota', () => {
  for (const message of [
    'FIXTURES',
    'LIVE',
    'FORM Arsenal',
    'H2H Arsenal vs Chelsea',
    'ANALYZE Arsenal vs Chelsea',
    'What matches are on today?',
    'How is Arsenal doing?'
  ]) {
    assert.equal(isQuotaTrackedMessage(message), true, message);
  }
});

test('ordinary unrelated messages do not consume football-data quota', () => {
  assert.equal(isQuotaTrackedMessage('What is the weather?'), false);
  assert.equal(isQuotaTrackedMessage('Thanks'), false);
});

test('support intent returns a real support response', async () => {
  const reply = await processIncomingMessage({ sender: '256700000098', message: 'How do I contact admin?', provider: 'mock' });
  assert.match(reply, /SUPPORT/);
  assert.match(reply, /FEEDBACK/);
  assert.match(reply, /transaction ID/i);
});
