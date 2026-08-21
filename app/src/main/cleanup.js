'use strict';

const { FILLER_WORDS, CORRECTION_CUES } = require('../shared/constants');

/**
 * Deterministic speech-cleanup.
 *
 * This module does two jobs:
 *  1. It is the *fallback* transform used when no local LLM is loaded (offline,
 *     still-downloading, or Faster tier on constrained hardware).
 *  2. It builds the prompt and post-processes output for the local LLM stage.
 *
 * The design goal from the PRD (§9.4) is: aggressively improve *presentation*,
 * but stay conservative about *meaning* — never rewrite names, numbers, dates,
 * money, URLs, or negations. The rule-based pass below is intentionally
 * literal: it only removes disfluency, collapses stutters, applies the personal
 * dictionary, resolves explicit self-corrections, and adds light punctuation.
 */

/** Escape a string for safe inclusion in a RegExp. */
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply the personal dictionary (§15). Longer spoken phrases are applied first
 * so "cube control" wins over a hypothetical "cube" entry.
 * @param {string} text
 * @param {Array<{spoken:string,written:string,caseSensitive:boolean}>} dict
 */
function applyDictionary(text, dict = []) {
  const sorted = [...dict]
    .filter((e) => e.spoken && e.written)
    .sort((a, b) => b.spoken.length - a.spoken.length);
  let out = text;
  for (const entry of sorted) {
    const flags = entry.caseSensitive ? 'g' : 'gi';
    // Word-ish boundaries: allow the phrase to be surrounded by non-word chars.
    const re = new RegExp(`(^|[^\\w])(${esc(entry.spoken)})(?=[^\\w]|$)`, flags);
    out = out.replace(re, (_m, pre) => `${pre}${entry.written}`);
  }
  return out;
}

/** Remove filler words as standalone tokens, preserving surrounding words. */
function removeFillers(text) {
  let out = text;
  // Multi-word fillers first.
  const multi = FILLER_WORDS.filter((w) => w.includes(' '));
  const single = FILLER_WORDS.filter((w) => !w.includes(' '));
  for (const w of multi) {
    out = out.replace(new RegExp(`(^|[^\\w])${esc(w)}(?=[^\\w]|$)`, 'gi'), '$1');
  }
  // Only strip single-word fillers that are risky-but-common as disfluency.
  // Keep it conservative: "so"/"well"/"actually" at clause starts, plain "um/uh".
  const alwaysFiller = ['um', 'uh', 'erm', 'ah', 'you know', 'i mean', 'sort of', 'kind of'];
  for (const w of single) {
    if (alwaysFiller.includes(w)) {
      out = out.replace(new RegExp(`(^|[^\\w])${esc(w)}(?=[^\\w]|$)`, 'gi'), '$1');
    }
  }
  // Leading "so/well/basically/actually/literally ," at a sentence start.
  out = out.replace(/(^|[.!?]\s+)(so|well|basically|actually|literally)\b[,\s]*/gi,
    (_m, pre) => pre);
  return out;
}

/** Collapse immediate word/phrase repetitions: "we should we should" -> "we should". */
function removeRepetitions(text) {
  // Repeated single words: "the the" -> "the".
  let out = text.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
  // Repeated short phrases up to 4 words: "we should we should probably".
  out = out.replace(/\b((?:\w+\s+){1,3}\w+)\s+\1\b/gi, '$1');
  return out;
}

/**
 * Resolve explicit self-corrections (§14). When a correction cue appears, we
 * keep the text *after* the cue and drop the immediately preceding fragment
 * that it replaces, up to the previous punctuation or clause boundary.
 *
 * Example: "Let's meet Tuesday, actually Wednesday at 2" ->
 *          "Let's meet Wednesday at 2".
 */
function resolveCorrections(text) {
  return _reassembleCorrections(text);
}


/**
 * Safer clause-level correction resolver. Splits on cues and keeps only the
 * final alternative within each comma/dash-delimited group.
 */
function _reassembleCorrections(text) {
  const cueAlt = CORRECTION_CUES.map(esc).join('|');
  const cueRe = new RegExp(`(?:[,—–-]\\s*)?\\b(?:${cueAlt})\\b[,:]?\\s+`, 'i');
  // Work sentence by sentence.
  return text.split(/([.!?]\s+)/).map((seg) => {
    if (!cueRe.test(seg)) return seg;
    // Split the segment on the cue; the replacement follows the last cue.
    const parts = seg.split(new RegExp(`(?:[,—–-]\\s*)?\\b(?:${cueAlt})\\b[,:]?\\s+`, 'i'));
    const replacement = parts[parts.length - 1].trim();
    const head = parts[0].trim();
    // Remove the trailing corrected token(s) from head: drop last 1-3 words.
    const hw = head.split(/\s+/);
    const drop = Math.min(3, Math.max(1, Math.round(hw.length / 3)));
    const keptHead = hw.slice(0, Math.max(0, hw.length - drop)).join(' ');
    return (keptHead ? keptHead + ' ' : '') + replacement;
  }).join('');
}

/** Light auto-punctuation and capitalisation (§13). Conservative. */
function autoPunctuate(text) {
  let out = text.trim().replace(/\s+/g, ' ');
  if (!out) return out;
  // Capitalise the first letter of each sentence.
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase());
  // Standalone "i" -> "I".
  out = out.replace(/\bi\b/g, 'I');
  // Question detection: leading interrogatives without terminal punctuation.
  if (!/[.!?]$/.test(out)) {
    if (/^(who|what|when|where|why|how|is|are|do|does|did|can|could|would|will|should)\b/i.test(out)) {
      out += '?';
    } else {
      out += '.';
    }
  }
  return out;
}

/** Developer-mode spoken-symbol transforms (§22). Applied before punctuation. */
function applyDeveloperMode(text) {
  let out = text;
  const map = [
    [/\bdash\s+n\b/gi, '-n'],
    [/\bdash\s+dash\s+(\w+)/gi, '--$1'],
    [/\bdash\s+(\w)\b/gi, '-$1'],
    [/(\w)\s+underscore\s+(\w)/gi, '$1_$2'],
    [/(\w)\s+dot\s+(\w)/gi, '$1.$2'],
    [/(\w)\s+slash\s+(\w)/gi, '$1/$2'],
    [/\bopen\s+paren\b/gi, '('],
    [/\bclose\s+paren\b/gi, ')'],
    [/\bopen\s+brace\b/gi, '{'],
    [/\bclose\s+brace\b/gi, '}'],
    [/\bsemicolon\b/gi, ';'],
  ];
  for (const [re, rep] of map) out = out.replace(re, rep);
  // Tidy spaces we may have introduced around symbols.
  out = out.replace(/\s+([._/])\s+/g, '$1');
  return out;
}

/**
 * Full deterministic cleanup pipeline. Order matters: dictionary → dev-mode →
 * corrections → repetitions → fillers → punctuation.
 *
 * @param {string} raw           raw ASR transcript
 * @param {object} opts
 * @param {Array}  opts.dictionary personal dictionary entries
 * @param {boolean} opts.developerMode
 * @returns {string}
 */
function cleanupDeterministic(raw, opts = {}) {
  if (!raw || !raw.trim()) return '';
  let out = raw.trim();
  out = applyDictionary(out, opts.dictionary || []);
  if (opts.developerMode) out = applyDeveloperMode(out);
  out = resolveCorrections(out);
  out = removeRepetitions(out);
  out = removeFillers(out);
  out = out.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ');
  out = autoPunctuate(out);
  return out.trim();
}

/**
 * Build the constrained system+user prompt for the local LLM stage (§40).
 * The prompt forbids semantic drift and demands text-only output.
 */
function buildLlmPrompt(raw, opts = {}) {
  const dictLines = (opts.dictionary || [])
    .filter((e) => e.spoken && e.written)
    .map((e) => `- when I say "${e.spoken}", write "${e.written}"`)
    .join('\n');

  const appLine = opts.appName ? `The user is writing in ${opts.appName}. ` : '';
  const styleLine = opts.appStyle ? `${opts.appStyle} ` : '';
  const devLine = opts.developerMode
    ? 'Developer mode: preserve code, filenames, camelCase, snake_case, CLI flags and command syntax verbatim. '
    : '';

  const system = [
    'You convert a raw voice transcript into clean written text.',
    'Rules:',
    '1. Remove filler words, false starts, stutters and repetitions.',
    '2. Resolve self-corrections (actually, wait, sorry, I mean, no, scratch that): keep only the final intended version.',
    '3. Add natural punctuation, capitalisation and paragraph breaks.',
    '4. NEVER change meaning. Preserve names, numbers, dates, money, URLs, and negations exactly.',
    '5. Do not add greetings, sign-offs, commentary, or content the user did not say.',
    '6. Output ONLY the cleaned text with no quotes, labels or explanation.',
    devLine.trim(),
    appLine.trim() + styleLine.trim(),
    dictLines ? 'Vocabulary:\n' + dictLines : '',
  ].filter(Boolean).join('\n');

  const user = `Raw transcript:\n"""${raw.trim()}"""\n\nCleaned text:`;
  return { system, user };
}

/**
 * Sanitise LLM output: strip wrapping quotes/labels the model sometimes adds,
 * and guard against the model echoing the instructions.
 */
function sanitizeLlmOutput(text, raw) {
  if (!text) return '';
  let out = text.trim();
  out = out.replace(/^["'`]+|["'`]+$/g, '').trim();
  out = out.replace(/^(cleaned text|output|result)\s*:\s*/i, '').trim();
  // If the model returned nothing meaningful, fall back to the raw transcript.
  if (!out) return raw.trim();
  return out;
}

module.exports = {
  applyDictionary,
  removeFillers,
  removeRepetitions,
  resolveCorrections,
  autoPunctuate,
  applyDeveloperMode,
  cleanupDeterministic,
  buildLlmPrompt,
  sanitizeLlmOutput,
};
