import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = '';

const [{ processIncomingMessage }, { isQuotaTrackedMessage }, { answerFootballQuestion }] = await Promise.all([
  import('../src/services/commandService.js'),
  import('../src/services/usageService.js'),
  import('../src/services/footballAssistantService.js')
]);

test('natural-language football questions count against the request quota', () => {
  assert.equal(isQuotaTrackedMessage('Explain the offside rule'), true);
  assert.equal(isQuotaTrackedMessage('What is a false nine?'), true);
  assert.equal(isQuotaTrackedMessage(''), false);
  assert.equal(isQuotaTrackedMessage('   '), false);
});

test('open-ended football question gets a helpful fallback when AI is not configured', async () => {
  const reply = await processIncomingMessage({
    sender: '256700000091',
    message: 'Explain the offside rule in simple words',
    provider: 'mock'
  });
  assert.match(reply, /help with football/i);
  assert.match(reply, /OPENAI_API_KEY/);
});

test('AI assistant does not call an external service when no API key is configured', async () => {
  assert.equal(await answerFootballQuestion('What is a false nine?'), null);
});
