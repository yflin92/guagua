# guagua Architecture & Privacy Design

This document describes how guagua processes voice locally and how the
privacy guarantee is enforced *by architecture* rather than by policy
(PRD §9.2, §43–44).

## Process model

guagua is an Electron app with a strict main/renderer split:

- **Main process** (Node, privileged) — the only place with filesystem,
  network, child-process, and OS-integration access. It owns models, ASR/LLM,
  text injection, encrypted storage, the global hotkey, and the network guard.
- **Renderer processes** (Chromium, sandboxed) — the main-window UI and the HUD.
  `contextIsolation: true`, `nodeIntegration: false`. They reach the main
  process only through a small, explicit preload bridge.
- **Preload bridge** (`src/preload/preload.js`) — exposes a fixed set of methods
  on `window.guagua`. There is no general-purpose IPC and no raw Node access in
  the UI.

## Dictation data flow

1. **Capture** — the HUD renderer records the microphone via WebAudio
   (noise suppression, echo cancellation, AGC). Samples stay in renderer memory.
2. **Transfer** — on stop, the finished utterance (Float32 samples + sample
   rate) is sent to main over IPC. It is never written anywhere else.
3. **Encode** — main downsamples to 16 kHz mono and writes a temporary WAV to a
   per-run temp dir (`src/shared/wav.js`).
4. **ASR** — whisper.cpp transcribes the WAV to raw text
   (`src/main/asr.js`). The temp WAV and whisper's `.txt` are deleted
   immediately afterwards; the sample buffer reference is dropped.
5. **Cleanup** — the raw transcript is refined by the local LLM
   (`src/main/llm.js`), or by the deterministic rule engine
   (`src/main/cleanup.js`) when no LLM is loaded. Both are 100% local.
6. **Insert** — the polished text is placed at the cursor
   (`src/main/inject.js`) via clipboard-paste (default), keystroke, or copy.
7. **(Optional) History** — only if the user enabled it, an encrypted entry is
   appended (`src/main/store.js`).

At no step does audio or text leave the machine.

## The network guard

`installNetworkGuard()` in `src/main/main.js` registers a
`webRequest.onBeforeRequest` handler on the default session that **cancels every
request** except:

- `file:` / `devtools:` / `localhost` (the app's own UI), and
- HTTPS GETs to an allow-list of Hugging Face model-hosting hosts — and only
  when the user is downloading models and the **network kill-switch** is off.

This means that even if a bug tried to POST a transcript somewhere, the request
would be blocked at the session layer. The behaviour is observable: with the
kill-switch on, the app makes **zero** network requests and still dictates
(offline mode, PRD §17).

## Storage & encryption (PRD §29)

- **Settings** and the **personal dictionary** are plain JSON under the app's
  userData dir, written with `0600` permissions.
- **History** (opt-in) is encrypted at rest with **AES-256-GCM**. The 256-bit
  key is stored via Electron `safeStorage` (macOS Keychain) when available, or
  in a `0600` key file as a fallback. Plaintext dictation text never appears in
  the history file — verified by a unit test.
- Temporary audio files are removed right after transcription to minimise disk
  residency.

## Hardware-aware model selection (PRD §18–19)

`ModelManager.recommend()` reads total RAM, architecture (Apple Silicon), and
core count, then recommends a tier:

| Tier | ASR | LLM | ~Size | Min RAM |
|---|---|---|---|---|
| Faster | Whisper Base.en | Qwen2.5 0.5B Q4 | ~1.6 GB | 8 GB |
| Balanced (default) | Whisper Small.en | Qwen2.5 3B Q4 | ~4.2 GB | 16 GB |
| Best Quality | Whisper Medium.en | Qwen2.5 7B Q4 | ~9.5 GB | 32 GB |

The recommendation never exceeds the machine's RAM budget. Users pick from
plain labels ("Faster / Balanced / Best Quality") and never see architecture
details.

## Cleanup engine (PRD §13–14, §22)

`src/main/cleanup.js` is a pure, dependency-free module used both as the LLM
fallback and as the LLM prompt builder/post-processor. Its transforms, in order:

1. **Personal dictionary** — longest-match-first phrase replacement.
2. **Developer mode** — spoken symbols → code (`dash n` → `-n`,
   `user underscore id` → `user_id`).
3. **Self-correction** — keep the final alternative after cue words.
4. **Repetition removal** — collapse stutters and repeated phrases.
5. **Filler removal** — drop "um/uh/you know/…" conservatively.
6. **Auto-punctuation** — capitalisation, sentence terminators, question marks.

The design rule (PRD §9.4): improve *presentation* aggressively, but never alter
*meaning* — names, numbers, dates, money, URLs, and negations are preserved. The
LLM prompt (`buildLlmPrompt`) encodes the same constraints, and
`sanitizeLlmOutput` guards against the model adding commentary or hallucinating.

## Telemetry (PRD §28)

Off by default. When enabled, only content-free metrics are eligible (latency,
model version, coarse app *category* — never the app name, transcript, or
vocabulary). App category is derived locally by `appCategory()`.

## Testability

- `npm test` runs 22 unit tests covering the cleanup transforms (against the
  exact PRD examples), the encrypted store, and model recommendation.
- `GUAGUA_SMOKE=1` boots the real Electron app headlessly and asserts the
  window/preload/onboarding wiring, absence of renderer errors, and a working
  end-to-end cleanup pass.
