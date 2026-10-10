import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/services/commandService.js';

test('parseCommand handles a command without arguments', () => {
  assert.deepEqual(parseCommand('MENU'), { command: 'menu', args: null, raw: 'menu' });
});

test('parseCommand separates command and multiword arguments', () => {
  assert.deepEqual(parseCommand('FORM Arsenal Women'), {
    command: 'form', args: 'arsenal women', raw: 'form arsenal women'
  });
});

test('parseCommand handles whitespace and H2H arguments', () => {
  assert.deepEqual(parseCommand('  '), { command: null, args: null, raw: '' });
  assert.deepEqual(parseCommand('H2H Manchester City vs Liverpool'), {
    command: 'h2h', args: 'manchester city vs liverpool', raw: 'h2h manchester city vs liverpool'
  });
});
