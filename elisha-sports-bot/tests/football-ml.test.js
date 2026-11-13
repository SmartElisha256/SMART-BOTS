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

test('production football ML endpoint requires a configured API key', async (t) => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldKey = process.env.FOOTBALL_ML_API_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.FOOTBALL_ML_API_KEY;
  t.after(() => {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldKey === undefined) delete process.env.FOOTBALL_ML_API_KEY;
    else process.env.FOOTBALL_ML_API_KEY = oldKey;
  });

  const response = await request(createApp()).post('/api/football-ml/predict').send({
    home_team: 'Arsenal', away_team: 'Chelsea'
  });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /FOOTBALL_ML_API_KEY/);
});

test('production football ML endpoint rejects requests without the API key', async (t) => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldKey = process.env.FOOTBALL_ML_API_KEY;
  process.env.NODE_ENV = 'production';
  process.env.FOOTBALL_ML_API_KEY = 'test-secret-key';
  t.after(() => {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldKey === undefined) delete process.env.FOOTBALL_ML_API_KEY;
    else process.env.FOOTBALL_ML_API_KEY = oldKey;
  });

  const response = await request(createApp()).post('/api/football-ml/predict').send({
    home_team: 'Arsenal', away_team: 'Chelsea'
  });
  assert.equal(response.status, 401);
});
