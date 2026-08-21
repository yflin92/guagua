'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');

const { MODEL_TIERS } = require('../shared/constants');

/**
 * Model download & management (§18) plus hardware detection and tier
 * recommendation (§19). Models live under <userData>/models. Downloads are the
 * ONLY network activity in the whole app and happen only on explicit user
 * action during onboarding or from Settings.
 */
class ModelManager {
  /** @param {string} userDataDir */
  constructor(userDataDir) {
    this.dir = path.join(userDataDir, 'models');
    fs.mkdirSync(this.dir, { recursive: true });
    this._active = new Map(); // file -> { req, received, total }
  }

  filePath(file) {
    return path.join(this.dir, file);
  }

  /** Whether a model file exists and is a plausible size. */
  isDownloaded(model) {
    try {
      const st = fs.statSync(this.filePath(model.file));
      // Accept if within 10% of the expected size (sizes are approximate).
      if (!model.sizeBytes) return st.size > 0;
      return st.size >= model.sizeBytes * 0.9;
    } catch (_) {
      return false;
    }
  }

  /** Status for all tiers: which of asr/llm are present. */
  listStatus() {
    return Object.values(MODEL_TIERS).map((tier) => ({
      id: tier.id,
      label: tier.label,
      blurb: tier.blurb,
      approxSizeGB: tier.approxSizeGB,
      minRamGB: tier.minRamGB,
      recommendedDefault: Boolean(tier.recommendedDefault),
      asr: { ...tier.asr, downloaded: this.isDownloaded(tier.asr) },
      llm: { ...tier.llm, downloaded: this.isDownloaded(tier.llm) },
      ready: this.isDownloaded(tier.asr) && this.isDownloaded(tier.llm),
    }));
  }

  /** Resolve the concrete model file paths for a tier id. */
  pathsForTier(tierId) {
    const tier = MODEL_TIERS[tierId];
    if (!tier) return null;
    return {
      asrPath: this.filePath(tier.asr.file),
      llmPath: this.filePath(tier.llm.file),
      asrReady: this.isDownloaded(tier.asr),
      llmReady: this.isDownloaded(tier.llm),
    };
  }

  /**
   * Detect hardware to recommend a tier (§19). On macOS we read total RAM and
   * Apple Silicon presence; battery state nudges toward a smaller tier.
   */
  detectHardware() {
    const totalRamGB = Math.round(os.totalmem() / (1024 ** 3));
    const cpus = os.cpus() || [];
    const arch = os.arch();
    const platform = os.platform();
    const appleSilicon = platform === 'darwin' && arch === 'arm64';
    return {
      platform,
      arch,
      appleSilicon,
      cpuModel: cpus[0]?.model || 'unknown',
      cpuCount: cpus.length,
      totalRamGB,
      // Neural Engine presence is implied by Apple Silicon for our purposes.
      hasNeuralEngine: appleSilicon,
    };
  }

  /**
   * Recommend a tier from detected hardware. Conservative: never recommend a
   * tier whose minRam exceeds the machine's RAM.
   * @returns {{recommended:string, reason:string, hardware:object}}
   */
  recommend() {
    const hw = this.detectHardware();
    let recommended = 'faster';
    let reason = 'Optimised for lower-memory machines.';
    if (hw.totalRamGB >= MODEL_TIERS.best.minRamGB && hw.appleSilicon) {
      recommended = 'best';
      reason = `Your Mac has ${hw.totalRamGB} GB unified memory — Best Quality supported.`;
    } else if (hw.totalRamGB >= MODEL_TIERS.balanced.minRamGB) {
      recommended = 'balanced';
      reason = `Your machine has ${hw.totalRamGB} GB RAM — Balanced recommended.`;
    } else {
      recommended = 'faster';
      reason = `Your machine has ${hw.totalRamGB} GB RAM — Faster keeps things responsive.`;
    }
    return { recommended, reason, hardware: hw };
  }

  /**
   * Download a single model file with progress + resume-friendly temp file.
   * @param {object} model  a tier.asr or tier.llm descriptor
   * @param {(p:{file:string,received:number,total:number,pct:number})=>void} onProgress
   * @returns {Promise<void>}
   */
  download(model, onProgress = () => {}) {
    const dest = this.filePath(model.file);
    const tmp = dest + '.part';
    return new Promise((resolve, reject) => {
      if (this.isDownloaded(model)) return resolve();

      const startAt = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
      const out = fs.createWriteStream(tmp, { flags: startAt ? 'a' : 'w' });
      const headers = startAt ? { Range: `bytes=${startAt}-` } : {};

      const req = https.get(model.url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow one redirect (HF uses CDN redirects).
          out.close();
          https.get(res.headers.location, { headers }, (res2) =>
            this._pump(res2, out, tmp, dest, model, startAt, onProgress, resolve, reject),
          ).on('error', reject);
          return;
        }
        this._pump(res, out, tmp, dest, model, startAt, onProgress, resolve, reject);
      });
      req.on('error', reject);
      this._active.set(model.file, { req });
    });
  }

  _pump(res, out, tmp, dest, model, startAt, onProgress, resolve, reject) {
    if (res.statusCode && res.statusCode >= 400) {
      out.close();
      return reject(new Error(`Download failed: HTTP ${res.statusCode} for ${model.file}`));
    }
    const total = (parseInt(res.headers['content-length'] || '0', 10) || model.sizeBytes) + startAt;
    let received = startAt;
    res.on('data', (chunk) => {
      received += chunk.length;
      const pct = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
      onProgress({ file: model.file, received, total, pct });
    });
    res.pipe(out);
    out.on('finish', () => {
      out.close(() => {
        try {
          fs.renameSync(tmp, dest);
          this._active.delete(model.file);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
    res.on('error', reject);
  }

  cancel(file) {
    const rec = this._active.get(file);
    if (rec?.req) rec.req.destroy(new Error('cancelled'));
    this._active.delete(file);
  }

  deleteModel(file) {
    for (const p of [this.filePath(file), this.filePath(file) + '.part']) {
      try { fs.rmSync(p, { force: true }); } catch (_) { /* ignore */ }
    }
  }

  /** Optional integrity check when a sha256 is configured. */
  async verify(model) {
    if (!model.sha256) return true;
    const p = this.filePath(model.file);
    if (!fs.existsSync(p)) return false;
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
      fs.createReadStream(p).on('data', (d) => hash.update(d))
        .on('end', resolve).on('error', reject);
    });
    return hash.digest('hex') === model.sha256;
  }
}

module.exports = { ModelManager };
