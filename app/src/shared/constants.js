'use strict';

/**
 * Shared, environment-agnostic constants used by both the main and renderer
 * processes. No Node/Electron APIs here so the file can be imported anywhere.
 */

/** IPC channel names. Centralised to avoid magic strings drifting apart. */
const IPC = {
  // renderer -> main (invoke/handle)
  GET_STATE: 'guagua:getState',
  GET_SETTINGS: 'guagua:getSettings',
  SET_SETTINGS: 'guagua:setSettings',
  LIST_MODELS: 'guagua:listModels',
  DOWNLOAD_MODEL: 'guagua:downloadModel',
  DELETE_MODEL: 'guagua:deleteModel',
  RECOMMEND_MODELS: 'guagua:recommendModels',
  GET_HARDWARE: 'guagua:getHardware',
  DICTIONARY_LIST: 'guagua:dictionaryList',
  DICTIONARY_UPSERT: 'guagua:dictionaryUpsert',
  DICTIONARY_DELETE: 'guagua:dictionaryDelete',
  HISTORY_LIST: 'guagua:historyList',
  HISTORY_CLEAR: 'guagua:historyClear',
  HISTORY_DELETE: 'guagua:historyDelete',
  ONBOARDING_COMPLETE: 'guagua:onboardingComplete',
  REQUEST_PERMISSIONS: 'guagua:requestPermissions',
  RUN_DEMO: 'guagua:runDemo',
  UNDO_LAST: 'guagua:undoLast',
  // renderer(HUD/audio worker) -> main
  AUDIO_CHUNK: 'guagua:audioChunk',
  AUDIO_DONE: 'guagua:audioDone',
  SET_HOTKEY: 'guagua:setHotkey',

  // main -> renderer (send/on)
  STATE_CHANGED: 'guagua:stateChanged',
  DICTATION_STATUS: 'guagua:dictationStatus',
  DOWNLOAD_PROGRESS: 'guagua:downloadProgress',
  START_CAPTURE: 'guagua:startCapture',
  STOP_CAPTURE: 'guagua:stopCapture',
  TOAST: 'guagua:toast',
};

/**
 * Local model tiers. The PRD (§18) asks us to hide model architecture behind
 * plain "Faster / Balanced / Best Quality" labels. Each tier pairs an ASR
 * (whisper.cpp GGML) model with a small instruct LLM (GGUF) used for cleanup.
 */
const MODEL_TIERS = {
  faster: {
    id: 'faster',
    label: 'Faster',
    blurb: 'Lowest latency and memory. Great for older Apple Silicon or Battery Saver.',
    approxSizeGB: 1.6,
    minRamGB: 8,
    asr: {
      id: 'whisper-base.en',
      name: 'Whisper Base (English)',
      file: 'ggml-base.en.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
      sha256: '',
      sizeBytes: 147951465,
    },
    llm: {
      id: 'qwen2.5-0.5b-instruct-q4',
      name: 'Qwen2.5 0.5B Instruct (Q4_K_M)',
      file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
      url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
      sha256: '',
      sizeBytes: 491000000,
    },
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Default. Balances latency, quality and memory for most Macs.',
    approxSizeGB: 4.2,
    minRamGB: 16,
    recommendedDefault: true,
    asr: {
      id: 'whisper-small.en',
      name: 'Whisper Small (English)',
      file: 'ggml-small.en.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
      sha256: '',
      sizeBytes: 487601967,
    },
    llm: {
      id: 'qwen2.5-3b-instruct-q4',
      name: 'Qwen2.5 3B Instruct (Q4_K_M)',
      file: 'qwen2.5-3b-instruct-q4_k_m.gguf',
      url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
      sha256: '',
      sizeBytes: 2100000000,
    },
  },
  best: {
    id: 'best',
    label: 'Best Quality',
    blurb: 'Highest quality. For high-end Macs with ample unified memory.',
    approxSizeGB: 9.5,
    minRamGB: 32,
    asr: {
      id: 'whisper-medium.en',
      name: 'Whisper Medium (English)',
      file: 'ggml-medium.en.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
      sha256: '',
      sizeBytes: 1533763059,
    },
    llm: {
      id: 'qwen2.5-7b-instruct-q4',
      name: 'Qwen2.5 7B Instruct (Q4_K_M)',
      file: 'qwen2.5-7b-instruct-q4_k_m.gguf',
      url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
      sha256: '',
      sizeBytes: 4700000000,
    },
  },
};

const POWER_MODES = {
  maxQuality: 'maxQuality',
  balanced: 'balanced',
  batterySaver: 'batterySaver',
};

const DEFAULT_SETTINGS = {
  hotkey: 'Alt+Space', // push-to-talk (hold). CommandOrControl reserved by many apps.
  activeTier: 'balanced',
  powerMode: POWER_MODES.balanced,
  showHud: true,
  useLocalContext: true, // §16 — user can disable context access
  developerMode: false, // §22
  historyEnabled: false, // §23 — off by default
  historyRetentionDays: 7,
  telemetryEnabled: false, // §28 — disableable, off by default in local build
  networkKillSwitch: false, // §9.2 optional network-disable mode
  insertionMode: 'auto', // 'auto' | 'clipboard' | 'keystroke'
  onboardingComplete: false,
};

/** Words/tokens treated as disfluency by the deterministic fallback cleaner. */
const FILLER_WORDS = [
  'um', 'uh', 'erm', 'ah', 'like', 'you know', 'i mean', 'sort of',
  'kind of', 'basically', 'actually', 'literally', 'so', 'well',
];

/** Self-correction cue phrases (§14). */
const CORRECTION_CUES = [
  'actually', 'wait', 'sorry', 'i mean', 'no', 'scratch that', 'correction',
  'let me rephrase', 'rather',
];

module.exports = {
  IPC,
  MODEL_TIERS,
  POWER_MODES,
  DEFAULT_SETTINGS,
  FILLER_WORDS,
  CORRECTION_CUES,
};
