import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getPaymentRequestByReference } from '../src/services/manualPaymentService.js';

test('admin payment details route imports the service function it calls', async () => {
  assert.equal(typeof getPaymentRequestByReference, 'function');

  const source = await readFile(
    new URL('../src/routes/admin.js', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /import\s*\{[^}]*\bgetPaymentRequestByReference\b[^}]*\}\s*from\s*['"]\.\.\/services\/manualPaymentService\.js['"]/s
  );
  assert.match(source, /getPaymentRequestByReference\(req\.params\.id\)/);
});
