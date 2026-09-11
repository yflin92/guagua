'use strict';

/**
 * HUD + hidden audio-capture renderer.
 *
 * This one window does double duty: it draws the always-on-top local-processing
 * indicator (§12) AND owns the microphone. Mic capture must live in a renderer
 * (the main process has no WebAudio), so we keep it here and stream the finished
 * utterance to main via the preload bridge. Audio never leaves the machine.
 */

const dot = document.getElementById('dot');
const label = document.getElementById('label');
const sub = document.getElementById('sub');
const barsEl = document.getElementById('bars');

const NUM_BARS = 7;
const bars = [];
for (let i = 0; i < NUM_BARS; i++) {
  const b = document.createElement('div');
  b.className = 'bar';
  barsEl.appendChild(b);
  bars.push(b);
}

const STATUS_TEXT = {
  idle: ['● Local', 'Processing on this Mac'],
  recording: ['● Recording', 'Speak now — hotkey to stop'],
  transcribing: ['● Transcribing', 'On-device speech model'],
  refining: ['● Polishing', 'On-device language model'],
  inserting: ['● Inserting', 'At your cursor'],
  error: ['● Error', 'See Guagua window'],
};

function setStatus(status) {
  const [l, s] = STATUS_TEXT[status] || STATUS_TEXT.idle;
  label.textContent = l;
  sub.textContent = s;
  dot.className = 'dot';
  if (status === 'recording') dot.classList.add('recording');
  else if (status === 'transcribing' || status === 'refining' || status === 'inserting') dot.classList.add('busy');
}

window.guagua.onDictationStatus(({ status }) => { if (status) setStatus(status); });
window.guagua.onStateChanged((st) => { if (st?.status) setStatus(st.status); });

// ---- audio capture ---------------------------------------------------------

let mediaStream = null;
let audioContext = null;
let processor = null;
let sourceNode = null;
let chunks = [];
let capturing = false;
let startTs = 0;

async function startCapture() {
  if (capturing) return;
  chunks = [];
  capturing = true;
  startTs = Date.now();
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true, // §10.1 noise suppression
        autoGainControl: true,
      },
    });
    audioContext = new AudioContext();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    // ScriptProcessor is deprecated but universally available and simple; for a
    // production build this would be an AudioWorklet.
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!capturing) return;
      const input = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      drawLevel(input);
    };
    sourceNode.connect(processor);
    processor.connect(audioContext.destination);
  } catch (err) {
    capturing = false;
    setStatus('error');
    sub.textContent = 'Microphone blocked';
  }
}

function stopCapture() {
  if (!capturing) return;
  capturing = false;
  const sampleRate = audioContext ? audioContext.sampleRate : 48000;
  const durationMs = Date.now() - startTs;
  teardown();

  // Concatenate the captured chunks into one Float32Array.
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const samples = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { samples.set(c, off); off += c.length; }
  chunks = [];
  resetBars();

  // Hand the utterance to main for local ASR + cleanup + insertion.
  window.guagua.sendAudio({ samples, sampleRate, durationMs });
}

function teardown() {
  try { processor?.disconnect(); } catch (_) {}
  try { sourceNode?.disconnect(); } catch (_) {}
  try { audioContext?.close(); } catch (_) {}
  try { mediaStream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
  processor = sourceNode = audioContext = mediaStream = null;
}

function drawLevel(input) {
  // Compute a coarse RMS and animate the bars.
  let sum = 0;
  for (let i = 0; i < input.length; i += 32) sum += input[i] * input[i];
  const rms = Math.sqrt(sum / (input.length / 32));
  const level = Math.min(1, rms * 6);
  for (let i = 0; i < bars.length; i++) {
    const jitter = 0.5 + Math.abs(Math.sin(i * 1.7 + Date.now() / 120)) * 0.5;
    bars[i].style.height = `${3 + level * 15 * jitter}px`;
  }
}

function resetBars() { bars.forEach((b) => { b.style.height = '3px'; }); }

window.guagua.onStartCapture(() => startCapture());
window.guagua.onStopCapture(() => stopCapture());

setStatus('idle');
