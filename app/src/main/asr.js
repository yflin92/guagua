'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * Local speech recognition (§10.2). Wraps whisper.cpp.
 *
 * We prefer a whisper.cpp CLI binary (`whisper-cli`/`main`) if one is available
 * on the machine — this is what ships inside the packaged app under
 * `resources/bin`. When no binary and no model are present (e.g. this Linux
 * dev sandbox, or before the user downloads models), `transcribe()` throws a
 * typed error so the caller can fall back transparently rather than silently
 * doing anything over the network. Nothing here ever hits the network.
 */
class AsrEngine {
  /**
   * @param {object} opts
   * @param {string} opts.binPath  path to whisper.cpp cli binary
   * @param {string} opts.modelPath path to the ggml .bin model
   * @param {number} [opts.threads]
   */
  constructor(opts = {}) {
    this.binPath = opts.binPath || AsrEngine.locateBinary();
    this.modelPath = opts.modelPath || '';
    this.threads = opts.threads || Math.max(2, Math.min(8, os.cpus().length - 1));
  }

  static locateBinary() {
    const candidates = [
      process.env.GUAFLOW_WHISPER_BIN,
      path.join(process.resourcesPath || '', 'bin', 'whisper-cli'),
      path.join(process.resourcesPath || '', 'bin', 'main'),
      '/opt/homebrew/bin/whisper-cli',
      '/usr/local/bin/whisper-cli',
    ].filter(Boolean);
    for (const c of candidates) {
      try { if (fs.existsSync(c)) return c; } catch (_) { /* ignore */ }
    }
    return '';
  }

  /** True when a usable binary + model exist on this machine. */
  isReady() {
    return Boolean(this.binPath && this.modelPath &&
      fs.existsSync(this.binPath) && fs.existsSync(this.modelPath));
  }

  /**
   * Transcribe a 16 kHz mono WAV file to text.
   * @param {string} wavPath
   * @param {object} [opts] { language }
   * @returns {Promise<string>}
   */
  async transcribe(wavPath, opts = {}) {
    if (!this.isReady()) {
      const err = new Error('ASR engine not ready (missing whisper binary or model)');
      err.code = 'ASR_NOT_READY';
      throw err;
    }
    const args = [
      '-m', this.modelPath,
      '-f', wavPath,
      '-t', String(this.threads),
      '-nt', // no timestamps
      '-otxt', // also emit a .txt next to the wav
      '-l', opts.language || 'auto',
    ];
    const text = await this._run(this.binPath, args, wavPath);
    return text.trim();
  }

  _run(bin, args, wavPath) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        // whisper.cpp writes the transcript to <wav>.txt with -otxt.
        const txtPath = wavPath + '.txt';
        let fileText = '';
        try {
          if (fs.existsSync(txtPath)) {
            fileText = fs.readFileSync(txtPath, 'utf8');
            fs.rmSync(txtPath, { force: true }); // §29 minimize disk writes
          }
        } catch (_) { /* ignore */ }
        if (code === 0) {
          resolve(fileText || stdout);
        } else {
          reject(new Error(`whisper exited ${code}: ${stderr.slice(0, 500)}`));
        }
      });
    });
  }
}

module.exports = { AsrEngine };
