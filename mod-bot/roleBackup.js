/**
 * Role Backup / Restore
 * -------------------------------------------------------------------------
 * Saves a member's roles when they leave a server (kicked, left voluntarily,
 * or banned) so staff can restore them with one click if the member rejoins.
 *
 * Storage: a JSON file per guild in ./data/roleBackups/<guildId>.json
 * Structure: { "<userId>": { "roles": ["<roleId>", ...], "username": "...", "savedAt": "..." } }
 *
 * Wire-up needed in index.js (see comments at the bottom of this file):
 *   1. Call saveRolesOnLeave(member) inside your guildMemberRemove handler.
 *   2. Call postRestorePrompt(...) wherever you currently log a
 *      leave/kick/ban event (e.g. your mod-log channel), so staff get a
 *      button right there.
 *   3. Call handleRestoreButton(interaction) inside your interactionCreate
 *      handler, before/alongside your existing button-handling logic.
 */
const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

const DATA_DIR = path.join(__dirname, 'data', 'roleBackups');

// Roles that should never be auto-restored even if the member had them
// (e.g. a "Booster" role Discord manages itself, or an @everyone-equivalent).
// Add role IDs here if needed.
const EXCLUDED_ROLE_IDS = [];

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function backupPath(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

function loadGuildBackups(guildId) {
  ensureDataDir();
  const file = backupPath(guildId);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Failed to read role backups for guild ${guildId}:`, err);
    return {};
  }
}

function saveGuildBackups(guildId, data) {
  ensureDataDir();
  fs.writeFileSync(backupPath(guildId), JSON.stringify(data, null, 2));
}

/**
 * Call this from your guildMemberRemove event (covers leaves AND kicks —
 * Discord fires this event for both). Also call it from guildBanAdd if you
 * want bans captured even when the member wasn't already removed.
 */
function saveRolesOnLeave(member) {
  const roleIds = member.roles.cache
    .filter((r) => r.id !== member.guild.id) // drop @everyone
    .filter((r) => !EXCLUDED_ROLE_IDS.includes(r.id))
    .map((r) => r.id);

  if (roleIds.length === 0) return; // nothing worth saving

  const backups = loadGuildBackups(member.guild.id);
  backups[member.id] = {
    username: member.user.tag,
    roles: roleIds,
    savedAt: new Date().toISOString(),
  };
  saveGuildBackups(member.guild.id, backups);
}

/**
 * Builds the "Restore Roles" button for a given user. Attach this to
 * whatever embed/message you already post in your mod-log when someone
 * leaves, is kicked, or is banned.
 */
function buildRestoreButton(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`restore_roles_${userId}`)
      .setLabel('Restore Roles')
      .setStyle(ButtonStyle.Success)
  );
}

/**
 * Call this inside your interactionCreate handler for button interactions.
 * Returns true if it handled the interaction (so your existing handler can
 * skip it), false otherwise.
 */
async function handleRestoreButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('restore_roles_')) return false;

  const userId = interaction.customId.replace('restore_roles_', '');
  const guild = interaction.guild;

  // Permission check: only staff who can manage roles should be able to click this.
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "You don't have permission to restore roles.",
      ephemeral: true,
    });
    return true;
  }

  const backups = loadGuildBackups(guild.id);
  const record = backups[userId];

  if (!record) {
    await interaction.reply({
      content: 'No saved roles found for that user.',
      ephemeral: true,
    });
    return true;
  }

  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    await interaction.reply({
      content: 'That user is not currently in the server, so their roles can\'t be restored yet. They need to rejoin first.',
      ephemeral: true,
    });
    return true;
  }

  // Filter out roles that no longer exist or that the bot can't assign
  // (e.g. roles above the bot's own highest role).
  const botHighest = guild.members.me.roles.highest;
  const assignable = record.roles.filter((id) => {
    const role = guild.roles.cache.get(id);
    return role && role.comparePositionTo(botHighest) < 0;
  });
  const skipped = record.roles.length - assignable.length;

  try {
    await member.roles.add(assignable, 'Role restore via mod-log button');
  } catch (err) {
    console.error('Failed to restore roles:', err);
    await interaction.reply({
      content: 'Something went wrong restoring roles — check the bot\'s console.',
      ephemeral: true,
    });
    return true;
  }

  let msg = `Restored ${assignable.length} role(s) to ${member.user.tag}.`;
  if (skipped > 0) {
    msg += ` (${skipped} role(s) skipped — deleted or above the bot's own role.)`;
  }

  await interaction.reply({ content: msg, ephemeral: true });
  return true;
}

/**
 * Call this from your guildMemberUpdate event to log every role add/remove
 * to a channel. Never pings anyone: uses the member's username/tag (not an
 * <@id> mention) and sets allowedMentions: { parse: [] } as a hard backstop
 * so nothing in the message — not the username, not a role name — can ever
 * trigger a notification, even accidentally.
 */
async function logRoleChanges(oldMember, newMember, logChannel) {
  if (!logChannel) return;

  const oldRoleIds = new Set(oldMember.roles.cache.map((r) => r.id));
  const newRoleIds = new Set(newMember.roles.cache.map((r) => r.id));

  const addedIds = [...newRoleIds].filter((id) => !oldRoleIds.has(id));
  const removedIds = [...oldRoleIds].filter((id) => !newRoleIds.has(id));

  if (addedIds.length === 0 && removedIds.length === 0) return;

  const roleName = (id) => newMember.guild.roles.cache.get(id)?.name || `Unknown role (${id})`;

  const lines = [
    ...addedIds.map((id) => `+ Added **${roleName(id)}**`),
    ...removedIds.map((id) => `\u2212 Removed **${roleName(id)}**`),
  ];

  await logChannel.send({
    content: `**${newMember.user.tag}** (${newMember.id})\n${lines.join('\n')}`,
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

module.exports = {
  saveRolesOnLeave,
  buildRestoreButton,
  handleRestoreButton,
  logRoleChanges,
};
