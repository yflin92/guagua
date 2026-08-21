'use strict';

const fs = require('fs');

const { buildLlmPrompt, sanitizeLlmOutput, cleanupDeterministic } = require('./cleanup');

/**
 * Local language model stage (§10.3 / §40 Stage 2). Wraps node-llama-cpp to run
 * a small instruct GGUF model fully on-device.
 *
 * node-llama-cpp is an optional native dependency. If it (or the model file) is
 * unavailable — the dev sandbox, a fresh install before download, or a
 * deliberately minimal build — `refine()` transparently falls back to the
 * deterministic rule-based cleaner. The product therefore always produces
 * output locally and never reaches for the network (§9.1).
 */
class LlmEngine {
  /**
   * @param {object} opts
   * @param {string} opts.modelPath path to the .gguf model
   * @param {number} [opts.contextSize]
   */
  constructor(opts = {}) {
    this.modelPath = opts.modelPath || '';
    this.contextSize = opts.contextSize || 2048;
    this._model = null;
    this._context = null;
    this._session = null;
    this._loaded = false;
    this._loadError = null;
  }

  isAvailable() {
    if (!this.modelPath || !fs.existsSync(this.modelPath)) return false;
    try {
      require.resolve('node-llama-cpp');
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Lazily load the model on first use. Returns true when the LLM is usable. */
  async ensureLoaded() {
    if (this._loaded) return true;
    if (this._loadError) return false;
    if (!this.isAvailable()) return false;
    try {
      const { getLlama, LlamaChatSession } = require('node-llama-cpp');
      const llama = await getLlama();
      this._model = await llama.loadModel({ modelPath: this.modelPath });
      this._context = await this._model.createContext({ contextSize: this.contextSize });
      this._LlamaChatSession = LlamaChatSession;
      this._loaded = true;
      return true;
    } catch (err) {
      this._loadError = err;
      return false;
    }
  }

  /**
   * Refine a raw transcript into clean written text.
   * Always resolves to a string; falls back to deterministic cleanup on any
   * failure so callers get local output no matter what.
   *
   * @param {string} raw
   * @param {object} opts { dictionary, developerMode, appName, appStyle }
   * @returns {Promise<{text:string, engine:'llm'|'rules'}>}
   */
  async refine(raw, opts = {}) {
    const deterministic = () => ({
      text: cleanupDeterministic(raw, opts),
      engine: 'rules',
    });

    if (!raw || !raw.trim()) return { text: '', engine: 'rules' };
    const ok = await this.ensureLoaded();
    if (!ok) return deterministic();

    try {
      const { system, user } = buildLlmPrompt(raw, opts);
      const session = new this._LlamaChatSession({
        contextSequence: this._context.getSequence(),
        systemPrompt: system,
      });
      const answer = await session.prompt(user, {
        temperature: 0.2, // conservative — presentation not invention (§9.4)
        maxTokens: Math.min(512, Math.ceil(raw.length * 1.5) + 64),
      });
      const text = sanitizeLlmOutput(answer, raw);
      // Guard: if the model produced something wildly longer than the input,
      // it likely hallucinated — prefer the safe rule-based output.
      if (text.length > raw.length * 3 + 80) return deterministic();
      return { text, engine: 'llm' };
    } catch (_) {
      return deterministic();
    }
  }

  async dispose() {
    try { await this._context?.dispose?.(); } catch (_) { /* ignore */ }
    try { await this._model?.dispose?.(); } catch (_) { /* ignore */ }
    this._loaded = false;
  }
}

module.exports = { LlmEngine };
