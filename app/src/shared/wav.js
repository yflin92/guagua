'use strict';

/**
 * Minimal 16-bit PCM WAV encoder. Whisper.cpp expects 16 kHz mono. The renderer
 * captures Float32 samples at the AudioContext rate; we downsample to 16 kHz and
 * pack to Int16 here. Kept dependency-free so it works in both processes.
 */

/**
 * @param {Float32Array} samples mono float samples in [-1, 1]
 * @param {number} inputRate     source sample rate
 * @param {number} [targetRate]  default 16000
 * @returns {Buffer} WAV file bytes
 */
function encodeWav(samples, inputRate, targetRate = 16000) {
  const down = inputRate === targetRate ? samples : downsample(samples, inputRate, targetRate);
  const numSamples = down.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(targetRate, 24);
  buffer.writeUInt32LE(targetRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, down[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(s | 0, offset);
    offset += 2;
  }
  return buffer;
}

/** Simple linear-interpolation downsampler. */
function downsample(samples, inputRate, targetRate) {
  if (targetRate >= inputRate) return samples;
  const ratio = inputRate / targetRate;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = idx - lo;
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }
  return out;
}

module.exports = { encodeWav, downsample };
