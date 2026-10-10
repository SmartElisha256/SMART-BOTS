import test from 'node:test';
import assert from 'node:assert/strict';
import { CallMeBotAdapter } from '../src/providers/messaging/callmebotAdapter.js';
import { MockMessagingAdapter } from '../src/providers/messaging/mockMessagingAdapter.js';

test('CallMeBotAdapter: throws error when API key is not configured', async () => {
  const adapter = new CallMeBotAdapter({
    apiKey: 'replace-me',
    phone: '1234567890',
    endpoint: 'https://api.callmebot.com/whatsapp.php'
  });

  await assert.rejects(
    () => adapter.sendMessage({ to: '+1234567890', text: 'Test' }),
    /API key is not configured/
  );
});

test('CallMeBotAdapter: throws error when phone is not configured', async () => {
  const adapter = new CallMeBotAdapter({
    apiKey: 'valid-key',
    phone: 'replace-me',
    endpoint: 'https://api.callmebot.com/whatsapp.php'
  });

  await assert.rejects(
    () => adapter.sendMessage({ to: '+1234567890', text: 'Test' }),
    /phone is not configured/
  );
});

test('CallMeBotAdapter: throws error when target phone is missing', async () => {
  const adapter = new CallMeBotAdapter({
    apiKey: 'valid-key',
    phone: '1234567890',
    endpoint: 'https://api.callmebot.com/whatsapp.php'
  });

  await assert.rejects(
    () => adapter.sendMessage({ to: '', text: 'Test' }),
    /Target phone number/
  );
});

test('CallMeBotAdapter: throws error when message text is missing', async () => {
  const adapter = new CallMeBotAdapter({
    apiKey: 'valid-key',
    phone: '1234567890',
    endpoint: 'https://api.callmebot.com/whatsapp.php'
  });

  await assert.rejects(
    () => adapter.sendMessage({ to: '+1234567890', text: '' }),
    /Message text is required/
  );
});

test('CallMeBotAdapter: validates configuration status', () => {
  const adapter = new CallMeBotAdapter({
    apiKey: 'valid-key',
    phone: '1234567890',
    endpoint: 'https://api.callmebot.com/whatsapp.php'
  });

  const status = adapter.getConfigStatus();

  assert.equal(status.configured, true);
  assert.equal(status.apiKeySet, true);
  assert.equal(status.phoneSet, true);
  assert.equal(status.endpoint, 'https://api.callmebot.com/whatsapp.php');
  assert.equal(status.timeout, 10_000);
});

test('CallMeBotAdapter: unconfigured adapter reports not configured', () => {
  const adapter = new CallMeBotAdapter({
    apiKey: 'replace-me',
    phone: 'replace-me',
    endpoint: 'https://api.callmebot.com/whatsapp.php'
  });

  const status = adapter.getConfigStatus();

  assert.equal(status.configured, false);
  assert.equal(status.apiKeySet, false);
  assert.equal(status.phoneSet, false);
});

test('MockMessagingAdapter: sends message successfully', async () => {
  const adapter = new MockMessagingAdapter({ enabled: true });
  const result = await adapter.sendMessage({ to: '+1234567890', text: 'Test message' });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'mock');
  assert.equal(result.to, '+1234567890');
  assert.equal(result.messageLength, 12);
});

test('MockMessagingAdapter: stores sent messages', async () => {
  const adapter = new MockMessagingAdapter({ enabled: true });

  await adapter.sendMessage({ to: '+1111111111', text: 'Message 1' });
  await adapter.sendMessage({ to: '+2222222222', text: 'Message 2' });

  const messages = adapter.getSentMessages();

  assert.equal(messages.length, 2);
  assert.equal(messages[0].to, '+1111111111');
  assert.equal(messages[1].to, '+2222222222');
});

test('MockMessagingAdapter: clears sent messages', async () => {
  const adapter = new MockMessagingAdapter({ enabled: true });

  await adapter.sendMessage({ to: '+1234567890', text: 'Test' });
  assert.equal(adapter.getSentMessages().length, 1);

  adapter.clearSentMessages();
  assert.equal(adapter.getSentMessages().length, 0);
});

test('MockMessagingAdapter: throws error when target phone is missing', async () => {
  const adapter = new MockMessagingAdapter({ enabled: true });

  await assert.rejects(
    () => adapter.sendMessage({ to: '', text: 'Test' }),
    /Target phone number/
  );
});

test('MockMessagingAdapter: throws error when message text is missing', async () => {
  const adapter = new MockMessagingAdapter({ enabled: true });

  await assert.rejects(
    () => adapter.sendMessage({ to: '+1234567890', text: '' }),
    /Message text is required/
  );
});


import { WhatsAppCloudProvider } from '../src/providers/messaging/whatsappCloudProvider.js';

test('WhatsAppCloudProvider can be constructed and reports missing credentials', async () => {
  const provider = new WhatsAppCloudProvider({
    accessToken: 'replace-me',
    phoneNumberId: 'replace-me',
    apiBaseUrl: 'https://graph.facebook.com/v19.0/'
  });
  assert.equal(provider.getConfigStatus().configured, false);
  await assert.rejects(
    () => provider.sendMessage({ to: '+1234567890', text: 'Test' }),
    /credentials are missing/
  );
});
