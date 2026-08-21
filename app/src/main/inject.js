'use strict';

const { spawn } = require('child_process');

/**
 * Text injection layer (§10.4 / Risk 6). Inserts finalized text into whatever
 * app currently has focus.
 *
 * macOS strategy, in order of preference:
 *   1. 'auto'      -> clipboard-paste: put text on the pasteboard, send Cmd+V
 *                     via AppleScript System Events, then restore the clipboard.
 *                     This is the most compatible approach across apps.
 *   2. 'keystroke' -> AppleScript `keystroke` (types the text). Works where
 *                     paste is blocked but is slower for long text.
 *   3. 'clipboard' -> copy only; user pastes manually (never fails).
 *
 * Requires Accessibility permission for System Events keystrokes. On non-macOS
 * platforms (this dev sandbox) injection is a no-op that reports why.
 */
class TextInjector {
  /** @param {object} electron optional { clipboard } for clipboard access */
  constructor(electron = {}) {
    this.clipboard = electron.clipboard || null;
    this.platform = process.platform;
  }

  /**
   * @param {string} text
   * @param {'auto'|'keystroke'|'clipboard'} mode
   * @returns {Promise<{ok:boolean, method:string, reason?:string}>}
   */
  async insert(text, mode = 'auto') {
    if (!text) return { ok: true, method: 'noop' };
    if (this.platform !== 'darwin') {
      // In the dev sandbox we can't inject into other apps; surface clearly.
      return { ok: false, method: 'unsupported', reason: `injection only on macOS (platform=${this.platform})` };
    }
    try {
      if (mode === 'clipboard') {
        this._setClipboard(text);
        return { ok: true, method: 'clipboard' };
      }
      if (mode === 'keystroke') {
        await this._keystroke(text);
        return { ok: true, method: 'keystroke' };
      }
      // auto: clipboard-paste with restore
      const prev = this._getClipboard();
      this._setClipboard(text);
      await this._paste();
      // Restore the user's previous clipboard shortly after (§29 clipboard hygiene).
      setTimeout(() => {
        try { if (prev != null) this._setClipboard(prev); } catch (_) { /* ignore */ }
      }, 400);
      return { ok: true, method: 'paste' };
    } catch (err) {
      // Fall back to leaving text on the clipboard so nothing is lost.
      try { this._setClipboard(text); } catch (_) { /* ignore */ }
      return { ok: false, method: 'clipboard-fallback', reason: err.message };
    }
  }

  _getClipboard() {
    if (this.clipboard) return this.clipboard.readText();
    return null;
  }

  _setClipboard(text) {
    if (this.clipboard) this.clipboard.writeText(text);
  }

  _paste() {
    // Cmd+V via System Events.
    const script = 'tell application "System Events" to keystroke "v" using command down';
    return this._osascript(script);
  }

  _keystroke(text) {
    const safe = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `tell application "System Events" to keystroke "${safe}"`;
    return this._osascript(script);
  }

  _osascript(script) {
    return new Promise((resolve, reject) => {
      const child = spawn('osascript', ['-e', script]);
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `osascript exited ${code}`));
      });
    });
  }

  /** Best-effort undo of the last insertion by sending Cmd+Z (§ MVP undo). */
  async undo() {
    if (this.platform !== 'darwin') return { ok: false, reason: 'undo only on macOS' };
    try {
      await this._osascript('tell application "System Events" to keystroke "z" using command down');
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }
}

/** Best-effort front app name + window title for local context (§16, §21). */
function getFrontAppContext() {
  if (process.platform !== 'darwin') {
    return Promise.resolve({ appName: '', windowTitle: '' });
  }
  const script = `
    tell application "System Events"
      set frontApp to name of first application process whose frontmost is true
      set winTitle to ""
      try
        set winTitle to name of front window of (first application process whose frontmost is true)
      end try
    end tell
    return frontApp & "\n" & winTitle`;
  return new Promise((resolve) => {
    const child = spawn('osascript', ['-e', script]);
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => resolve({ appName: '', windowTitle: '' }));
    child.on('close', () => {
      const [appName = '', windowTitle = ''] = out.trim().split('\n');
      resolve({ appName: appName.trim(), windowTitle: windowTitle.trim() });
    });
  });
}

module.exports = { TextInjector, getFrontAppContext };
