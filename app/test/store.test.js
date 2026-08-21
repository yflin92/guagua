'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { Store } = require('../src/main/store');
const { ModelManager } = require('../src/main/models');

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guaflow-test-'));
  return { store: new Store(dir), dir };
}

test('settings round-trip with defaults merged', () => {
  const { store } = tmpStore();
  assert.strictEqual(store.getSettings().historyEnabled, false);
  const next = store.setSettings({ historyEnabled: true, hotkey: 'Alt+D' });
  assert.strictEqual(next.historyEnabled, true);
  assert.strictEqual(next.hotkey, 'Alt+D');
  // Unspecified defaults still present.
  assert.strictEqual(next.telemetryEnabled, false);
});

test('dictionary upsert / delete', () => {
  const { store } = tmpStore();
  const e = store.upsertDictionary({ spoken: 'wispr', written: 'Wispr' });
  assert.ok(e.id);
  assert.strictEqual(store.listDictionary().length, 1);
  const updated = store.upsertDictionary({ id: e.id, spoken: 'wispr', written: 'WisprFlow' });
  assert.strictEqual(updated.written, 'WisprFlow');
  assert.strictEqual(store.listDictionary().length, 1);
  store.deleteDictionary(e.id);
  assert.strictEqual(store.listDictionary().length, 0);
});

test('history is not persisted when disabled', () => {
  const { store } = tmpStore();
  store.addHistory({ at: Date.now(), text: 'secret' });
  assert.strictEqual(store.listHistory().length, 0);
});

test('history persists encrypted and round-trips when enabled', () => {
  const { store, dir } = tmpStore();
  store.setSettings({ historyEnabled: true });
  store.addHistory({ at: Date.now(), text: 'confidential note', app: 'Slack' });
  const items = store.listHistory();
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].text, 'confidential note');
  // The raw file on disk must not contain the plaintext (encrypted at rest).
  const raw = fs.readFileSync(path.join(dir, 'history.enc'));
  assert.ok(!raw.toString('latin1').includes('confidential note'));
});

test('clearHistory removes the file', () => {
  const { store } = tmpStore();
  store.setSettings({ historyEnabled: true });
  store.addHistory({ at: Date.now(), text: 'x' });
  store.clearHistory();
  assert.strictEqual(store.listHistory().length, 0);
});

test('model manager recommends a tier within RAM budget', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guaflow-models-'));
  const mm = new ModelManager(dir);
  const rec = mm.recommend();
  assert.ok(['faster', 'balanced', 'best'].includes(rec.recommended));
  assert.ok(rec.hardware.totalRamGB > 0);
});

test('model status reports not-downloaded initially', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guaflow-models2-'));
  const mm = new ModelManager(dir);
  const status = mm.listStatus();
  assert.strictEqual(status.length, 3);
  assert.ok(status.every((t) => t.ready === false));
});
