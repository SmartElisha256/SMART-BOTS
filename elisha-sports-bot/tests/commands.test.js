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


test('natural language recognizes greetings and help', () => {
  assert.equal(parseCommand('Hey there').command, 'menu');
  assert.equal(parseCommand('What can you do?').command, 'help');
});

test('natural language maps fixtures and today tip requests', () => {
  assert.equal(parseCommand('What matches are on today?').command, 'fixtures');
  assert.equal(parseCommand("Today's tip").command, 'tip');
  assert.equal(parseCommand('best pick today').command, 'tip');
});

test('natural language extracts a team for form requests', () => {
  assert.deepEqual(parseCommand('How is Arsenal doing?'), {
    command: 'form', args: 'arsenal', raw: 'how is arsenal doing'
  });
});

test('natural language maps conversational match questions to analysis', () => {
  assert.deepEqual(parseCommand('Arsenal vs Chelsea, who might win?'), {
    command: 'analyze', args: 'arsenal vs chelsea', raw: 'arsenal vs chelsea, who might win'
  });
  assert.deepEqual(parseCommand('Please show H2H Manchester City vs Liverpool'), {
    command: 'h2h', args: 'manchester city vs liverpool', raw: 'please show h2h manchester city vs liverpool'
  });
});


test('natural language handles alternate match-analysis wording and punctuation', () => {
  assert.deepEqual(parseCommand('Arsenal vs Chelsea, who might win?'), {
    command: 'analyze', args: 'arsenal vs chelsea', raw: 'arsenal vs chelsea, who might win'
  });
  assert.deepEqual(parseCommand('Please analyze Barcelona against Real Madrid'), {
    command: 'analyze', args: 'barcelona vs real madrid', raw: 'please analyze barcelona against real madrid'
  });
});

test('natural language recognizes conversational head-to-head questions', () => {
  assert.deepEqual(parseCommand('Please show H2H Manchester City vs Liverpool'), {
    command: 'h2h', args: 'manchester city vs liverpool', raw: 'please show h2h manchester city vs liverpool'
  });
  assert.deepEqual(parseCommand('What is the head to head for Arsenal versus Chelsea?'), {
    command: 'h2h', args: 'arsenal vs chelsea', raw: 'what is the head to head for arsenal versus chelsea'
  });
});

test('natural language directs unsupported detailed football markets honestly', () => {
  assert.equal(parseCommand('Can you tell me the corners and cards prediction?').command, 'football_help');
  assert.equal(parseCommand('How much is premium?').command, 'upgrade');
});
