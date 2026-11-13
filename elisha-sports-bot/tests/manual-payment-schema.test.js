import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [schema, migration, service, server] = await Promise.all([
  readFile(new URL('src/database/schema.sql', root), 'utf8'),
  readFile(new URL('src/database/migrations/20261104_manual_payment_constraints.sql', root), 'utf8'),
  readFile(new URL('src/services/manualPaymentService.js', root), 'utf8'),
  readFile(new URL('src/server.js', root), 'utf8')
]);

test('fresh database schema supports payment submission columns and conflict handling', () => {
  assert.match(schema, /network\s+VARCHAR\(40\)\s+NOT NULL/i);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_payment_transaction_id_unique\s+ON manual_payment_requests\(transaction_id\)/i);
  assert.match(service, /ON CONFLICT \(transaction_id\) DO NOTHING/i);
});

test('existing-database migration adds network and safely guards duplicate transaction IDs', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS network VARCHAR\(40\) NOT NULL DEFAULT 'not-configured'/i);
  assert.match(migration, /GROUP BY transaction_id\s+HAVING COUNT\(\*\) > 1/i);
  assert.match(migration, /RAISE EXCEPTION[\s\S]*duplicate non-null transaction_id/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_payment_transaction_id_unique/i);
});

test('production startup checks required payment schema, not only table existence', () => {
  assert.match(server, /idx_manual_payment_transaction_id_unique/);
  assert.match(server, /network/);
});
