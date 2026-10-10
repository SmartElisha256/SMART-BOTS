import test from 'node:test';
import assert from 'node:assert/strict';
import { processIncomingMessage } from '../src/services/commandService.js';

test('returns help text for help command', async () => {
  const response = await processIncomingMessage({ sender: '+123456789', message: 'help', provider: 'whatsapp' });
  assert.match(response, /Commands:/i);
});

test('activates premium subscription for subscribe command', async () => {
  const response = await processIncomingMessage({ sender: '+123456789', message: 'subscribe', provider: 'whatsapp' });
  assert.match(response, /Subscription activated/i);
});

test('responds to start command with welcome message', async () => {
  const response = await processIncomingMessage({ sender: '+987654321', message: 'start', provider: 'mock' });
  assert.match(response, /Welcome to ELISHA SPORTS BOT/i);
});
