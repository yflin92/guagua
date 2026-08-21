'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { DEFAULT_SETTINGS } = require('../shared/constants');

/**
 * A tiny local-only JSON store. Everything GuaFlow persists (settings,
 * dictionary, history) lives on-device under the user data directory. Nothing
 * here ever touches the network — that is the whole point of the product.
 *
 * History entries can be encrypted at rest (§29) using a key kept in the OS
 * keychain when available, falling back to a file-based key with 0600 perms.
 */
class Store {
  /** @param {string} baseDir userData directory (app.getPath('userData')) */
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.settingsPath = path.join(baseDir, 'settings.json');
    this.dictionaryPath = path.join(baseDir, 'dictionary.json');
    this.historyPath = path.join(baseDir, 'history.enc');
    this.keyPath = path.join(baseDir, '.datakey');
    fs.mkdirSync(baseDir, { recursive: true });
  }

  // ---- settings -----------------------------------------------------------

  getSettings() {
    const saved = this._readJson(this.settingsPath, {});
    // Merge so newly added defaults appear without wiping user overrides.
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  setSettings(patch) {
    const next = { ...this.getSettings(), ...patch };
    this._writeJson(this.settingsPath, next);
    return next;
  }

  // ---- personal dictionary (§15) -----------------------------------------

  /** @returns {Array<{id:string,spoken:string,written:string,caseSensitive:boolean}>} */
  listDictionary() {
    return this._readJson(this.dictionaryPath, []);
  }

  upsertDictionary(entry) {
    const items = this.listDictionary();
    const id = entry.id || crypto.randomUUID();
    const normalized = {
      id,
      spoken: String(entry.spoken || '').trim(),
      written: String(entry.written || '').trim(),
      caseSensitive: Boolean(entry.caseSensitive),
    };
    const idx = items.findIndex((e) => e.id === id);
    if (idx >= 0) items[idx] = normalized;
    else items.push(normalized);
    this._writeJson(this.dictionaryPath, items);
    return normalized;
  }

  deleteDictionary(id) {
    const items = this.listDictionary().filter((e) => e.id !== id);
    this._writeJson(this.dictionaryPath, items);
  }

  // ---- private history (§23) ---------------------------------------------

  listHistory() {
    const settings = this.getSettings();
    if (!settings.historyEnabled) return [];
    const items = this._readEncrypted(this.historyPath, []);
    return this._pruneHistory(items, settings.historyRetentionDays);
  }

  addHistory(entry) {
    const settings = this.getSettings();
    if (!settings.historyEnabled) return; // never persist when disabled
    const items = this._readEncrypted(this.historyPath, []);
    items.unshift({
      id: crypto.randomUUID(),
      at: entry.at,
      app: entry.app || '',
      raw: entry.raw || '',
      text: entry.text || '',
      durationMs: entry.durationMs || 0,
    });
    const pruned = this._pruneHistory(items, settings.historyRetentionDays).slice(0, 500);
    this._writeEncrypted(this.historyPath, pruned);
  }

  deleteHistory(id) {
    const items = this._readEncrypted(this.historyPath, []).filter((e) => e.id !== id);
    this._writeEncrypted(this.historyPath, items);
  }

  clearHistory() {
    try {
      fs.rmSync(this.historyPath, { force: true });
    } catch (_) { /* ignore */ }
  }

  _pruneHistory(items, retentionDays) {
    if (!retentionDays || retentionDays <= 0) return items;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    return items.filter((e) => (e.at || 0) >= cutoff);
  }

  // ---- encryption helpers -------------------------------------------------

  _dataKey() {
    if (this._cachedKey) return this._cachedKey;
    // Prefer Electron's safeStorage (OS keychain) when running under Electron.
    try {
      const { safeStorage } = require('electron');
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const wrappedPath = this.keyPath + '.enc';
        let raw;
        if (fs.existsSync(wrappedPath)) {
          raw = safeStorage.decryptString(fs.readFileSync(wrappedPath));
        } else {
          raw = crypto.randomBytes(32).toString('base64');
          fs.writeFileSync(wrappedPath, safeStorage.encryptString(raw), { mode: 0o600 });
        }
        this._cachedKey = Buffer.from(raw, 'base64');
        return this._cachedKey;
      }
    } catch (_) { /* not under Electron, fall through */ }

    // Fallback: a local key file with restrictive permissions.
    if (fs.existsSync(this.keyPath)) {
      this._cachedKey = Buffer.from(fs.readFileSync(this.keyPath, 'utf8'), 'base64');
    } else {
      this._cachedKey = crypto.randomBytes(32);
      fs.writeFileSync(this.keyPath, this._cachedKey.toString('base64'), { mode: 0o600 });
    }
    return this._cachedKey;
  }

  _readEncrypted(file, fallback) {
    try {
      if (!fs.existsSync(file)) return fallback;
      const blob = fs.readFileSync(file);
      const iv = blob.subarray(0, 12);
      const tag = blob.subarray(12, 28);
      const data = blob.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this._dataKey(), iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(data), decipher.final()]);
      return JSON.parse(plain.toString('utf8'));
    } catch (_) {
      return fallback;
    }
  }

  _writeEncrypted(file, obj) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this._dataKey(), iv);
    const data = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(obj), 'utf8')),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    fs.writeFileSync(file, Buffer.concat([iv, tag, data]), { mode: 0o600 });
  }

  // ---- plain json helpers -------------------------------------------------

  _readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      return fallback;
    }
  }

  _writeJson(file, obj) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
}

/** Convenience for tests / headless usage outside Electron. */
function defaultUserDataDir() {
  return path.join(os.homedir(), '.guaflow');
}

module.exports = { Store, defaultUserDataDir };
