# GuaFlow

Local-First AI Voice Dictation for macOS — working name **GuaFlow**.

> Speak naturally. Get polished text. Keep your voice private.

- **Product requirements:** [`PRD — Local-First AI Voice Dictation.md`](./PRD%20%E2%80%94%20Local-First%20AI%20Voice%20Dictation.md)
- **Application:** [`app/`](./app) — Electron desktop app (macOS target).
  See [`app/README.md`](./app/README.md) and [`app/ARCHITECTURE.md`](./app/ARCHITECTURE.md).

## Quick start

```bash
cd app
npm install
npm start
```

Speech recognition and text cleanup run entirely on-device (whisper.cpp + a
small local LLM), with a deterministic local fallback so the app works before
any model download. No raw audio or dictated text ever leaves the machine.
