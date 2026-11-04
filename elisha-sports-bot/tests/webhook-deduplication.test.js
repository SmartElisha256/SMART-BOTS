import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { claimMessage, markMessageProcessed, markMessageFailed, clearDeduplicationCache } =
  await import('../src/utils/messageDeduplication.js');

test('claims a message once and suppresses duplicate deliveries', async () => {
  clearDeduplicationCache();
  assert.equal((await claimMessage('wamid.test.1')).claimed, true);
  const duplicate = await claimMessage('wamid.test.1');
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.status, 'processing');
});

test('processed messages remain deduplicated', async () => {
  clearDeduplicationCache();
  await claimMessage('wamid.test.2');
  await markMessageProcessed('wamid.test.2');
  assert.equal((await claimMessage('wamid.test.2')).claimed, false);
});

test('failed messages can be claimed again for retry', async () => {
  clearDeduplicationCache();
  await claimMessage('wamid.test.3');
  await markMessageFailed('wamid.test.3', new Error('temporary provider failure'));
  assert.equal((await claimMessage('wamid.test.3')).claimed, true);
});
