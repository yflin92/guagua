'use strict';

/**
 * App-specific style profiles (§21). Maps a detected front-app name to a short
 * style directive and a suggested developer-mode toggle. The directive is fed
 * into the local LLM prompt so cleanup matches the destination's register.
 * Everything here is local and static; users' own overrides live in settings.
 */
const PROFILES = [
  { match: /slack/i, style: 'Keep it short and conversational.', developer: false, category: 'chat' },
  { match: /discord/i, style: 'Keep it short and conversational.', developer: false, category: 'chat' },
  { match: /messages|imessage/i, style: 'Casual, short messages.', developer: false, category: 'chat' },
  { match: /mail|gmail|outlook/i, style: 'Complete sentences with greetings where natural.', developer: false, category: 'email' },
  { match: /notion|docs|word|pages/i, style: 'Well-structured prose with paragraphs.', developer: false, category: 'docs' },
  { match: /cursor|vs ?code|xcode|intellij|pycharm|zed/i, style: 'Technical, precise; preserve identifiers and code.', developer: true, category: 'code' },
  { match: /terminal|iterm|warp|kitty|alacritty/i, style: 'Minimal cleanup; preserve command syntax verbatim.', developer: true, category: 'terminal' },
  { match: /chatgpt|claude|browser|chrome|safari|firefox|arc/i, style: 'Clear, complete prompts.', developer: false, category: 'browser' },
];

/**
 * @param {string} appName
 * @returns {{style:string, developer:boolean, category:string}|null}
 */
function profileForApp(appName) {
  if (!appName) return null;
  for (const p of PROFILES) {
    if (p.match.test(appName)) {
      return { style: p.style, developer: p.developer, category: p.category };
    }
  }
  return null;
}

/** Coarse app category for privacy-safe telemetry (§28). No app names leak. */
function appCategory(appName) {
  return profileForApp(appName)?.category || 'other';
}

module.exports = { profileForApp, appCategory, PROFILES };
