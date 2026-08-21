'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC } = require('../shared/constants');

/**
 * The single, audited bridge between the sandboxed renderer and the privileged
 * main process. The renderer gets exactly these methods — no Node, no fs, no
 * network. Every dictated byte is handled in main; the UI only orchestrates.
 */
const api = {
  // state + settings
  getState: () => ipcRenderer.invoke(IPC.GET_STATE),
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (patch) => ipcRenderer.invoke(IPC.SET_SETTINGS, patch),

  // hardware + models
  getHardware: () => ipcRenderer.invoke(IPC.GET_HARDWARE),
  recommendModels: () => ipcRenderer.invoke(IPC.RECOMMEND_MODELS),
  listModels: () => ipcRenderer.invoke(IPC.LIST_MODELS),
  downloadModel: (tierId) => ipcRenderer.invoke(IPC.DOWNLOAD_MODEL, { tierId }),
  deleteModel: (file) => ipcRenderer.invoke(IPC.DELETE_MODEL, { file }),

  // dictionary
  dictionaryList: () => ipcRenderer.invoke(IPC.DICTIONARY_LIST),
  dictionaryUpsert: (entry) => ipcRenderer.invoke(IPC.DICTIONARY_UPSERT, entry),
  dictionaryDelete: (id) => ipcRenderer.invoke(IPC.DICTIONARY_DELETE, { id }),

  // history
  historyList: () => ipcRenderer.invoke(IPC.HISTORY_LIST),
  historyDelete: (id) => ipcRenderer.invoke(IPC.HISTORY_DELETE, { id }),
  historyClear: () => ipcRenderer.invoke(IPC.HISTORY_CLEAR),

  // onboarding / permissions / demo
  completeOnboarding: () => ipcRenderer.invoke(IPC.ONBOARDING_COMPLETE),
  requestPermissions: () => ipcRenderer.invoke(IPC.REQUEST_PERMISSIONS),
  runDemo: (raw) => ipcRenderer.invoke(IPC.RUN_DEMO, { raw }),
  undoLast: () => ipcRenderer.invoke(IPC.UNDO_LAST),

  // capture renderer -> main (audio payload)
  sendAudio: (payload) => ipcRenderer.send(IPC.AUDIO_DONE, payload),

  // subscriptions (main -> renderer)
  onStateChanged: (cb) => sub(IPC.STATE_CHANGED, cb),
  onDictationStatus: (cb) => sub(IPC.DICTATION_STATUS, cb),
  onDownloadProgress: (cb) => sub(IPC.DOWNLOAD_PROGRESS, cb),
  onStartCapture: (cb) => sub(IPC.START_CAPTURE, cb),
  onStopCapture: (cb) => sub(IPC.STOP_CAPTURE, cb),
  onToast: (cb) => sub(IPC.TOAST, cb),
};

function sub(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('guaflow', api);
