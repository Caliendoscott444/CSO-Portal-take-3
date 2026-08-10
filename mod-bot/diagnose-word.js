// Diagnostic script — run this in your mod-bot folder to find out exactly
// which word/language caused a phrase to be flagged as profanity.
//
// Usage:
//   node diagnose-word.js "well I am"

const {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} = require('obscenity');
const naughtyWords = require('naughty-words');

const CUSTOM_SLUR_WORDS = ['fag'];

const MULTILINGUAL_CURSE_LANGUAGES = [
  'ar', 'cs', 'da', 'de', 'en', 'eo', 'es', 'fa', 'fi', 'fil', 'fr',
  'fr-CA-u-sd-caqc', 'hi', 'hu', 'it', 'ja', 'kab', 'ko', 'nl', 'no',
  'pl', 'pt', 'ru', 'sv', 'th', 'tlh', 'tr', 'zh',
];

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

function containsWord(content, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu');
    return re.test(content);
  } catch (e) {
    return content.toLowerCase().includes(word.toLowerCase());
  }
}

const content = process.argv.slice(2).join(' ');
if (!content) {
  console.log('Usage: node diagnose-word.js "phrase to test"');
  process.exit(1);
}

console.log(`Testing: "${content}"\n`);

// 1. Custom slur list
for (const w of CUSTOM_SLUR_WORDS) {
  if (containsWord(content, w)) {
    console.log(`MATCH — CUSTOM_SLUR_WORDS: "${w}"`);
  }
}

// 2. English obscenity matcher
const englishMatches = matcher.getAllMatches(content);
if (englishMatches.length > 0) {
  console.log(`MATCH — English (obscenity) matcher fired. Match count: ${englishMatches.length}`);
  console.log(JSON.stringify(englishMatches, null, 2));
}

// 3. Multilingual naughty-words — check each language separately so we know
// exactly which one is responsible.
let foundMultilingual = false;
for (const lang of MULTILINGUAL_CURSE_LANGUAGES) {
  const list = naughtyWords[lang];
  if (!list) continue;
  for (const w of list) {
    if (containsWord(content, w)) {
      console.log(`MATCH — naughty-words[${lang}]: "${w}"`);
      foundMultilingual = true;
    }
  }
}

if (englishMatches.length === 0 && !foundMultilingual) {
  console.log('No matches found in any word list — the trigger came from somewhere else (check USE_AI_MODERATION / classifyWithAI).');
}