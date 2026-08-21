'use strict';

/* GuaFlow main-window UI controller. Pure orchestration over the preload API. */

const g = window.guaflow;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let settings = {};
let modelStatus = [];

// ---- tab navigation --------------------------------------------------------

function showTab(name) {
  $$('.nav li').forEach((li) => li.classList.toggle('active', li.dataset.tab === name));
  $$('.tab').forEach((t) => { t.hidden = t.id !== `tab-${name}`; });
  if (name === 'models') renderModels();
  if (name === 'dictionary') renderDictionary();
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
  if (name === 'privacy') renderPrivacy();
}
$$('.nav li').forEach((li) => li.addEventListener('click', () => showTab(li.dataset.tab)));
document.addEventListener('click', (e) => {
  const goto = e.target.dataset?.goto;
  if (goto) showTab(goto);
});

// ---- status chip + local badge --------------------------------------------

const STATUS_LABEL = {
  idle: ['Local · Idle', ''],
  recording: ['Local · Recording', 'rec'],
  transcribing: ['Local · Transcribing', 'busy'],
  refining: ['Local · Polishing', 'busy'],
  inserting: ['Local · Inserting', 'busy'],
  error: ['Local · Error', 'busy'],
};
function applyState(st) {
  if (!st) return;
  const [text, cls] = STATUS_LABEL[st.status] || STATUS_LABEL.idle;
  $('#statusText').textContent = text;
  const chip = $('#statusChip');
  chip.className = 'status-chip' + (cls ? ' ' + cls : '');
  $('#notReadyRow').hidden = !!st.ready;
  $('#hotkeyDisplay').textContent = prettyHotkey(settings.hotkey);
}
g.onStateChanged(applyState);

g.onDictationStatus((payload) => {
  if (payload?.status === 'done' && payload.result) {
    $('#lastCard').hidden = false;
    $('#lastText').textContent = payload.result.text;
    const t = payload.result.timings || {};
    $('#lastMeta').textContent =
      `Engine: ${payload.engine} · ASR ${t.asrMs || 0}ms · cleanup ${t.llmMs || 0}ms · total ${t.totalMs || 0}ms · inserted via ${payload.method}`;
  }
});

g.onToast(({ message }) => toast(message));

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---- home / demo -----------------------------------------------------------

$('#runDemoBtn').addEventListener('click', async () => {
  const raw = $('#demoInput').value.trim();
  if (!raw) return;
  $('#runDemoBtn').disabled = true;
  $('#runDemoBtn').textContent = 'Processing locally…';
  try {
    const res = await g.runDemo(raw);
    $('#demoOutput').hidden = false;
    $('#demoResult').textContent = res.text;
    $('#demoEngine').textContent = res.engine === 'llm' ? 'Local LLM' : 'Local rules (no LLM loaded)';
  } finally {
    $('#runDemoBtn').disabled = false;
    $('#runDemoBtn').textContent = 'Clean it up →';
  }
});

$('#undoBtn').addEventListener('click', () => g.undoLast());

// ---- models ----------------------------------------------------------------

async function renderModels() {
  const [hw, rec, list] = await Promise.all([g.getHardware(), g.recommendModels(), g.listModels()]);
  modelStatus = list;
  $('#hwInfo').innerHTML = hardwareHtml(hw);
  $('#recommendation').textContent = `Recommended: ${label(rec.recommended)} — ${rec.reason}`;

  const container = $('#tierList');
  container.innerHTML = '';
  for (const tier of list) {
    const card = document.createElement('div');
    card.className = 'card tier';
    const isActive = settings.activeTier === tier.id;
    card.innerHTML = `
      <div class="tier-info">
        <div class="tier-title">${tier.label}
          ${tier.recommendedDefault ? '<span class="tag rec">Default</span>' : ''}
          ${isActive ? '<span class="tag">Active</span>' : ''}
        </div>
        <div class="tier-sub">${tier.blurb} · ~${tier.approxSizeGB} GB · needs ${tier.minRamGB} GB RAM</div>
        <div class="tier-sub">${tier.asr.name}${tier.asr.downloaded ? ' ✓' : ''} · ${tier.llm.name}${tier.llm.downloaded ? ' ✓' : ''}</div>
        <div class="progress" id="prog-${tier.id}" hidden><div></div></div>
      </div>
      <div class="tier-actions" id="actions-${tier.id}"></div>`;
    container.appendChild(card);
    renderTierActions(tier, isActive);
  }
}

function renderTierActions(tier, isActive) {
  const el = $(`#actions-${tier.id}`);
  el.innerHTML = '';
  if (tier.ready) {
    const pill = document.createElement('div');
    pill.className = 'ready-pill';
    pill.textContent = 'Downloaded ✓';
    el.appendChild(pill);
    if (!isActive) {
      const use = document.createElement('button');
      use.className = 'btn primary';
      use.textContent = 'Use this';
      use.onclick = async () => { settings = await g.setSettings({ activeTier: tier.id }); renderModels(); };
      el.appendChild(use);
    }
    const del = document.createElement('button');
    del.className = 'btn danger';
    del.textContent = 'Remove';
    del.onclick = async () => {
      await g.deleteModel(tier.asr.file);
      await g.deleteModel(tier.llm.file);
      renderModels();
    };
    el.appendChild(del);
  } else {
    const dl = document.createElement('button');
    dl.className = 'btn primary';
    dl.textContent = `Download ${tier.approxSizeGB} GB`;
    dl.onclick = () => downloadTier(tier.id, dl);
    el.appendChild(dl);
  }
}

async function downloadTier(tierId, btn) {
  btn.disabled = true;
  btn.textContent = 'Starting…';
  const prog = $(`#prog-${tierId}`);
  prog.hidden = false;
  try {
    await g.downloadModel(tierId);
    toast(`${label(tierId)} ready — processing stays on this Mac.`);
  } catch (err) {
    toast(`Download failed: ${err.message}`);
  } finally {
    prog.hidden = true;
    settings = await g.getSettings();
    renderModels();
  }
}

g.onDownloadProgress(({ tierId, pct, received, total }) => {
  const prog = $(`#prog-${tierId}`);
  if (prog) { prog.hidden = false; prog.firstElementChild.style.width = `${pct}%`; }
  const btn = $(`#actions-${tierId} button`);
  if (btn) btn.textContent = `${pct}% (${fmtGB(received)}/${fmtGB(total)})`;
});

function hardwareHtml(hw) {
  return `${hw.appleSilicon ? 'Apple Silicon' : hw.arch} · ${hw.cpuCount} cores · ${hw.totalRamGB} GB RAM` +
    `${hw.hasNeuralEngine ? ' · Neural Engine' : ''}<br /><span class="muted">${hw.cpuModel}</span>`;
}

// ---- dictionary ------------------------------------------------------------

async function renderDictionary() {
  const items = await g.dictionaryList();
  const body = $('#dictBody');
  body.innerHTML = '';
  for (const it of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(it.spoken)}</td><td>${escapeHtml(it.written)}${it.caseSensitive ? ' <span class="muted">(Aa)</span>' : ''}</td>`;
    const td = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'link-danger';
    del.textContent = 'Delete';
    del.onclick = async () => { await g.dictionaryDelete(it.id); renderDictionary(); };
    td.appendChild(del);
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

$('#dictAdd').addEventListener('click', async () => {
  const spoken = $('#dictSpoken').value.trim();
  const written = $('#dictWritten').value.trim();
  if (!spoken || !written) return;
  await g.dictionaryUpsert({ spoken, written, caseSensitive: $('#dictCase').checked });
  $('#dictSpoken').value = ''; $('#dictWritten').value = ''; $('#dictCase').checked = false;
  renderDictionary();
});

// ---- history ---------------------------------------------------------------

async function renderHistory() {
  $('#historyDisabled').hidden = !!settings.historyEnabled;
  const list = $('#historyList');
  list.innerHTML = '';
  if (!settings.historyEnabled) return;
  const items = await g.historyList();
  if (!items.length) { list.innerHTML = '<div class="card muted">No dictations yet.</div>'; return; }
  for (const it of items) {
    const el = document.createElement('div');
    el.className = 'hist-item';
    el.innerHTML = `<div>${escapeHtml(it.text)}</div>
      <div class="hist-meta"><span>${new Date(it.at).toLocaleString()}</span>
      <span>${escapeHtml(it.app || 'unknown app')}</span><span>${it.durationMs || 0}ms</span></div>`;
    const del = document.createElement('button');
    del.className = 'link-danger';
    del.textContent = 'Delete';
    del.onclick = async () => { await g.historyDelete(it.id); renderHistory(); };
    el.appendChild(del);
    list.appendChild(el);
  }
}

$('#clearHistory').addEventListener('click', async () => { await g.historyClear(); renderHistory(); });

// ---- settings --------------------------------------------------------------

function renderSettings() {
  const body = $('#settingsBody');
  body.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';

  card.appendChild(row('Push-to-talk shortcut',
    'Press the shortcut to start, again to stop.',
    hotkeyControl()));

  card.appendChild(row('Show floating indicator',
    'Always-on-top pill showing local processing status.',
    toggle('showHud')));

  card.appendChild(row('Use local app context',
    'Read the focused app name and window title (never leaves the device) to tune style.',
    toggle('useLocalContext')));

  card.appendChild(row('Developer mode',
    'Preserve code, camelCase, snake_case and CLI syntax.',
    toggle('developerMode')));

  card.appendChild(row('Insertion method', 'How text is placed at the cursor.',
    select('insertionMode', [['auto', 'Paste (recommended)'], ['keystroke', 'Type keystrokes'], ['clipboard', 'Copy only']])));

  card.appendChild(row('Power mode', 'Trade quality for battery.',
    select('powerMode', [['maxQuality', 'Maximum Quality'], ['balanced', 'Balanced'], ['batterySaver', 'Battery Saver']])));

  card.appendChild(row('Keep local history',
    'Off by default. Stored encrypted on this Mac only.',
    toggle('historyEnabled')));

  card.appendChild(row('History retention (days)', 'Older entries are deleted automatically.',
    numberInput('historyRetentionDays', 1, 365)));

  card.appendChild(row('Anonymous telemetry',
    'Product metrics only. Never audio, transcripts or vocabulary.',
    toggle('telemetryEnabled')));

  body.appendChild(card);
}

function row(title, desc, control) {
  const el = document.createElement('label');
  el.className = 'toggle-row';
  const left = document.createElement('span');
  left.innerHTML = `<strong>${title}</strong><br /><span class="muted">${desc}</span>`;
  el.appendChild(left);
  el.appendChild(control);
  return el;
}

function toggle(key) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!settings[key];
  input.onchange = async () => {
    settings = await g.setSettings({ [key]: input.checked });
    if (key === 'showHud' || key === 'historyEnabled') { /* live */ }
  };
  return input;
}

function select(key, options) {
  const sel = document.createElement('select');
  for (const [val, lbl] of options) {
    const o = document.createElement('option');
    o.value = val; o.textContent = lbl;
    if (settings[key] === val) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = async () => { settings = await g.setSettings({ [key]: sel.value }); };
  return sel;
}

function numberInput(key, min, max) {
  const input = document.createElement('input');
  input.type = 'number'; input.min = min; input.max = max;
  input.value = settings[key];
  input.onchange = async () => { settings = await g.setSettings({ [key]: Number(input.value) }); };
  return input;
}

function hotkeyControl() {
  const input = document.createElement('input');
  input.className = 'hotkey-input';
  input.readOnly = true;
  input.value = prettyHotkey(settings.hotkey);
  input.placeholder = 'Click, then press keys';
  input.onkeydown = async (e) => {
    e.preventDefault();
    const accel = accelFromEvent(e);
    if (accel) { settings = await g.setSettings({ hotkey: accel }); input.value = prettyHotkey(accel); }
  };
  return input;
}

// ---- privacy ---------------------------------------------------------------

async function renderPrivacy() {
  $('#killSwitch').checked = !!settings.networkKillSwitch;
  $('#netStatus').textContent = settings.networkKillSwitch
    ? '⛔ All network activity is blocked (including downloads).'
    : '✓ Only model downloads you initiate are allowed. Dictated content is blocked from the network.';
}
$('#killSwitch').addEventListener('change', async (e) => {
  settings = await g.setSettings({ networkKillSwitch: e.target.checked });
  renderPrivacy();
});

// ---- helpers ---------------------------------------------------------------

function label(tierId) { return ({ faster: 'Faster', balanced: 'Balanced', best: 'Best Quality' })[tierId] || tierId; }
function fmtGB(bytes) { return (bytes / 1024 ** 3).toFixed(2) + ' GB'; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function prettyHotkey(accel) {
  if (!accel) return '⌥ Space';
  return accel.replace('CommandOrControl', '⌘').replace('Command', '⌘').replace('Control', '⌃')
    .replace('Alt', '⌥').replace('Option', '⌥').replace('Shift', '⇧').replace(/\+/g, ' ');
}
function accelFromEvent(e) {
  const parts = [];
  if (e.metaKey) parts.push('Command');
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(key)) parts.push(key === ' ' ? 'Space' : key);
  return parts.length >= 1 ? parts.join('+') : '';
}

// ---- onboarding (§36) ------------------------------------------------------

const OB_STEPS = [
  { emoji: '🔒', title: 'Welcome to GuaFlow', body: 'Private AI voice dictation. Speak naturally, get polished text — and your voice never leaves this Mac.' },
  { emoji: '🖥️', title: 'Hardware check', body: '', render: obHardware },
  { emoji: '⬇️', title: 'Download models', body: '', render: obModels },
  { emoji: '🎙️', title: 'Permissions', body: 'GuaFlow needs your microphone (to hear you) and Accessibility (to type text into other apps). Both are used only locally.', render: obPermissions },
  { emoji: '🛡️', title: 'Your voice stays here', body: 'Audio, transcripts and cleanup all happen on this device. No raw audio or text is ever uploaded.' },
  { emoji: '⌨️', title: 'Push to talk', body: 'Press your shortcut to start recording, press it again to stop. Text appears at your cursor.', render: obShortcut },
  { emoji: '✨', title: 'See it in action', body: '', render: obDemo },
  { emoji: '🚀', title: 'You’re set', body: 'Open Slack, Gmail, your terminal or anywhere you type, and press your shortcut. Enjoy private dictation.' },
];
let obIndex = 0;

async function startOnboarding() {
  obIndex = 0;
  $('#onboarding').hidden = false;
  renderOb();
}

async function renderOb() {
  const step = OB_STEPS[obIndex];
  const ov = $('#onboarding');
  const dots = OB_STEPS.map((_, i) => `<span class="${i === obIndex ? 'on' : ''}"></span>`).join('');
  const extra = step.render ? await step.render() : '';
  ov.innerHTML = `
    <div class="ob-card"><div class="ob-step">
      <div class="ob-emoji">${step.emoji}</div>
      <h2>${step.title}</h2>
      <p>${step.body}</p>
      <div class="ob-extra">${extra}</div>
      <div class="ob-dots">${dots}</div>
      <div class="ob-actions">
        ${obIndex > 0 ? '<button class="btn ghost" id="obBack">Back</button>' : ''}
        <button class="btn primary" id="obNext">${obIndex === OB_STEPS.length - 1 ? 'Finish' : 'Continue'}</button>
      </div>
    </div></div>`;
  $('#obNext').onclick = obNext;
  const back = $('#obBack'); if (back) back.onclick = () => { obIndex--; renderOb(); };
  if (step.after) step.after();
}

async function obNext() {
  if (obIndex === OB_STEPS.length - 1) {
    settings = await g.completeOnboarding();
    $('#onboarding').hidden = true;
    boot();
    return;
  }
  obIndex++;
  renderOb();
}

async function obHardware() {
  const rec = await g.recommendModels();
  return `<div class="ob-io card">Your Mac supports <strong>${label(rec.recommended)}</strong> local processing.<br />
    <span class="muted">${rec.reason}</span></div>`;
}

async function obModels() {
  const rec = await g.recommendModels();
  const list = await g.listModels();
  const tier = list.find((t) => t.id === rec.recommended);
  if (tier.ready) return `<div class="ob-io card">${label(tier.id)} models are already downloaded ✓</div>`;
  setTimeout(() => {
    const btn = document.getElementById('obDownload');
    if (btn) btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Downloading…';
      try { await g.downloadModel(tier.id); btn.textContent = 'Downloaded ✓'; }
      catch (e) { btn.textContent = 'Retry download'; btn.disabled = false; toast(e.message); }
    };
    g.onDownloadProgress(({ pct }) => { const b = document.getElementById('obDownload'); if (b) b.textContent = `Downloading ${pct}%`; });
  }, 0);
  return `<div class="ob-io card">GuaFlow processes your voice on this Mac. Download ~${tier.approxSizeGB} GB of AI models to continue.
    <br /><br /><button class="btn primary" id="obDownload">Download ${label(tier.id)} models</button>
    <br /><span class="muted">You can skip and download later from Models.</span></div>`;
}

function obPermissions() {
  setTimeout(() => {
    const btn = document.getElementById('obPerms');
    if (btn) btn.onclick = async () => {
      const res = await g.requestPermissions();
      btn.textContent = `Mic: ${res.microphone} · Accessibility: ${res.accessibility}`;
    };
  }, 0);
  return `<div class="ob-io card"><button class="btn primary" id="obPerms">Grant permissions</button></div>`;
}

function obShortcut() {
  return `<div class="ob-io card">Current shortcut: <strong>${prettyHotkey(settings.hotkey)}</strong>
    <br /><span class="muted">Change it anytime in Settings.</span></div>`;
}

function obDemo() {
  setTimeout(() => {
    const btn = document.getElementById('obDemoBtn');
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      const res = await g.runDemo("Tell Alex I'll be ten minutes late");
      document.getElementById('obDemoOut').innerHTML =
        `<div class="io-text">${escapeHtml(res.text)}</div><div class="processed">Processed locally ✓</div>`;
      btn.disabled = false;
    };
  }, 0);
  return `<div class="ob-io card">
    <div class="muted">You say:</div><div class="io-text">“Tell Alex I'll be ten minutes late.”</div>
    <button class="btn primary" id="obDemoBtn">Clean it up</button>
    <div id="obDemoOut"></div></div>`;
}

// ---- boot ------------------------------------------------------------------

async function boot() {
  settings = await g.getSettings();
  const st = await g.getState();
  applyState(st);
  $('#hotkeyDisplay').textContent = prettyHotkey(settings.hotkey);
  if (!settings.onboardingComplete) startOnboarding();
}

boot();
