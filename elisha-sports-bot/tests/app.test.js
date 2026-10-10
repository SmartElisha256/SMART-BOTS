import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET / returns service landing response', async () => {
  const response = await request(createApp()).get('/');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.service, 'ELISHA SPORTS BOT');
});

test('unknown route returns JSON 404', async () => {
  const response = await request(createApp()).get('/does-not-exist');
  assert.equal(response.status, 404);
  assert.equal(response.body.ok, false);
});

test('WhatsApp webhook rejects invalid verification token', async () => {
  const response = await request(createApp()).get('/webhook').query({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'wrong-token',
    'hub.challenge': '123'
  });
  assert.equal(response.status, 403);
});
