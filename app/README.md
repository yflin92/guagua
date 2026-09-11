# guagua — Local-First AI Voice Dictation (macOS)

> **Speak naturally. Get polished text. Keep your voice private.**

guagua is a privacy-first AI voice dictation desktop app. Press a shortcut,
speak, and polished text appears at your cursor in any app — with **all**
speech recognition and text cleanup running **on your device**. No raw audio or
dictated text is ever sent to a server.

This is an MVP implementation of the PRD *Local-First AI Voice Dictation*
(working name **guagua**), built with Electron so it runs on macOS (primary
target) and can be developed cross-platform.

---

## What it does (MVP scope, PRD §45)

- **Global push-to-talk** — a system-wide shortcut starts/stops recording.
- **Local microphone capture** with noise suppression and level metering.
- **Local ASR** via [whisper.cpp](https://github.com/ggerganov/whisper.cpp).
- **Local LLM cleanup** via [node-llama-cpp](https://github.com/withcatai/node-llama-cpp)
  (a small Qwen2.5 instruct model), with a **deterministic rule-based fallback**
  that always runs locally when no LLM is loaded.
- **Intelligent cleanup** — filler removal, repetition removal, auto-punctuation,
  sentence restructuring, and **self-correction handling** ("actually", "wait",
  "sorry", "scratch that", …).
- **Text insertion** into any focused app (clipboard-paste, keystroke, or copy).
- **Personal dictionary** — teach it names, acronyms, and technical terms.
- **Undo**, **hardware-aware model selection**, a **local-processing indicator**
  HUD, and **full offline operation**.
- **Developer mode** — `camelCase`, `snake_case`, CLI flags, code symbols.
- **App-specific styles** (Slack, Gmail, Cursor, Terminal, …).
- **Private history** (off by default, encrypted at rest, one-click delete).
- **Command mode** ("make it shorter", "turn into bullet points").

## Architecture (PRD §10, §40)

```
mic (renderer/WebAudio)
   ↓  Float32 samples → 16kHz mono WAV
Local ASR (whisper.cpp)                 src/main/asr.js
   ↓  raw transcript
Local cleanup                           src/main/dictation.js
   ├─ Local LLM (node-llama-cpp)        src/main/llm.js
   └─ Deterministic fallback            src/main/cleanup.js
   ↓  polished text
Text injection (AppleScript/clipboard)  src/main/inject.js
   ↓
cursor in the focused app
```

- **Main process** owns everything privileged: global hotkey, models, ASR/LLM,
  injection, encrypted local storage. See `src/main/`.
- **Renderer** is sandboxed and talks to main only through an audited preload
  bridge (`src/preload/preload.js`). It never touches the filesystem or network.
- **Network guard** (`installNetworkGuard` in `src/main/main.js`) blocks *all*
  network requests except explicit model downloads from Hugging Face — and even
  those when the **network kill-switch** is on. Dictated content can't leave.

## Privacy guarantees (PRD §9, §27–29)

- Audio, transcripts, and cleanup all happen locally.
- No raw audio / transcript / final text / surrounding context is ever uploaded.
- Works fully offline once models are downloaded.
- History is **off by default**, encrypted with AES-256-GCM using a key held in
  the macOS keychain (Electron `safeStorage`) when available.
- Temporary WAV files are deleted immediately after transcription; audio buffers
  are released after processing.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full data-flow and the
verifiable privacy design.

## Running

Requires Node 18+ and (on Linux dev boxes) the usual Electron system libraries.

```bash
cd app
npm install          # installs Electron + optional native model libs
npm start            # launches the app
```

On first launch, onboarding checks your hardware, recommends a model tier,
downloads models (with your consent), and requests microphone + Accessibility
permissions.

> **Note on models:** ASR and LLM weights are downloaded on demand from Hugging
> Face during onboarding or from the **Models** tab. Until then, cleanup uses the
> deterministic local fallback so the app is fully functional and testable
> without gigabytes of downloads.

## Testing

```bash
npm test                      # 22 unit tests (cleanup, store, models)
GUAGUA_SMOKE=1 xvfb-run -a electron . --no-sandbox   # boot smoke test
```

The smoke test boots the real Electron app headlessly, verifies window/preload/
onboarding wiring, checks for renderer console errors, and runs the cleanup
pipeline end-to-end.

## Packaging (macOS)

```bash
npm run dist         # electron-builder → arm64 .dmg
```

The build embeds `NSMicrophoneUsageDescription` and
`NSAppleEventsUsageDescription`. Ship a whisper.cpp binary under
`resources/bin/` (see `AsrEngine.locateBinary`).

## Project layout

| Path | Purpose |
|---|---|
| `src/main/main.js` | App lifecycle, hotkey, tray, IPC, network guard |
| `src/main/dictation.js` | Pipeline orchestration (ASR → cleanup → insert) |
| `src/main/asr.js` | whisper.cpp wrapper |
| `src/main/llm.js` | local LLM wrapper + rule fallback |
| `src/main/cleanup.js` | deterministic speech cleanup (pure, tested) |
| `src/main/models.js` | model download + hardware-aware tier selection |
| `src/main/inject.js` | macOS text injection + front-app context |
| `src/main/store.js` | encrypted local storage (settings/dictionary/history) |
| `src/main/appProfiles.js` | app-specific style profiles |
| `src/renderer/` | main window UI + HUD + audio capture |
| `src/preload/preload.js` | audited renderer↔main bridge |
| `src/shared/` | constants + WAV encoder (used by both processes) |

## Status

MVP. Real ASR/LLM inference requires the native libraries + downloaded models on
an Apple Silicon Mac. On other platforms the app runs, the UI and storage work,
and cleanup uses the deterministic local engine.
