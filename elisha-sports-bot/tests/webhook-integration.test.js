import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Exercise the Express webhook using the mock WhatsApp sender and in-memory test stores.
process.env.NODE_ENV = 'test';
process.env.MESSAGING_PROVIDER = 'mock';
process.env.PAYMENT_ADMIN_PHONES = '256700000001';

const [{ createApp }, { getUserSubscriptions }] = await Promise.all([
  import('../src/app.js'),
  import('../src/services/subscriptionService.js')
]);
const app = createApp();

function whatsappTextMessage(from, body) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messages: [{ from, id: 'wamid.test.' + Date.now(), type: 'text', text: { body } }]
        }
      }]
    }]
  };
}

test('WhatsApp webhook accepts a help message and responds successfully', async () => {
  const response = await request(app)
    .post('/webhook')
    .send(whatsappTextMessage('256700000021', 'HELP'));
  assert.equal(response.status, 200);
});

test('WhatsApp webhook payment flow keeps access locked until authorized approval', async () => {
  const customer = '256700000022';
  const transactionId = 'WEBHOOKTX' + Date.now().toString().slice(-7);

  const paymentResponse = await request(app)
    .post('/webhook')
    .send(whatsappTextMessage(customer, 'PAY WEEK ' + transactionId));
  assert.equal(paymentResponse.status, 200);
  assert.equal((await getUserSubscriptions(customer)).some((item) => item.plan === 'premium'), false);

  // The first payment in this isolated test process receives reference 1.
  const deniedResponse = await request(app)
    .post('/webhook')
    .send(whatsappTextMessage('256700000099', 'APPROVE 1'));
  assert.equal(deniedResponse.status, 200);
  assert.equal((await getUserSubscriptions(customer)).some((item) => item.plan === 'premium'), false);

  const approvalResponse = await request(app)
    .post('/webhook')
    .send(whatsappTextMessage('256700000001', 'APPROVE 1'));
  assert.equal(approvalResponse.status, 200);
  assert.equal((await getUserSubscriptions(customer)).some((item) => item.plan === 'premium'), true);
});
