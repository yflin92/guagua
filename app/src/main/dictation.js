'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { AsrEngine } = require('./asr');
const { LlmEngine } = require('./llm');
const { cleanupDeterministic } = require('./cleanup');
const { profileForApp, appCategory } = require('./appProfiles');

/**
 * Orchestrates the local dictation pipeline (§11, §40):
 *   audio (wav) -> local ASR -> local LLM/rule cleanup -> text.
 *
 * The controller is engine-agnostic: it holds an AsrEngine and LlmEngine that
 * may or may not be "ready". When ASR isn't ready it cannot fabricate a
 * transcript, so it reports NOT_READY rather than doing anything remote — the
 * privacy guarantee (§9.1) is preserved by construction. When the LLM isn't
 * ready, cleanup falls back to the deterministic rules, still fully local.
 */
class DictationController {
  /**
   * @param {object} deps
   * @param {AsrEngine} deps.asr
   * @param {LlmEngine} deps.llm
   * @param {import('./store').Store} deps.store
   */
  constructor(deps) {
    this.asr = deps.asr;
    this.llm = deps.llm;
    this.store = deps.store;
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guaflow-'));
  }

  /** Rebind engines after the active tier / model changes. */
  setEngines({ asr, llm }) {
    if (asr) this.asr = asr;
    if (llm) this.llm = llm;
  }

  /**
   * Process a completed utterance.
   * @param {Buffer} wavBuffer 16kHz mono PCM WAV
   * @param {object} context { appName, windowTitle }
   * @returns {Promise<{text:string, raw:string, engine:string, timings:object, appCategory:string}>}
   */
  async process(wavBuffer, context = {}) {
    const t0 = Date.now();
    const settings = this.store.getSettings();
    const dictionary = this.store.listDictionary();

    // 1) Persist wav to a temp file for the ASR CLI, then delete promptly (§29).
    const wavPath = path.join(this.tmpDir, `${crypto.randomUUID()}.wav`);
    fs.writeFileSync(wavPath, wavBuffer);

    let raw = '';
    let asrMs = 0;
    try {
      const a0 = Date.now();
      raw = await this.asr.transcribe(wavPath, { language: 'auto' });
      asrMs = Date.now() - a0;
    } finally {
      try { fs.rmSync(wavPath, { force: true }); } catch (_) { /* ignore */ }
      // Clear the buffer reference so audio doesn't linger in memory (§29).
      wavBuffer = null;
    }

    if (!raw || !raw.trim()) {
      return { text: '', raw: '', engine: 'none', timings: { asrMs, llmMs: 0, totalMs: Date.now() - t0 }, appCategory: 'other' };
    }

    // 2) Resolve app-specific style + developer mode (§21, §22).
    const useContext = settings.useLocalContext !== false;
    const appName = useContext ? (context.appName || '') : '';
    const profile = appName ? profileForApp(appName) : null;
    const developerMode = settings.developerMode || Boolean(profile?.developer);

    const cleanupOpts = {
      dictionary,
      developerMode,
      appName,
      appStyle: profile?.style || '',
    };

    // 3) Local cleanup: LLM if available, else deterministic rules.
    const l0 = Date.now();
    const refined = await this.llm.refine(raw, cleanupOpts);
    const llmMs = Date.now() - l0;

    const result = {
      text: refined.text,
      raw,
      engine: refined.engine,
      timings: { asrMs, llmMs, totalMs: Date.now() - t0 },
      appCategory: appCategory(appName),
    };

    // 4) Optional local history (§23) — only when explicitly enabled.
    if (settings.historyEnabled) {
      this.store.addHistory({
        at: Date.now(),
        app: appName,
        raw,
        text: refined.text,
        durationMs: result.timings.totalMs,
      });
    }
    return result;
  }

  /**
   * Command Mode (§25): transform existing text locally, e.g. "make it shorter".
   * @param {string} text
   * @param {string} instruction
   */
  async command(text, instruction) {
    const ok = await this.llm.ensureLoaded?.();
    if (!ok) {
      // Deterministic fallbacks for a few common commands.
      return { text: this._ruleCommand(text, instruction), engine: 'rules' };
    }
    const refined = await this.llm.refine(`${instruction}\n\nText:\n${text}`, {
      dictionary: this.store.listDictionary(),
    });
    return refined;
  }

  _ruleCommand(text, instruction) {
    const i = instruction.toLowerCase();
    if (i.includes('bullet')) {
      return text.split(/(?<=[.!?])\s+/).filter(Boolean).map((s) => `- ${s}`).join('\n');
    }
    if (i.includes('shorter')) {
      return text.split(/(?<=[.!?])\s+/).slice(0, 1).join(' ');
    }
    if (i.includes('upper')) return text.toUpperCase();
    if (i.includes('lower')) return text.toLowerCase();
    return cleanupDeterministic(text, {});
  }

  cleanup() {
    try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

module.exports = { DictationController };
