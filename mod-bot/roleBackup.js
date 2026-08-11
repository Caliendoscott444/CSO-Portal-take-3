/**
 * Role Backup / Restore + Live Role Change Log
 * -------------------------------------------------------------------------
 * Two related features:
 *
 * 1. Backup on leave/kick/ban — saves a member's roles when they leave so
 *    staff can restore them with one click if the member rejoins.
 *
 * 2. Live role change log — logs every single role added or removed from
 *    any member, in real time, with a button to instantly undo that one
 *    change (re-add if it was removed, revoke if it was added).
 *
 * Storage: a JSON file per guild in ./data/roleBackups/<guildId>.json
 * Structure: { "<userId>": { "roles": ["<roleId>", ...], "username": "...", "savedAt": "..." } }
 *
 * Wire-up needed in index.js:
 *   1. Call saveRolesOnLeave(member) inside your guildMemberRemove handler.
 *   2. Post buildRestoreButton(member.id) to ROLE_LOG_CHANNEL_ID when
 *      someone leaves.
 *   3. Add a guildMemberUpdate handler that calls logRoleChanges(oldMember, newMember, logChannel).
 *   4. Call handleRestoreButton(interaction) AND handleRoleChangeButton(interaction)
 *      inside your interactionCreate handler.
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
// (e.g. a "Booster" role Discord manages itself). Add role IDs if needed.
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

// ---------------------------------------------------------------------------
// Backup on leave/kick/ban
// ---------------------------------------------------------------------------
function saveRolesOnLeave(member) {
  const roleIds = member.roles.cache
    .filter((r) => r.id !== member.guild.id) // drop @everyone
    .filter((r) => !EXCLUDED_ROLE_IDS.includes(r.id))
    .map((r) => r.id);

  if (roleIds.length === 0) return;

  const backups = loadGuildBackups(member.guild.id);
  backups[member.id] = {
    username: member.user.tag,
    roles: roleIds,
    savedAt: new Date().toISOString(),
  };
  saveGuildBackups(member.guild.id, backups);
}

function buildRestoreButton(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`restore_roles_${userId}`)
      .setLabel('Restore Roles')
      .setStyle(ButtonStyle.Success)
  );
}

async function handleRestoreButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('restore_roles_')) return false;

  const userId = interaction.customId.replace('restore_roles_', '');
  const guild = interaction.guild;

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: "You don't have permission to restore roles.", ephemeral: true });
    return true;
  }

  const backups = loadGuildBackups(guild.id);
  const record = backups[userId];

  if (!record) {
    await interaction.reply({ content: 'No saved roles found for that user.', ephemeral: true });
    return true;
  }

  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    await interaction.reply({
      content: "That user is not currently in the server, so their roles can't be restored yet. They need to rejoin first.",
      ephemeral: true,
    });
    return true;
  }

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
    await interaction.reply({ content: "Something went wrong restoring roles — check the bot's console.", ephemeral: true });
    return true;
  }

  let msg = `Restored ${assignable.length} role(s) to ${member.user.tag}.`;
  if (skipped > 0) msg += ` (${skipped} role(s) skipped — deleted or above the bot's own role.)`;

  await interaction.reply({ content: msg, ephemeral: true });
  return true;
}

// ---------------------------------------------------------------------------
// Live role change log — fires on every single role add/remove, for any
// member, for any reason (staff action, self-assign via reaction roles,
// another bot, etc). Each logged change gets its own undo button.
// ---------------------------------------------------------------------------

/**
 * Call this from a guildMemberUpdate listener. Diffs old vs new roles and
 * posts one log line + undo button per role that changed. Fire-and-forget.
 */
async function logRoleChanges(oldMember, newMember, logChannel) {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const added = newRoles.filter((r) => !oldRoles.has(r.id) && r.id !== newMember.guild.id);
  const removed = oldRoles.filter((r) => !newRoles.has(r.id) && r.id !== newMember.guild.id);

  if (added.size === 0 && removed.size === 0) return; // nothing role-related changed
  if (!logChannel) return;

  for (const role of added.values()) {
    await logChannel.send({
      content: `**Role Added**\n**User:** <@${newMember.id}>\n**Role:** <@&${role.id}>`,
      components: [buildRoleChangeButtons(newMember.id, role.id, 'add')],
    }).catch(() => {});
  }

  for (const role of removed.values()) {
    await logChannel.send({
      content: `**Role Removed**\n**User:** <@${newMember.id}>\n**Role:** <@&${role.id}>`,
      components: [buildRoleChangeButtons(newMember.id, role.id, 'remove')],
    }).catch(() => {});
  }
}

/**
 * Builds the undo button for a single role change.
 * changeType is 'add' or 'remove' — describes what JUST happened, so the
 * button does the opposite (undo).
 */
function buildRoleChangeButtons(userId, roleId, changeType) {
  const undoAction = changeType === 'add' ? 'revoke' : 'restore';
  const label = changeType === 'add' ? 'Revoke' : 'Restore';
  const style = changeType === 'add' ? ButtonStyle.Danger : ButtonStyle.Success;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`roleundo_${undoAction}_${userId}_${roleId}`)
      .setLabel(label)
      .setStyle(style)
  );
}

/**
 * Call this inside interactionCreate. Handles the per-role undo buttons
 * from the live log (separate from the leave/restore-all button above).
 */
async function handleRoleChangeButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('roleundo_')) return false;

  const [, action, userId, roleId] = interaction.customId.split('_');
  const guild = interaction.guild;

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
    return true;
  }

  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    await interaction.reply({ content: 'That user is no longer in the server.', ephemeral: true });
    return true;
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply({ content: 'That role no longer exists.', ephemeral: true });
    return true;
  }

  const botHighest = guild.members.me.roles.highest;
  if (role.comparePositionTo(botHighest) >= 0) {
    await interaction.reply({ content: "I can't manage that role — it's positioned above my own highest role.", ephemeral: true });
    return true;
  }

  try {
    if (action === 'restore') {
      await member.roles.add(roleId, 'Quick-restore via role log button');
      await interaction.reply({ content: `Restored **${role.name}** to ${member.user.tag}.`, ephemeral: true });
    } else if (action === 'revoke') {
      await member.roles.remove(roleId, 'Quick-revoke via role log button');
      await interaction.reply({ content: `Revoked **${role.name}** from ${member.user.tag}.`, ephemeral: true });
    }
  } catch (err) {
    console.error('Failed to undo role change:', err);
    await interaction.reply({ content: "Something went wrong — check the bot's console.", ephemeral: true });
  }

  return true;
}

module.exports = {
  saveRolesOnLeave,
  buildRestoreButton,
  handleRestoreButton,
  logRoleChanges,
  handleRoleChangeButton,
};