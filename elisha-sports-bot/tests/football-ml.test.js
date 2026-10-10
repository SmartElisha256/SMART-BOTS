import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('football ML endpoint validates fixture names before starting Python', async () => {
  const response = await request(createApp()).post('/api/football-ml/predict').send({
    home_team: 'Same FC', away_team: 'Same FC'
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
});

test('football ML endpoint rejects missing team names', async () => {
  const response = await request(createApp()).post('/api/football-ml/predict').send({
    home_team: 'Home FC'
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
});
