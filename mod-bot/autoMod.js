/**
 * Auto-Moderation Module
 * -----------------------
 * Requires: discord.js v14, obscenity
 *   npm install discord.js obscenity
 *
 * Wire this up in your main file like:
 *   const { handleAutoMod } = require('./autoMod');
 *   client.on('messageCreate', (message) => handleAutoMod(message));
 */

const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
} = require('discord.js');
const {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} = require('obscenity');
const naughtyWords = require('naughty-words');
const { classifyWithAI } = require('./aiModerator');

// ---------------------------------------------------------------------------
// CONFIG — fill these in for your server
// ---------------------------------------------------------------------------
const CONFIG = {
  LOG_CHANNEL_ID: '1533063881281376316',
  GENERAL_CHANNEL_ID: '1467558237111849182',

  TIMEOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes

  // Shown as a "Notes" line under the Reason, only for timeouts.
  TIMEOUT_NOTES: 'Rule 3 https://discord.com/channels/1462468082931990551/1467570396986609704',

  // If true, sends each message to Google's Gemini API (free, no credit
  // card — via Google AI Studio) for smarter multilingual curse/slur
  // detection that understands context, not just exact word matches.
  // Requires GEMINI_API_KEY in .env. Falls back to the local word lists
  // below if the API call fails or you hit the free daily/rate limit.
  USE_AI_MODERATION: true,

  // Multilingual profanity detection — fully local/offline, no external
  // API and no possibility of billing. Uses the open-source `naughty-words`
  // word lists. Every language the package ships is turned on below. Note:
  // more languages means a somewhat higher chance of an innocent word in
  // one language colliding with a profanity entry in another (this is a
  // known trade-off of word-list-based filtering, especially for short
  // words) — trim this list if you notice false positives.
  MULTILINGUAL_CURSE_LANGUAGES: [
    'ar', 'cs', 'da', 'de', 'en', 'eo', 'es', 'fa', 'fi', 'fil', 'fr',
    'fr-CA-u-sd-caqc', 'hi', 'hu', 'it', 'ja', 'kab', 'ko', 'nl', 'no',
    'pl', 'pt', 'ru', 'sv', 'th', 'tlh', 'tr', 'zh',
  ],

  // REQUIRED for the ban tier to work: list the words that should trigger
  // an instant ban here. These word lists only cover general profanity
  // (timeout tier) and have no separate slur category, so this array is
  // the only thing that decides what counts as a bannable slur.
  // Leave it empty and nothing will ever be banned for word content.
  CUSTOM_SLUR_WORDS: [
    'fag',
  ],

  // Words that should NEVER be flagged as profanity, even though obscenity's
  // built-in dataset or the naughty-words lists include them. Add more here
  // as false positives come up.
  ALLOWLIST_WORDS: [
    'bj',
  ],

  // Domains that count as an NSFW link (extend as needed)
  NSFW_DOMAINS: [
    'pornhub.com',
    'xvideos.com',
    'xnxx.com',
    'xhamster.com',
    'redtube.com',
    'onlyfans.com',
  ],
};

// ---------------------------------------------------------------------------
// Case counter — persisted to disk so numbers survive restarts
// ---------------------------------------------------------------------------
const CASE_FILE = path.join(__dirname, 'cases.json');

function getNextCaseNumber() {
  let data = { count: 0 };
  if (fs.existsSync(CASE_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(CASE_FILE, 'utf8'));
    } catch (e) {
      data = { count: 0 };
    }
  }
  data.count += 1;
  fs.writeFileSync(CASE_FILE, JSON.stringify(data, null, 2));
  return data.count;
}

// ---------------------------------------------------------------------------
// Word matcher setup (obscenity handles the curse/slur dictionary for us)
// ---------------------------------------------------------------------------
const filteredEnglishDataset = englishDataset.removePhrasesIf((phrase) =>
  CONFIG.ALLOWLIST_WORDS.includes((phrase.metadata?.originalWord ?? '').toLowerCase())
);

const matcher = new RegExpMatcher({
  ...filteredEnglishDataset.build(),
  ...englishRecommendedTransformers,
});

// obscenity handles English profanity; naughty-words adds other languages
// from CONFIG.MULTILINGUAL_CURSE_LANGUAGES on top of it — all local, no
// external API calls.
const multilingualCurseWords = new Set();
for (const lang of CONFIG.MULTILINGUAL_CURSE_LANGUAGES) {
  const list = naughtyWords[lang];
  if (!list) {
    console.warn(`naughty-words has no list for language code "${lang}" — skipping.`);
    continue;
  }
  for (const w of list) multilingualCurseWords.add(w.toLowerCase());
}
for (const w of CONFIG.ALLOWLIST_WORDS) {
  multilingualCurseWords.delete(w.toLowerCase());
}

// These word lists don't distinguish slurs from general profanity, so they
// only ever contribute to the curse/timeout tier. Slurs still rely on
// CONFIG.CUSTOM_SLUR_WORDS for the ban tier.
function classifyMessageContent(content) {
  const hasCustomSlur = CONFIG.CUSTOM_SLUR_WORDS.some((w) =>
    containsWord(content, w)
  );

  const hasEnglishProfanity = matcher.getAllMatches(content).length > 0;

  let hasMultilingualProfanity = false;
  for (const w of multilingualCurseWords) {
    if (containsWord(content, w)) {
      hasMultilingualProfanity = true;
      break;
    }
  }

  return {
    isSlur: hasCustomSlur,
    isCurse: hasEnglishProfanity || hasMultilingualProfanity,
  };
}

// Matches a word as a whole word (not as a substring of an unrelated word),
// case-insensitively. Uses Unicode-aware boundaries so this works correctly
// for non-English scripts/accented characters, not just plain ASCII.
function containsWord(content, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu');
    return re.test(content);
  } catch (e) {
    // Fallback for environments without lookbehind/unicode-property support
    return content.toLowerCase().includes(word.toLowerCase());
  }
}

function extractUrls(content) {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return content.match(urlRegex) || [];
}

function isNsfwLink(content) {
  const urls = extractUrls(content);
  return urls.some((url) =>
    CONFIG.NSFW_DOMAINS.some((domain) => url.toLowerCase().includes(domain))
  );
}

// ---------------------------------------------------------------------------
// Embed + logging/notification helpers
// ---------------------------------------------------------------------------
const ACTION_LABEL_MAP = {
  warned: 'warned',
  timedOut: 'timed out',
  banned: 'banned',
};

// Builds the "Reason" line, plus a "Notes" line for timeouts only.
function buildReasonLines(action, reason) {
  const lines = [`**Reason:** ${reason || 'No reason provided'}`];
  if (action === 'timedOut' && CONFIG.TIMEOUT_NOTES) {
    lines.push(`**Notes:** ${CONFIG.TIMEOUT_NOTES}`);
  }
  return lines;
}

// General chat — plain bolded text, title + reason(+notes) only, no proof.
// guildName already contains your server's own "✨ | ..." branding, so we
// don't add an extra sparkle/pipe here.
function buildGeneralMessage({ caseNumber, action, guildName, reason, member }) {
  const who = member ? member.user.tag : 'A user';
  return [
    `**Case #${caseNumber} – ${who} has been ${ACTION_LABEL_MAP[action]} in ${guildName}.**`,
    ...buildReasonLines(action, reason),
  ].join('\n');
}

// DM — plain bolded text, title + reason(+notes) + user + proof (message
// content, noted as deleted since we delete it before logging). Keeps "You"
// since this is sent directly to the person it happened to.
function buildDMMessage({ caseNumber, action, guildName, reason, member, message }) {
  const lines = [
    `**Case #${caseNumber} – You have been ${ACTION_LABEL_MAP[action]} in ${guildName}.**`,
    ...buildReasonLines(action, reason),
  ];

  if (member) {
    lines.push(`**User:** ${member.user.tag} (${member.id})`);
  }

  if (message) {
    const proofContent = message.content?.slice(0, 1000) || '*(no text content)*';
    lines.push(
      '',
      '**Proof**',
      `Message (deleted): ${proofContent}`,
      `Channel: <#${message.channelId}>`,
      '*The original message was deleted as part of this action.*'
    );
  }

  return lines.join('\n');
}

// Log channel — title + reason(+notes) + user as plain text (no proof lines
// here; proof is shown separately via the richer deletion embed below).
function buildLogMessage({ caseNumber, action, guildName, reason, member }) {
  const who = member ? member.user.tag : 'A user';
  const lines = [
    `**Case #${caseNumber} – ${who} has been ${ACTION_LABEL_MAP[action]} in ${guildName}.**`,
    ...buildReasonLines(action, reason),
  ];

  if (member) {
    lines.push(`**User:** ${member.user.tag} (${member.id})`);
  }

  return lines.join('\n');
}

// Deletion embed for the log channel, styled like a native "message deleted"
// mod-log entry: author line, description, message content field, and a
// footer with user/message IDs.
function buildDeletionEmbed({ member, message }) {
  const sentAt = message.createdAt || new Date();
  const sentAtStr = sentAt.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const content = message.content?.slice(0, 1000) || '*(no text content)*';

  return new EmbedBuilder()
    .setAuthor({
      name: `@${member.user.username}`,
      iconURL: member.user.displayAvatarURL(),
    })
    .setDescription(
      `Message from **@${member.user.username}** deleted in <#${message.channelId}>.\nIt was sent on ${sentAtStr}.`
    )
    .addFields({ name: 'Message Content', value: content })
    .setFooter({ text: `User ID: ${member.id} • Message ID: ${message.id}` })
    .setColor(0xed4245)
    .setTimestamp(sentAt);
}

async function logAndNotify({ guild, action, reason, member, message, caseNumber }) {
  // 1. Log channel — case text + rich deletion embed
  const logChannel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
  if (logChannel) {
    const logText = buildLogMessage({ caseNumber, action, guildName: guild.name, reason, member });
    const payload = { content: logText };
    if (member && message) {
      payload.embeds = [buildDeletionEmbed({ member, message })];
    }
    await logChannel.send(payload).catch(console.error);
  }

  // 2. General chat — plain text, title + reason only
  const generalChannel = guild.channels.cache.get(CONFIG.GENERAL_CHANNEL_ID);
  if (generalChannel) {
    const generalText = buildGeneralMessage({ caseNumber, action, guildName: guild.name, reason, member });
    await generalChannel.send({ content: generalText }).catch(console.error);
  }

  // 3. DM the user — plain text, title + reason + user + proof
  if (member) {
    const dmText = buildDMMessage({ caseNumber, action, guildName: guild.name, reason, member, message });
    await member.send({ content: dmText }).catch(() => {
      // User may have DMs closed — that's fine, log channel still has the record.
    });
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
async function handleAutoMod(message) {
  if (!message.guild || message.author.bot) return;

  const member = message.member;
  if (!member) return;

  // Never moderate someone the bot can't actually act on
  if (!member.moderatable) return;

  // Local keyword-based checks — obscenity (English) + naughty-words
  // (other languages) + your CUSTOM_SLUR_WORDS. Always run first as a
  // fast, free baseline that never depends on network access.
  const keywordResult = classifyMessageContent(message.content);
  const nsfwLink = isNsfwLink(message.content);

  let isSlur = keywordResult.isSlur;
  let isCurse = keywordResult.isCurse;

  if (CONFIG.USE_AI_MODERATION) {
    const aiResult = await classifyWithAI(message.content);
    if (aiResult) {
      // AI result adds to (never overrides) the keyword-based result, so
      // nothing gets missed if the two disagree.
      isSlur = isSlur || aiResult.slur;
      isCurse = isCurse || aiResult.curse;
    }
    // If aiResult is null (API error, rate limit, missing key), we
    // silently keep the keyword-based result above as a fallback.
  }

  try {
    if (isSlur || nsfwLink) {
      // Ban tier
      const reason = isSlur
        ? 'Use of a slur'
        : 'Sending an NSFW link';

      const caseNumber = getNextCaseNumber();

      await message.delete().catch(() => {});
      await logAndNotify({
        guild: message.guild,
        action: 'banned',
        reason,
        member,
        message,
        caseNumber,
      });
      await member.ban({ reason });
    } else if (isCurse) {
      // Timeout tier
      const reason = 'Cursing';
      const caseNumber = getNextCaseNumber();

      await message.delete().catch(() => {});
      await logAndNotify({
        guild: message.guild,
        action: 'timedOut',
        reason,
        member,
        message,
        caseNumber,
      });
      await member.timeout(CONFIG.TIMEOUT_DURATION_MS, reason);
    }
  } catch (err) {
    console.error('AutoMod error:', err);
  }
}

module.exports = { handleAutoMod, CONFIG };