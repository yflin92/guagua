# PRD — Local-First AI Voice Dictation

**Product:** Working name: guagua  
**Product area:** Private AI Voice Dictation  
**Status:** Draft  
**Owner:** Product  
**Last updated:** August 2026

---

# 1. Executive Summary

guagua is a privacy-first AI voice dictation product that lets users write into virtually any application by speaking instead of typing.

The product experience is similar to modern AI dictation tools: users press a shortcut, speak naturally, and receive polished written text at their cursor.

The key architectural difference is:

> **Voice data never needs to leave the user's device.**

Speech recognition, text cleanup, self-correction handling, formatting, and personalization are performed locally using on-device speech models and local language models.

No raw audio is sent to a remote inference server for normal dictation.

This allows guagua to serve users who want AI-powered voice input but are unwilling or unable to send sensitive speech to third-party cloud services.

The core product promise is:

> **Speak naturally. Get polished text. Keep your voice private.**

---

# 2. Problem

Typing is a slow interface for converting thought into text.

Modern AI dictation significantly improves this experience by converting natural, messy speech into polished writing.

However, cloud-based voice products introduce another problem:

> Users must transmit what they say to somebody else's servers.

Voice dictation frequently contains sensitive information:

- confidential company information;
- source code;
- customer data;
- financial information;
- legal discussions;
- medical information;
- private messages;
- passwords or identifiers spoken accidentally;
- unreleased product plans.

This creates friction for privacy-conscious users and may make cloud voice tools unacceptable for:

- enterprise employees;
- developers working with proprietary code;
- regulated industries;
- government users;
- security teams;
- lawyers;
- healthcare professionals;
- users who simply prefer local computing.

Existing alternatives generally force users to choose between:

**high-quality AI dictation with cloud processing**

and

**private local dictation with lower intelligence or worse UX.**

guagua aims to eliminate that tradeoff.

---

# 3. Product Vision

Make private voice input a native interface for computing.

Users should be able to speak naturally anywhere they can type while knowing that their voice remains on their device.

The long-term vision is:

> **A local voice intelligence layer between the user and their operating system.**

guagua should eventually understand:

- what the user said;
- what they meant;
- what application they are using;
- how they prefer to write;
- what terminology they use;

without requiring that personal context to be uploaded to a centralized AI service.

---

# 4. Core Product Thesis

Speech recognition alone is increasingly commoditized.

The valuable product is the transformation:

**natural speech**

↓

**local speech recognition**

↓

**local intent understanding**

↓

**local context + personalization**

↓

**polished text**

The differentiator is therefore not merely:

> "We run Whisper locally."

It is:

> **We deliver cloud-quality AI dictation while keeping the intelligence boundary on the user's device.**

---

# 5. Goals

## G1 — Privacy by Architecture

Normal dictation must not require transmission of raw audio or dictated content to guagua infrastructure.

Target:

**100% of standard dictation inference can execute locally.**

The product should remain functional when disconnected from the internet.

---

## G2 — Cloud-Class Dictation Quality

Privacy cannot come at the cost of significantly worse writing.

Users should receive:

- filler removal;
- punctuation;
- sentence restructuring;
- repetition removal;
- correction handling;
- context-aware terminology;
- formatting.

The goal is for a user to perceive little or no quality loss relative to leading cloud AI dictation products.

---

## G3 — Fast Interaction

Local inference should make the experience feel immediate.

Target:

**end of speech → usable text in under 1 second for typical utterances on supported hardware.**

---

## G4 — Universal Input

guagua should work in essentially any place the user can type.

Examples:

- Slack;
- Gmail;
- Messages;
- Notion;
- Google Docs;
- Cursor;
- VS Code;
- ChatGPT;
- terminals;
- browsers;
- native desktop applications.

---

## G5 — Local Personalization

The product should learn the individual user while keeping personalization data on-device.

Examples:

- names;
- acronyms;
- company terminology;
- writing preferences;
- frequently used phrases;
- technical vocabulary.

---

# 6. Non-Goals

The first version is not intended to:

- become a general-purpose local chatbot;
- replace a full text editor;
- autonomously send messages;
- continuously listen to ambient conversations;
- act as a meeting transcription service;
- control every desktop application by voice;
- provide server-side storage of users' transcripts;
- require cloud inference for normal usage.

Cloud functionality may eventually exist as an explicit opt-in capability, but the core product must remain usable locally.

---

# 7. Target Users

## Persona 1 — Software Engineer

Writes:

- code prompts;
- Slack messages;
- documentation;
- terminal commands;
- technical specifications;
- code comments.

### Pain

Cloud dictation may expose:

- proprietary source code;
- internal project names;
- architectural details;
- credentials spoken accidentally.

### Desired outcome

Use high-quality voice input while ensuring company information remains on the machine.

---

## Persona 2 — Privacy-Conscious Knowledge Worker

Examples:

- founders;
- executives;
- investors;
- product managers;
- researchers.

### Pain

They like voice interfaces but are uncomfortable sending every spoken thought to a remote inference provider.

### Desired outcome

A voice tool they can confidently use for both personal and confidential work.

---

## Persona 3 — Regulated Enterprise User

Examples:

- finance;
- healthcare;
- legal;
- government;
- defense;
- enterprise security.

### Pain

Cloud AI tools may violate internal data-handling policies.

### Desired outcome

AI-powered dictation that can operate under strict data residency and privacy requirements.

---

## Persona 4 — Offline / Travel User

### Pain

Cloud dictation becomes unreliable or unusable:

- on planes;
- with poor Wi-Fi;
- while traveling;
- behind restrictive networks.

### Desired outcome

Full-quality dictation without a network connection.

---

# 8. Jobs To Be Done

### JTBD 1 — Write privately

> When I need to write confidential information, I want to dictate it without sending my speech to an external server.

### JTBD 2 — Write faster

> When I have a detailed thought, I want to speak naturally instead of typing it.

### JTBD 3 — Dictate technical material

> When I am discussing code or proprietary systems, I want accurate transcription without exposing the content to an outside service.

### JTBD 4 — Work offline

> When I don't have reliable internet access, I want the same dictation experience.

### JTBD 5 — Maintain local memory

> When I repeatedly correct terminology, I want the system to learn those corrections without uploading my vocabulary or writing history.

---

# 9. Product Principles

## 9.1 Local by Default

All normal voice processing happens on-device.

Cloud processing must never be silently introduced as a fallback.

If local processing fails, the product should fail transparently rather than quietly upload the user's audio.

---

## 9.2 Privacy Must Be Verifiable

"Private" cannot merely be a marketing claim.

Users should be able to understand exactly what leaves their device.

The product should provide a clear privacy status such as:

**Processing locally**

and ideally expose network behavior that can be independently audited.

---

## 9.3 Intent Over Literal Transcription

The system should produce the text the user intended to write rather than a word-for-word transcript.

---

## 9.4 Never Unexpectedly Change Meaning

The model may aggressively improve presentation but must remain conservative about semantics.

Especially protect:

- names;
- numbers;
- dates;
- monetary values;
- URLs;
- negations;
- commitments.

---

## 9.5 Graceful Hardware Scaling

Local inference performance varies greatly by machine.

The product should adapt model size and quality to available hardware.

A user on a high-end Apple Silicon machine may use a larger model than someone on an older laptop.

---

# 10. Core Architecture

guagua consists of four primary local components.

## 10.1 Audio Capture Layer

Captures microphone input locally.

Responsibilities:

- microphone access;
- noise suppression;
- voice activity detection;
- audio buffering;
- recording lifecycle.

Raw audio remains in local memory or temporary local storage.

---

## 10.2 Local Speech Recognition

Audio is converted to text using an on-device speech recognition model.

Possible model classes:

- Whisper-derived models;
- distilled ASR models;
- platform-specific neural speech models.

Requirements:

- streaming or near-streaming transcription;
- multilingual support;
- quantized inference;
- hardware acceleration.

---

## 10.3 Local Language Model

The raw transcript is passed to a local LLM.

Its responsibilities include:

- filler removal;
- punctuation;
- sentence restructuring;
- repetition removal;
- self-correction handling;
- formatting;
- context-aware vocabulary;
- tone adjustment.

Example:

Raw transcript:

> "Hey um actually wait let's do Thursday no sorry Friday because John's out Thursday"

Local model output:

> "Hey, let's do Friday since John is out Thursday."

---

## 10.4 Text Injection Layer

The resulting text is inserted into the currently focused application.

Possible platform mechanisms:

- macOS Accessibility APIs;
- Windows UI Automation;
- clipboard fallback;
- virtual keyboard injection.

---

# 11. P0 — Global Dictation

The primary interaction:

1. User focuses a text field.
2. User holds the guagua shortcut.
3. Recording begins immediately.
4. User speaks.
5. User releases the shortcut.
6. Audio is transcribed locally.
7. Transcript is processed locally by the LLM.
8. Final text appears at the cursor.

No server round-trip is required.

---

# 12. P0 — Local Processing Indicator

Because privacy is the product's core differentiator, users should receive a subtle visual guarantee during dictation.

Example:

**● Local**

or:

**Processing on this Mac**

The indicator should not dominate the interface but should reinforce trust.

---

# 13. P0 — Intelligent Speech Cleanup

The local model should convert spoken language into clean written language.

### Filler removal

Input:

> "So um I think we should uh ship tomorrow."

Output:

> "I think we should ship tomorrow."

---

### Repetition removal

Input:

> "We should we should probably delay this."

Output:

> "We should probably delay this."

---

### Automatic punctuation

Infer:

- periods;
- commas;
- questions;
- paragraph breaks.

---

### Sentence restructuring

Input:

> "The issue is basically like we're waiting for legal and because of that I think we need to push the launch."

Output:

> "We're still waiting for legal, so I think we need to push the launch."

---

# 14. P0 — Self-Correction Handling

Natural speech contains edits.

Example:

> "Let's meet Tuesday—actually Wednesday at 2."

Output:

> "Let's meet Wednesday at 2."

Recognize:

- actually;
- wait;
- sorry;
- I mean;
- no;
- scratch that;
- correction.

This processing happens locally.

---

# 15. P0 — Personal Dictionary

Users can teach the model vocabulary.

Examples:

- employee names;
- client names;
- product names;
- acronyms;
- technical terms.

All dictionary data is stored locally.

Example:

| Spoken phrase | Preferred output |
|---|---|
| "Wispr" | Wispr |
| "cube control" | kubectl |
| "PG bouncer" | PgBouncer |
| "Aditi" | Aditi |

---

# 16. P0 — Local Context Awareness

The system should optionally use local application context to improve output.

Examples:

- surrounding text;
- app name;
- window title;
- repository vocabulary;
- recently used words.

Important architectural rule:

> Context remains on-device.

Example:

If the current document repeatedly mentions:

`Temporal`

and the ASR produces:

`temporal`

the local model may infer the product name.

Users must be able to disable context access.

---

# 17. P0 — Offline Mode

Core dictation must work with:

**Wi-Fi disabled.**

Offline functionality includes:

- speech recognition;
- cleanup;
- text insertion;
- local dictionary;
- personalization;
- history where enabled.

Internet access may be required only for:

- account authentication;
- software updates;
- model downloads;
- billing;
- optional synchronization.

---

# 18. P0 — Model Download and Management

Local inference requires downloaded model weights.

Onboarding should automatically recommend a model based on available hardware.

Example tiers:

### Light

~1–2 GB

Optimized for:

- older hardware;
- lower RAM;
- maximum speed.

### Balanced

~3–6 GB

Default recommendation.

Balances:

- latency;
- quality;
- memory.

### Max Quality

~8–15+ GB

For high-end machines with sufficient unified memory or GPU resources.

Users should not need to understand model architecture to choose.

Prefer labels such as:

**Faster**

**Balanced**

**Best Quality**

---

# 19. P1 — Automatic Model Selection

The application should detect:

- operating system;
- available RAM;
- GPU;
- NPU;
- Apple Neural Engine;
- CPU capabilities;
- battery state.

It should choose an appropriate model and quantization level.

Example:

**MacBook Air M1, 8 GB**

→ lightweight model.

**MacBook Pro M4 Max, 64 GB**

→ higher-quality model.

---

# 20. P1 — Local Style Personalization

The system should learn how the user writes.

Potential learned patterns:

- punctuation;
- sentence length;
- capitalization;
- emoji usage;
- formal vs casual tone;
- common phrases.

This personalization should be represented as small local preference data rather than a centralized behavioral profile.

Where feasible, preferences should be editable.

---

# 21. P1 — App-Specific Style

The system can maintain local profiles for applications.

Example:

### Slack

Short, conversational output.

### Gmail

Complete sentences and greetings.

### Cursor

Technical terminology and precise instructions.

### Terminal

Minimal cleanup and syntax preservation.

The selected app profile is passed to the local LLM as context.

---

# 22. P1 — Developer Mode

Developer mode optimizes speech-to-text for technical environments.

Support:

- `camelCase`;
- `snake_case`;
- filenames;
- terminal syntax;
- code symbols;
- command-line flags;
- libraries;
- infrastructure terms.

Example:

Spoken:

> "kubectl get pods dash n production"

Output:

`kubectl get pods -n production`

Spoken:

> "user underscore id"

Output:

`user_id`

---

# 23. P1 — Private History

Users may optionally maintain a local history of recent dictations.

History can enable:

- reusing previous text;
- fixing mistakes;
- personalization;
- searching previous dictations.

Requirements:

- off by default or clearly disclosed;
- stored locally;
- encrypted where feasible;
- configurable retention;
- one-click delete;
- never uploaded by default.

---

# 24. P1 — Local Snippets

Users can create private voice-triggered snippets.

Example:

User says:

> "insert my scheduling link"

Output:

`https://cal.com/example`

Snippets remain on-device unless synchronization is explicitly enabled.

---

# 25. P1 — Command Mode

Users can perform local text transformations.

Examples:

> "Make that shorter."

> "Turn that into bullet points."

> "Make it more casual."

> "Undo that."

The local model applies the transformation without transmitting the text externally.

---

# 26. P1 — Encrypted Device Sync

Some users will want vocabulary and preferences available across devices.

This creates tension with the local-first model.

Sync should therefore be optional and end-to-end encrypted.

Possible synced data:

- dictionary;
- snippets;
- preferences;
- app profiles.

The server should only see encrypted blobs.

The server should not require access to plaintext user data.

---

# 27. Cloud Policy

The product may need cloud infrastructure for:

- authentication;
- billing;
- software updates;
- crash telemetry;
- model distribution;
- optional encrypted sync.

However:

### Prohibited by default

- raw audio upload;
- transcript upload;
- LLM inference on dictated content;
- surrounding-screen-context upload;
- centralized training on user dictation.

Any future cloud-enhanced inference feature must be:

1. explicitly opt-in;
2. visibly indicated;
3. disabled by default;
4. architecturally separate from local mode.

---

# 28. Telemetry

Telemetry poses a special privacy challenge.

The system should collect product metrics without collecting user content.

Allowed examples:

- dictation duration;
- inference latency;
- model version;
- application category;
- crash reports;
- hardware type;
- success/failure;
- model memory usage.

Do not collect by default:

- audio;
- raw transcript;
- final transcript;
- surrounding text;
- vocabulary entries.

Telemetry should be disableable.

---

# 29. Security Model

Local processing improves privacy but does not eliminate security risk.

Sensitive data exists in:

- microphone buffers;
- process memory;
- model context windows;
- temporary files;
- local history;
- clipboard operations.

Requirements:

- minimize disk writes;
- clear audio buffers after processing;
- encrypt persistent local data;
- avoid logging dictated text;
- redact user content from crash reports;
- use secure OS storage for encryption keys;
- document subprocess behavior.

---

# 30. Performance Requirements

Local inference introduces different constraints from cloud inference.

## Recording start

Shortcut → active recording:

**<100 ms**

---

## ASR latency

For supported hardware:

**Real-time factor <0.5**

Example:

10 seconds of speech should ideally transcribe in under 5 seconds, with streaming making most of this latency invisible.

---

## Final transformation

Raw transcript → polished text:

Target:

**P50 <500 ms**

**P95 <1.5 seconds**

on recommended hardware.

---

## Total perceived finalization

End of speech → inserted text:

Target:

**P50 <800 ms**

**P95 <2 seconds**

for normal utterances on recommended machines.

---

# 31. Hardware Requirements

Initial launch should intentionally restrict supported hardware if necessary.

Example macOS target:

### Minimum

- Apple Silicon;
- 8 GB RAM;
- recent macOS version.

### Recommended

- Apple Silicon;
- 16+ GB unified memory.

Intel Macs may initially be unsupported if they cannot meet acceptable latency and thermal requirements.

Windows hardware should similarly receive minimum GPU/NPU/CPU requirements.

---

# 32. Battery and Thermal Requirements

Local inference consumes device resources.

The product should track:

- battery consumption;
- CPU utilization;
- GPU utilization;
- sustained thermal load.

Potential behavior:

On battery:

→ use smaller model.

Plugged in:

→ enable higher-quality model.

Users may choose:

- Maximum Quality;
- Balanced;
- Battery Saver.

---

# 33. Quality Metrics

Word Error Rate alone is insufficient.

## Semantic Accuracy

Does the final text preserve the user's intended meaning?

Especially measure:

- names;
- numbers;
- dates;
- negations;
- technical terminology.

---

## Post-Dictation Edit Rate

How much does the user edit the output?

Target:

Median:

**<5% of characters changed.**

---

## Undo Rate

Percentage of dictations immediately undone.

---

## Correction Rate

How often users manually fix:

- names;
- numbers;
- terminology;
- sentence meaning.

---

## Local Processing Rate

Percentage of dictations completed without cloud content processing.

Target:

**100% in standard local mode.**

---

# 34. North Star Metric

## Successfully dictated words per weekly active user

With a privacy guardrail:

## % of dictations processed fully locally

The product succeeds when users:

1. dictate frequently;
2. accept the output;
3. trust the privacy model.

---

# 35. Trust Metrics

Because trust is central to the product, explicitly measure:

- percentage of users who understand processing is local;
- privacy-settings interaction;
- cloud-feature opt-in rate;
- uninstall reasons related to privacy;
- enterprise security approval rate.

Potential survey question:

> "How confident are you that guagua keeps your dictated content private?"

---

# 36. Onboarding

The onboarding flow should demonstrate both value and privacy.

## Step 1 — Install

Install the desktop application.

## Step 2 — Hardware Check

Automatically identify suitable model configuration.

Example:

> **Your Mac supports Best Quality local processing.**

## Step 3 — Download Models

Display:

> "guagua processes your voice on this Mac. Download 4.2 GB of AI models to continue."

## Step 4 — Permissions

Request:

- microphone;
- accessibility / input permissions.

Clearly explain why each is needed.

## Step 5 — Privacy Explanation

Concise statement:

> **Your voice and dictated text stay on this device.**

Avoid burying this inside a privacy policy.

## Step 6 — Shortcut

Teach push-to-talk.

## Step 7 — Demo

User speaks:

> "Tell Alex I'll be ten minutes late."

Flow outputs:

> "Hey Alex, I'll be about ten minutes late."

Show:

**Processed locally ✓**

## Step 8 — Try in Another App

Encourage user to open:

- Slack;
- Messages;
- Gmail;
- ChatGPT.

---

# 37. Monetization

A local product has unusual economics because inference cost is borne primarily by the user's hardware.

This can become a strategic advantage.

## Free

Includes:

- local dictation;
- baseline model;
- limited personalization;
- basic dictionary.

Possible limits should be product-driven rather than token-cost-driven.

---

## Pro

Possible paid capabilities:

- higher-quality local models;
- advanced rewriting;
- developer mode;
- app-specific profiles;
- local history;
- advanced personalization;
- encrypted cross-device sync;
- custom commands.

Example price:

**$8–15/month**

or potentially:

**one-time desktop license + paid upgrades.**

A lifetime or perpetual license may be more viable than for cloud inference products because marginal inference costs are low.

---

## Enterprise

Enterprise value proposition:

> **Deploy AI dictation without sending employee speech to external inference providers.**

Capabilities:

- SSO;
- SCIM;
- MDM;
- centralized policy;
- disable cloud features;
- enforce local-only mode;
- model version control;
- network allowlists;
- audit logs without text content;
- offline deployment;
- private model distribution.

This may be the strongest commercial differentiation.

---

# 38. Enterprise Local-Only Mode

Administrators can enforce:

**Local inference only**

When enabled:

- cloud inference code path is disabled;
- user cannot opt into content upload;
- transcript sync is unavailable unless E2E encrypted and permitted;
- networking can be restricted to approved endpoints.

Ideally the product should continue to function behind a firewall that blocks all nonessential traffic.

---

# 39. Key Risks

## Risk 1 — Model Quality

Small local models may underperform larger cloud models.

Mitigation:

- task-specific fine-tuning;
- constrained prompts;
- multi-stage pipeline;
- distillation;
- quantization-aware optimization;
- context engineering.

The task is narrow enough that a smaller specialized model may outperform a larger general model.

---

## Risk 2 — Hardware Fragmentation

Performance varies significantly by device.

Mitigation:

- initially target Apple Silicon;
- benchmark hardware automatically;
- dynamically select model size;
- clearly communicate minimum requirements.

---

## Risk 3 — Model Download Size

Users may resist downloading several gigabytes.

Mitigation:

- progressive model download;
- small default model;
- optional quality upgrade;
- delta model updates.

---

## Risk 4 — Battery Consumption

Constant local inference could reduce battery life.

Mitigation:

- inference only when invoked;
- efficient quantized models;
- hardware acceleration;
- adaptive model selection.

---

## Risk 5 — Privacy Claim Credibility

Users may distrust marketing claims.

Mitigation:

- transparent architecture;
- publish security documentation;
- independent audit;
- open-source critical privacy components;
- visible local-processing status;
- optional network-disable mode.

---

## Risk 6 — OS Input Restrictions

Universal insertion remains difficult across operating systems.

Mitigation:

- Accessibility APIs;
- clipboard fallback;
- extensive app compatibility testing.

---

# 40. Technical Strategy

A strong implementation may use a two-model pipeline.

## Stage 1 — Local ASR

Optimized speech model converts:

**audio → raw transcript**

Example:

> "hey um let's ship monday actually wait tuesday because legal needs another day"

---

## Stage 2 — Local Text Model

A small specialized LLM converts:

**raw transcript + local context → final text**

Output:

> "Hey, let's ship Tuesday since legal needs another day."

This separation allows each model to specialize.

The text model may only require a few billion parameters because the task is narrow.

---

# 41. Why a Small Local LLM Can Work

The product does not need a frontier general-purpose reasoning model.

Its primary task is constrained:

- repair speech;
- remove disfluency;
- interpret corrections;
- apply punctuation;
- lightly rewrite;
- preserve meaning.

This creates an opportunity to train or fine-tune a relatively small model specifically for:

**spoken language → intended written language**

Benefits:

- lower latency;
- lower RAM;
- lower battery use;
- easier distribution;
- better determinism;
- less hallucination.

---

# 42. Model Training Strategy

A proprietary model can become a core moat.

Training data pairs:

**messy spoken utterance**

→

**ideal written output**

Include examples of:

- filler words;
- interruptions;
- corrections;
- repeated phrases;
- informal grammar;
- technical terms;
- multilingual speech;
- dictated punctuation;
- code-related content.

The goal is not general intelligence.

The goal is exceptional performance on a narrow transformation task.

---

# 43. Privacy Architecture as a Moat

Traditional AI SaaS products improve through centralized user data.

guagua should instead improve through:

- better base models;
- synthetic training data;
- opt-in anonymous feedback;
- local personalization;
- federated techniques where appropriate.

The product's architectural constraint may itself become an advantage.

Competitors built around cloud processing may have difficulty credibly retrofitting a local-first privacy model.

---

# 44. Competitive Positioning

Do not position primarily as:

> "Wispr Flow but offline."

The stronger positioning is:

> **The private voice interface for your computer.**

Potential comparison:

| Capability | Traditional Dictation | Cloud AI Dictation | guagua |
|---|---|---|---|
| Voice transcription | Yes | Yes | Yes |
| Intelligent rewriting | Limited | Yes | Yes |
| Universal input | Varies | Yes | Yes |
| Personalized | Limited | Yes | Yes |
| Offline | Sometimes | No / limited | Yes |
| Raw audio stays local | Often | Usually no | Yes |
| Text stays local | Often | Usually no | Yes |
| Enterprise data control | Limited | Policy-based | Architecture-based |

The differentiation is:

**Privacy by architecture, not privacy by policy.**

---

# 45. MVP Scope

The first version should target:

**macOS + Apple Silicon**

and include only:

1. Global push-to-talk.
2. Local microphone capture.
3. Local ASR.
4. Local LLM cleanup.
5. Filler removal.
6. Automatic punctuation.
7. Self-correction detection.
8. Text insertion into arbitrary apps.
9. Local personal dictionary.
10. Undo.
11. Hardware-aware model selection.
12. Clear local-processing indicator.
13. Full offline operation.

Do not initially build:

- mobile;
- Windows;
- meetings;
- cloud inference;
- agents;
- complex voice commands;
- team collaboration;
- server-side transcript history.

---

# 46. MVP Launch Criteria

Ship when, on supported hardware:

- P95 finalization latency <2 seconds;
- text insertion success >99%;
- median post-dictation edit rate <10%;
- critical number/entity preservation >99%;
- offline dictation success = online dictation success;
- zero dictated-content network requests during local mode;
- D7 retention shows repeated usage;
- users perceive output quality as comparable to leading cloud dictation tools.

---

# 47. Strategic Roadmap

## Phase 1 — Local Dictation

**Voice → polished text**

Build the habit.

---

## Phase 2 — Local Personalization

**Voice + my vocabulary + my style → personalized text**

Increase switching costs and quality.

---

## Phase 3 — Local Editing Commands

> "Make this shorter."

> "Turn this into bullets."

> "Make this more professional."

Expand from dictation into text manipulation.

---

## Phase 4 — Local Context Intelligence

Use:

- active application;
- document context;
- local repository context;
- contacts;
- calendar;

while keeping sensitive context on-device.

---

## Phase 5 — Local Voice Actions

> "Reply that Tuesday works."

> "Create a task for this."

> "Summarize this page."

At this point guagua evolves from:

**private AI dictation**

into:

**a private local voice interface for computing.**

---

# 48. Product Thesis

The product should not ask users to choose between:

**privacy**

and

**AI quality.**

Its fundamental bet is that modern consumer hardware has become powerful enough for a narrow, highly optimized local AI system to provide a cloud-quality dictation experience.

If successful, guagua becomes more than an offline transcription utility.

It becomes:

> **A private, personalized language layer running directly on the user's computer.**

The wedge is voice dictation.

The long-term opportunity is the **local AI interface to the operating system.**