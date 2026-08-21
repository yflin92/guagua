'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  cleanupDeterministic, applyDictionary, removeRepetitions,
  resolveCorrections, applyDeveloperMode, buildLlmPrompt, sanitizeLlmOutput,
} = require('../src/main/cleanup');

test('filler removal (PRD §13)', () => {
  assert.strictEqual(
    cleanupDeterministic('So um I think we should uh ship tomorrow.', {}),
    'I think we should ship tomorrow.',
  );
});

test('repetition removal (PRD §13)', () => {
  assert.strictEqual(
    cleanupDeterministic('We should we should probably delay this.', {}),
    'We should probably delay this.',
  );
});

test('self-correction keeps final choice (PRD §14)', () => {
  assert.strictEqual(
    cleanupDeterministic("Let's meet Tuesday, actually Wednesday at 2", {}),
    "Let's meet Wednesday at 2.",
  );
});

test('developer mode CLI syntax (PRD §22)', () => {
  const out = applyDeveloperMode('kubectl get pods dash n production');
  assert.match(out, /-n production/);
});

test('developer mode snake_case (PRD §22)', () => {
  assert.strictEqual(applyDeveloperMode('user underscore id'), 'user_id');
});

test('personal dictionary applies longest match first (PRD §15)', () => {
  const out = applyDictionary('run cube control now', [
    { spoken: 'cube control', written: 'kubectl', caseSensitive: false },
  ]);
  assert.strictEqual(out, 'run kubectl now');
});

test('dictionary is applied inside full pipeline', () => {
  const out = cleanupDeterministic('use PG bouncer for pooling', {
    dictionary: [{ spoken: 'PG bouncer', written: 'PgBouncer' }],
  });
  assert.match(out, /PgBouncer/);
});

test('repetition collapse of phrases', () => {
  assert.strictEqual(removeRepetitions('we should we should go'), 'we should go');
});

test('auto punctuation adds question mark for interrogatives', () => {
  assert.match(cleanupDeterministic('what time is the meeting', {}), /\?$/);
});

test('numbers and negations are preserved (PRD §9.4)', () => {
  const out = cleanupDeterministic('do not send 4500 dollars to account 12', {});
  assert.match(out, /not/);
  assert.match(out, /4500/);
  assert.match(out, /12/);
});

test('empty input yields empty output', () => {
  assert.strictEqual(cleanupDeterministic('   ', {}), '');
});

test('LLM prompt forbids meaning change and demands text-only', () => {
  const { system } = buildLlmPrompt('hello there', { developerMode: true });
  assert.match(system, /NEVER change meaning/);
  assert.match(system, /Developer mode/);
});

test('sanitizeLlmOutput strips wrapping quotes and labels', () => {
  assert.strictEqual(sanitizeLlmOutput('"Hello world"', 'hello world'), 'Hello world');
  assert.strictEqual(sanitizeLlmOutput('Cleaned text: Hi', 'hi'), 'Hi');
});

test('sanitizeLlmOutput falls back to raw when empty', () => {
  assert.strictEqual(sanitizeLlmOutput('   ', 'raw transcript'), 'raw transcript');
});

test('resolveCorrections handles scratch that', () => {
  const out = resolveCorrections('send it Monday scratch that Tuesday');
  assert.match(out, /Tuesday/);
  assert.doesNotMatch(out, /scratch/);
});
