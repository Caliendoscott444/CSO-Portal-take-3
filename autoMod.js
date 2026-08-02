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

// ---------------------------------------------------------------------------
// CONFIG — fill these in for your server
// ---------------------------------------------------------------------------
const CONFIG = {
  LOG_CHANNEL_ID: '1462468083905204330',
  GENERAL_CHANNEL_ID: 'PUT_YOUR_GENERAL_CHANNEL_ID_HERE',

  TIMEOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes

  // Optional: add your own extra "instant ban" words here privately.
  // These are matched in addition to the obscenity severe-word dataset.
  CUSTOM_SLUR_WORDS: [
    // 'example-word-here',
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
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// obscenity tags each match with metadata IDs; englishDataset ships a mix of
// general profanity and more severe terms. We treat "severe" hits (plus any
// custom words you add above) as slur-tier, everything else as curse-tier.
function classifyMessageContent(content) {
  const lower = content.toLowerCase();

  const hasCustomSlur = CONFIG.CUSTOM_SLUR_WORDS.some((w) =>
    lower.includes(w.toLowerCase())
  );

  const matches = matcher.getAllMatches(content);
  const hasProfanity = matches.length > 0;

  // englishDataset payloads include a `tags` array; slur-style entries are
  // tagged 'slur' or 'sexual_slur' etc. Fall back to "any match" as curse-tier
  // if your obscenity version doesn't expose tags.
  let hasSevere = false;
  for (const m of matches) {
    const payload = englishDataset.getPayloadWithPhraseMetadata(m);
    if (
      payload?.originalWord?.tags?.some((t) => t.toLowerCase().includes('slur'))
    ) {
      hasSevere = true;
      break;
    }
  }

  return {
    isSlur: hasSevere || hasCustomSlur,
    isCurse: hasProfanity,
  };
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
function buildCaseEmbed({ caseNumber, action, guildName, reason, member, message }) {
  const actionLabelMap = {
    warned: 'warned',
    timedOut: 'timed out',
    banned: 'banned',
  };

  const embed = new EmbedBuilder()
    .setTitle(
      `Case #${caseNumber} – You have been ${actionLabelMap[action]} in ✨ | ${guildName}`
    )
    .addFields({ name: 'Reason', value: reason || 'No reason provided' })
    .setColor(action === 'banned' ? 0xed4245 : action === 'timedOut' ? 0xfaa61a : 0xfee75c)
    .setTimestamp();

  if (member) {
    embed.addFields({ name: 'User', value: `${member.user.tag} (${member.id})` });
  }

  if (message) {
    embed.addFields(
      { name: 'Proof — Message Content', value: message.content?.slice(0, 1000) || '*(no text content)*' },
      { name: 'Proof — Jump Link', value: message.url || 'N/A' },
      { name: 'Channel', value: `<#${message.channelId}>` }
    );
  }

  return embed;
}

async function logAndNotify({ guild, action, reason, member, message, caseNumber }) {
  const embed = buildCaseEmbed({
    caseNumber,
    action,
    guildName: guild.name,
    reason,
    member,
    message,
  });

  // 1. Log channel
  const logChannel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
  if (logChannel) {
    await logChannel.send({ embeds: [embed] }).catch(console.error);
  }

  // 2. General chat
  const generalChannel = guild.channels.cache.get(CONFIG.GENERAL_CHANNEL_ID);
  if (generalChannel) {
    await generalChannel.send({ embeds: [embed] }).catch(console.error);
  }

  // 3. DM the user
  if (member) {
    await member.send({ embeds: [embed] }).catch(() => {
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

  const { isSlur, isCurse } = classifyMessageContent(message.content);
  const nsfwLink = isNsfwLink(message.content);

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
