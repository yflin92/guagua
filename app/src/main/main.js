'use strict';

const path = require('path');
const {
  app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage,
  clipboard, session, systemPreferences, shell,
} = require('electron');

const { IPC, MODEL_TIERS } = require('../shared/constants');
const { encodeWav } = require('../shared/wav');
const { Store } = require('./store');
const { ModelManager } = require('./models');
const { AsrEngine } = require('./asr');
const { LlmEngine } = require('./llm');
const { DictationController } = require('./dictation');
const { TextInjector, getFrontAppContext } = require('./inject');

/**
 * GuaFlow main process. Owns app lifecycle, the global push-to-talk shortcut,
 * the menubar tray, the HUD + main windows, and all privileged operations
 * (models, ASR/LLM, injection, storage). The renderer never touches the
 * filesystem or network directly.
 */

let store;
let models;
let controller;
let injector;
let mainWindow = null;
let hudWindow = null;
let tray = null;

// Live dictation state surfaced to the UI (§12 local-processing indicator).
const state = {
  status: 'idle', // idle | recording | transcribing | refining | inserting | error
  engine: 'rules', // 'llm' | 'rules'
  lastResult: null,
  activeTier: 'balanced',
  ready: false, // active tier models present
};

// ---- network guarantee -----------------------------------------------------

/**
 * Enforce the local-first promise (§9.1, §38). Blocks ALL network requests
 * except explicit model downloads from allowed hosts. When the user enables the
 * network kill-switch, even those are blocked. This is verifiable behaviour,
 * not a policy claim (§9.2).
 */
function installNetworkGuard() {
  const ALLOWED_DOWNLOAD_HOSTS = new Set([
    'huggingface.co', 'cdn-lfs.huggingface.co', 'cdn-lfs-us-1.huggingface.co',
    'cas-bridge.xethub.hf.co',
  ]);
  const filter = { urls: ['*://*/*'] };
  session.defaultSession.webRequest.onBeforeRequest(filter, (details, cb) => {
    const settings = store.getSettings();
    let host = '';
    try { host = new URL(details.url).hostname; } catch (_) { /* ignore */ }
    const isLocal = details.url.startsWith('file:') || details.url.startsWith('devtools:') ||
      host === 'localhost' || host === '127.0.0.1';
    const isModelDownload = ALLOWED_DOWNLOAD_HOSTS.has(host) && !settings.networkKillSwitch;
    if (isLocal || isModelDownload) return cb({ cancel: false });
    // Anything else — block it. Dictated content never leaves the device.
    cb({ cancel: true });
  });
}

// ---- engine wiring ---------------------------------------------------------

function buildEngines(tierId) {
  const paths = models.pathsForTier(tierId) || {};
  const asr = new AsrEngine({ modelPath: paths.asrPath });
  const llm = new LlmEngine({ modelPath: paths.llmPath });
  const ready = Boolean(paths.asrReady); // ASR readiness gates dictation
  return { asr, llm, ready };
}

function refreshEngines() {
  const settings = store.getSettings();
  state.activeTier = settings.activeTier;
  const { asr, llm, ready } = buildEngines(settings.activeTier);
  controller.setEngines({ asr, llm });
  state.ready = ready;
  broadcastState();
}

// ---- windows ---------------------------------------------------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 560,
    title: 'GuaFlow',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createHudWindow() {
  hudWindow = new BrowserWindow({
    width: 220,
    height: 64,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // allow the preload to require the shared constants module
    },
  });
  hudWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  hudWindow.loadFile(path.join(__dirname, '..', 'renderer', 'hud.html'));
}

function showHud() {
  const settings = store.getSettings();
  if (!settings.showHud || !hudWindow) return;
  hudWindow.showInactive();
}
function hideHud() { hudWindow?.hide(); }

function openMain() {
  if (!mainWindow) createMainWindow();
  else { mainWindow.show(); mainWindow.focus(); }
}

// ---- tray ------------------------------------------------------------------

function trayIcon(recording) {
  // A tiny generated dot icon; green = idle-local, red = recording.
  const size = 18;
  const color = recording ? '#ff453a' : '#30d158';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="9" cy="9" r="6" fill="${color}"/></svg>`;
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
}

function buildTray() {
  tray = new Tray(trayIcon(false));
  updateTrayMenu();
  tray.setToolTip('GuaFlow — Processing on this Mac');
  tray.on('click', () => openMain());
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: state.status === 'recording' ? '● Recording (local)' : '● Local — Processing on this Mac', enabled: false },
    { type: 'separator' },
    { label: 'Open GuaFlow…', click: () => openMain() },
    { label: 'Undo Last Insertion', click: () => injector.undo() },
    { type: 'separator' },
    { label: 'Quit GuaFlow', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// ---- push-to-talk ----------------------------------------------------------

let capturing = false;

/**
 * globalShortcut fires on key *down* only (no key-up event), so we implement
 * push-to-talk as a toggle on the same shortcut: first press starts capture,
 * second press stops and finalizes. The HUD explains this to the user.
 */
function registerHotkey() {
  globalShortcut.unregisterAll();
  const settings = store.getSettings();
  const accel = settings.hotkey || 'Alt+Space';
  try {
    const ok = globalShortcut.register(accel, toggleCapture);
    if (!ok) console.warn('Failed to register hotkey', accel);
  } catch (err) {
    console.warn('Hotkey registration error', err.message);
  }
}

function toggleCapture() {
  if (!state.ready) {
    toast('Download a model to start dictating.');
    openMain();
    return;
  }
  if (!capturing) startCapture();
  else stopCapture();
}

function startCapture() {
  capturing = true;
  setStatus('recording');
  tray?.setImage(trayIcon(true));
  updateTrayMenu();
  showHud();
  // Tell the (hidden) capture renderer to begin recording from the mic.
  hudWindow?.webContents.send(IPC.START_CAPTURE);
}

function stopCapture() {
  capturing = false;
  hudWindow?.webContents.send(IPC.STOP_CAPTURE);
  setStatus('transcribing');
  tray?.setImage(trayIcon(false));
  updateTrayMenu();
}

// ---- state broadcast -------------------------------------------------------

function broadcastState() {
  const payload = { ...state };
  mainWindow?.webContents.send(IPC.STATE_CHANGED, payload);
  hudWindow?.webContents.send(IPC.STATE_CHANGED, payload);
}
function setStatus(status) {
  state.status = status;
  broadcastState();
  hudWindow?.webContents.send(IPC.DICTATION_STATUS, { status });
}
function toast(message) {
  mainWindow?.webContents.send(IPC.TOAST, { message });
  hudWindow?.webContents.send(IPC.TOAST, { message });
}

// ---- IPC handlers ----------------------------------------------------------

function registerIpc() {
  ipcMain.handle(IPC.GET_STATE, () => ({ ...state }));
  ipcMain.handle(IPC.GET_SETTINGS, () => store.getSettings());
  ipcMain.handle(IPC.SET_SETTINGS, (_e, patch) => {
    const next = store.setSettings(patch);
    if ('hotkey' in patch) registerHotkey();
    if ('activeTier' in patch) refreshEngines();
    return next;
  });

  ipcMain.handle(IPC.GET_HARDWARE, () => models.detectHardware());
  ipcMain.handle(IPC.RECOMMEND_MODELS, () => models.recommend());
  ipcMain.handle(IPC.LIST_MODELS, () => models.listStatus());

  ipcMain.handle(IPC.DOWNLOAD_MODEL, async (_e, { tierId }) => {
    const tier = MODEL_TIERS[tierId];
    if (!tier) throw new Error('unknown tier');
    for (const model of [tier.asr, tier.llm]) {
      if (models.isDownloaded(model)) continue;
      await models.download(model, (p) => {
        mainWindow?.webContents.send(IPC.DOWNLOAD_PROGRESS, { tierId, ...p });
      });
    }
    refreshEngines();
    return models.listStatus();
  });

  ipcMain.handle(IPC.DELETE_MODEL, (_e, { file }) => {
    models.deleteModel(file);
    refreshEngines();
    return models.listStatus();
  });

  ipcMain.handle(IPC.DICTIONARY_LIST, () => store.listDictionary());
  ipcMain.handle(IPC.DICTIONARY_UPSERT, (_e, entry) => store.upsertDictionary(entry));
  ipcMain.handle(IPC.DICTIONARY_DELETE, (_e, { id }) => { store.deleteDictionary(id); return store.listDictionary(); });

  ipcMain.handle(IPC.HISTORY_LIST, () => store.listHistory());
  ipcMain.handle(IPC.HISTORY_DELETE, (_e, { id }) => { store.deleteHistory(id); return store.listHistory(); });
  ipcMain.handle(IPC.HISTORY_CLEAR, () => { store.clearHistory(); return []; });

  ipcMain.handle(IPC.ONBOARDING_COMPLETE, () => store.setSettings({ onboardingComplete: true }));

  ipcMain.handle(IPC.REQUEST_PERMISSIONS, async () => requestPermissions());

  ipcMain.handle(IPC.RUN_DEMO, async (_e, { raw }) => {
    // Runs the cleanup pipeline on provided text without touching the mic —
    // used by onboarding Step 7 to show the transformation.
    const refined = await controller.llm.refine(raw, {
      dictionary: store.listDictionary(),
      developerMode: store.getSettings().developerMode,
    });
    return refined;
  });

  ipcMain.handle(IPC.UNDO_LAST, () => injector.undo());

  // Audio from the capture renderer: it sends the finished utterance as a
  // transferable Float32Array plus its sample rate.
  ipcMain.on(IPC.AUDIO_DONE, async (_e, { samples, sampleRate, durationMs }) => {
    await finalizeUtterance(samples, sampleRate, durationMs);
  });
}

async function finalizeUtterance(samples, sampleRate, durationMs) {
  try {
    const float = samples instanceof Float32Array ? samples : new Float32Array(samples);
    if (!float.length) { setStatus('idle'); return; }
    const wav = encodeWav(float, sampleRate || 48000, 16000);

    const settings = store.getSettings();
    const context = settings.useLocalContext ? await getFrontAppContext() : { appName: '', windowTitle: '' };

    setStatus('refining');
    const result = await controller.process(wav, context);
    state.engine = result.engine;
    state.lastResult = { text: result.text, at: Date.now(), timings: result.timings };

    if (!result.text) { setStatus('idle'); toast('No speech detected.'); return; }

    setStatus('inserting');
    const inserted = await injector.insert(result.text, settings.insertionMode);
    if (!inserted.ok) {
      toast(`Text copied to clipboard (${inserted.reason || inserted.method}). Press ⌘V to paste.`);
    }
    setStatus('idle');
    // Notify the main window so the "last dictation" panel updates.
    mainWindow?.webContents.send(IPC.DICTATION_STATUS, {
      status: 'done', result: state.lastResult, engine: result.engine, method: inserted.method,
    });
  } catch (err) {
    setStatus('error');
    if (err.code === 'ASR_NOT_READY') toast('Speech model not ready. Open GuaFlow to download.');
    else toast(`Dictation error: ${err.message}`);
    setTimeout(() => setStatus('idle'), 1500);
  } finally {
    hideHud();
  }
}

// ---- permissions -----------------------------------------------------------

async function requestPermissions() {
  const result = { microphone: 'unknown', accessibility: 'unknown' };
  if (process.platform !== 'darwin') return result;
  try {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    result.microphone = micStatus;
    if (micStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      result.microphone = granted ? 'granted' : 'denied';
    }
  } catch (_) { /* ignore */ }
  try {
    // Accessibility can't be toggled programmatically; prompt + deep link.
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    result.accessibility = trusted ? 'granted' : 'denied';
    if (!trusted) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
  } catch (_) { /* ignore */ }
  return result;
}

// ---- lifecycle -------------------------------------------------------------

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  models = new ModelManager(app.getPath('userData'));
  injector = new TextInjector({ clipboard });

  const settings = store.getSettings();
  const { asr, llm, ready } = buildEngines(settings.activeTier);
  controller = new DictationController({ asr, llm, store });
  state.ready = ready;
  state.activeTier = settings.activeTier;

  installNetworkGuard();
  registerIpc();
  createHudWindow();
  createMainWindow();
  if (process.platform === 'darwin') buildTray();
  registerHotkey();

  app.on('activate', () => { if (!mainWindow) createMainWindow(); });

  // Smoke test: boot, verify wiring, exercise the demo pipeline, then exit.
  // Used in CI/dev environments without a display or real models.
  if (process.env.GUAFLOW_SMOKE === '1') runSmokeTest();
});

async function runSmokeTest() {
  const results = [];
  const check = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  try {
    check('store initialised', !!store.getSettings().hotkey);
    check('models listed (3 tiers)', models.listStatus().length === 3);
    check('hardware detected', models.detectHardware().totalRamGB > 0);
    check('recommendation valid', ['faster', 'balanced', 'best'].includes(models.recommend().recommended));
    check('hud window created', !!hudWindow);
    check('main window created', !!mainWindow);

    // Capture renderer-side errors to catch CSP violations / broken JS.
    const rendererErrors = [];
    for (const w of [mainWindow, hudWindow]) {
      w.webContents.on('console-message', (_e, level, message) => {
        if (level >= 3 || /error|is not defined|Cannot read/i.test(message)) rendererErrors.push(message);
      });
    }
    // Wait for both renderers to finish loading + run their boot scripts.
    await Promise.all([mainWindow, hudWindow].map((w) => w.webContents.isLoading()
      ? new Promise((r) => w.webContents.once('did-finish-load', r)) : Promise.resolve()));
    await new Promise((r) => setTimeout(r, 500));
    // Confirm the preload bridge is exposed and boot ran without throwing.
    const hasBridge = await mainWindow.webContents.executeJavaScript('typeof window.guaflow === "object" && typeof window.guaflow.getSettings === "function"');
    check('preload bridge exposed', hasBridge === true);
    const onboardingShown = await mainWindow.webContents.executeJavaScript('!document.getElementById("onboarding").hidden');
    check('onboarding overlay renders', onboardingShown === true);
    check('no renderer console errors', rendererErrors.length === 0);
    if (rendererErrors.length) console.log('[smoke] renderer errors:', rendererErrors.slice(0, 5));

    // Exercise the cleanup pipeline via the controller's LLM (rules fallback).
    const refined = await controller.llm.refine(
      "Hey um actually wait let's do Thursday no sorry Friday because John's out Thursday",
      { dictionary: store.listDictionary() },
    );
    check('cleanup produced text', !!refined.text && refined.text.length > 0);
    console.log('[smoke] demo output:', JSON.stringify(refined.text), 'engine:', refined.engine);
  } catch (err) {
    results.push('FAIL exception: ' + err.message);
  }
  const ok = results.every((r) => r.startsWith('PASS'));
  console.log('[smoke]\n' + results.join('\n'));
  console.log('[smoke] RESULT: ' + (ok ? 'ALL PASS' : 'FAILURES'));
  app.exit(ok ? 0 : 1);
}

app.on('window-all-closed', () => {
  // Keep running in the tray on macOS so push-to-talk stays live.
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  controller?.cleanup();
});

module.exports = { installNetworkGuard };
