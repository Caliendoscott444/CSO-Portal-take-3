require('dotenv').config();
const { Client, GatewayIntentBits, Partials, AuditLogEvent } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const { handleAutoMod } = require('./autoMod');
const { saveRolesOnLeave, buildRestoreButton, logRoleChanges } = require('./roleBackup');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // required to read message text
    GatewayIntentBits.GuildMembers,   // required for timeout/ban + member.moderatable
    GatewayIntentBits.GuildModeration, // required for guildAuditLogEntryCreate
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ---------------------------------------------------------------------------
// Shared config — mirrors the values used by the /warn /kick /ban /timeout
// /lock /unlock slash commands, so behavior (and case numbering) stays
// consistent whether a mod uses a text command or the slash command.
// ---------------------------------------------------------------------------
const MOD_ACTION_ROLE_ID = '1517739789816828024';
const LOCK_ALLOWED_ROLE_ID = '1530325162560458752';
const MOD_ACTION_LOG_CHANNEL_ID = '1467558237111849182';
const SERVER_NAME = '\u2728 | Comet Strategic Operations Corporation';
const TC_ALLOWED_ROLE_ID = '1517739789816828024';
const BLACKLIST_ROLE_ID = '1462501582062092329';
const AUTO_BLACKLIST_ON_LEAVE_ROLE_ID = '1462500854253883455';
const ROLE_LOG_CHANNEL_ID = '1536574655618621490';

// Same keep-list /punish uses for "Under Investigation" — everything else
// gets stripped when the blacklist role is applied.
const INVESTIGATION_KEEP_ROLE_IDS = [
  '1509297960528117951', '1508957800192016435', '1462498752790135070',
  '1469158894512373948', '1469158846277877924', '1469158683857649838',
  '1509643852859048116', '1521914259372511422', '1502469626271895674',
  '1510011516374614218', '1467667392669810783', '1523461877152219188',
  '1507743824825417838', '1507743733322616863', '1507743593417408686',
  '1511864826098614373', '1507744549454217247', '1462501077860483072',
  '1467674380023894111', '1498444550224609321', '1512189372102082812',
  '1510338982477828268', '1504867979203051690', '1480249350612586587',
  '1477763821731975329', '1524194709764051014', '1490150469778280578',
  '1472753026522550294',
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Auto-blacklist on leave / re-apply on rejoin
// ---------------------------------------------------------------------------
client.on('guildMemberRemove', async (member) => {
  try {
    await saveRolesOnLeave(member, supabase);

    const restoreLogChannel = await client.channels.fetch(ROLE_LOG_CHANNEL_ID).catch(() => null);
    if (restoreLogChannel) {
      await restoreLogChannel.send({
        content: `**${member.user.tag}** left or was removed from the server. Their roles were saved.`,
        components: [buildRestoreButton(member.id)],
      }).catch(() => {});
    }

    if (!member.roles.cache.has(AUTO_BLACKLIST_ON_LEAVE_ROLE_ID)) return;

    await supabase.from('cases').insert({
      guild_id: member.guild.id,
      user_id: member.id,
      moderator_id: client.user.id,
      reason: 'Automatically blacklisted for leaving the server while holding the General Staff role.',
      status: 'active',
      punishment_type: 'Blacklist',
      appealable: false,
    });
    console.log(`[blacklist] auto-flagged ${member.id} on leave`);
  } catch (err) {
    console.error('[blacklist] guildMemberRemove error:', err);
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    const { data: activeBlacklist } = await supabase
      .from('cases')
      .select('id')
      .eq('guild_id', member.guild.id)
      .eq('user_id', member.id)
      .eq('punishment_type', 'Blacklist')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeBlacklist) return;

    const currentRoleIds = member.roles.cache
      .filter((r) => r.id !== member.guild.id)
      .map((r) => r.id);
    const keptRoleIds = currentRoleIds.filter((id) => INVESTIGATION_KEEP_ROLE_IDS.includes(id));
    const newRoleIds = Array.from(new Set([...keptRoleIds, BLACKLIST_ROLE_ID]));

    await member.roles.set(newRoleIds, `Blacklist case #${activeBlacklist.id}`);
    console.log(`[blacklist] re-applied blacklist role to ${member.id} on rejoin (case #${activeBlacklist.id})`);
  } catch (err) {
    console.error('[blacklist] guildMemberAdd error:', err);
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const logChannel = await client.channels.fetch(ROLE_LOG_CHANNEL_ID).catch(() => null);
    await logRoleChanges(oldMember, newMember, logChannel);
  } catch (err) {
    console.error('[role log] guildMemberUpdate error:', err);
  }
});

// ---------------------------------------------------------------------------
// Universal ban/kick/timeout log — catches these actions no matter how they
// happen: this bot's slash commands, this bot's text commands, another bot,
// or a staff member using Discord's native right-click Timeout/Kick/Ban.
// Reading straight from the server's audit log means nothing slips through,
// since Discord logs an audit entry for these regardless of the source.
// Requires the bot to have the "View Audit Log" permission.
// ---------------------------------------------------------------------------
const UNIVERSAL_MOD_LOG_CHANNEL_ID = '1535822320134787133';

client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
  try {
    const { action, executorId, targetId, reason, changes } = auditLogEntry;
    console.log('[universal mod log] audit entry received:', { action, executorId, targetId, reason });

    let actionLabel = null;
    let extra = '';

    if (action === AuditLogEvent.MemberBanAdd) {
      actionLabel = 'Banned';
    } else if (action === AuditLogEvent.MemberKick) {
      actionLabel = 'Kicked';
    } else if (action === AuditLogEvent.MemberUpdate) {
      // A timeout is logged as a MEMBER_UPDATE entry with a
      // communication_disabled_until change — other member updates
      // (nickname, etc.) show up here too, so ignore anything else.
      const timeoutChange = changes?.find((c) => c.key === 'communication_disabled_until');
      if (!timeoutChange) return;
      if (!timeoutChange.new) {
        actionLabel = 'Timeout Removed';
      } else {
        actionLabel = 'Timed Out';
        const untilTs = Math.floor(new Date(timeoutChange.new).getTime() / 1000);
        extra = ` (until <t:${untilTs}:f>)`;
      }
    } else {
      return;
    }

    const executorMention = executorId ? `<@${executorId}>` : 'Unknown (bot or system)';
    const targetMention = targetId ? `<@${targetId}>` : 'Unknown';

    const logChannel = await client.channels.fetch(UNIVERSAL_MOD_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) return;

    await logChannel.send({
      content:
        `**${actionLabel}${extra}**\n` +
        `**User:** ${targetMention}\n` +
        `**By:** ${executorMention}\n` +
        `**Reason:** ${reason || 'No reason provided'}`,
    }).catch(() => {});
  } catch (err) {
    console.error('[universal mod log] error:', err);
  }
});

function moderationDMMessage(caseId, actionPhrase, reason) {
  return `**Case #${caseId} \u2013 You have been ${actionPhrase} in ${SERVER_NAME}.**\n**Reason:** ${reason}`;
}

function noPermission(message) {
  return message.channel.send("You don't have permission to use this command.").catch(() => {});
}

function usage(message, text) {
  return message.channel.send(text).catch(() => {});
}

async function logModAction(targetId, text) {
  const logChannel = await client.channels.fetch(MOD_ACTION_LOG_CHANNEL_ID).catch(() => null);
  if (logChannel) {
    await logChannel.send({ content: `||<@${targetId}>||\n${text}` }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// -tc
// ---------------------------------------------------------------------------
async function handleTc(message) {
  console.log('[tc check]', { raw: JSON.stringify(message.content), matches: message.content.trim().toLowerCase() === '-tc' });

  if (message.content.trim().toLowerCase() !== '-tc') return false;

  if (!message.member.roles.cache.has(TC_ALLOWED_ROLE_ID)) {
    await noPermission(message);
    return true;
  }

  await message.channel.send(
    '**A General Staff inside of CSO activated a Topic Change failure to change topic will result in moderation.**'
  ).catch(() => {});
  await message.delete().catch(() => {});
  return true;
}

// ---------------------------------------------------------------------------
// ! prefix moderation commands
// ---------------------------------------------------------------------------
async function handlePrefixCommand(message) {
  const parts = message.content.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // --- !lock / !unlock ---
  if (cmd === '-lock' || cmd === '-unlock') {
    if (!message.member.roles.cache.has(LOCK_ALLOWED_ROLE_ID)) return noPermission(message);

    const everyoneRole = message.guild.roles.everyone;
    const allowedRole = message.guild.roles.cache.get(LOCK_ALLOWED_ROLE_ID);

    try {
      if (cmd === '-lock') {
        await message.channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
        if (allowedRole) await message.channel.permissionOverwrites.edit(allowedRole, { SendMessages: true });
        await message.channel.send('\uD83D\uDD12 Channel locked.').catch(() => {});
      } else {
        await message.channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
        if (allowedRole) await message.channel.permissionOverwrites.edit(allowedRole, { SendMessages: null });
        await message.channel.send('\uD83D\uDD13 Channel unlocked.').catch(() => {});
      }
    } catch (err) {
      await message.channel.send(`Something went wrong updating this channel's permissions:\n\`\`\`${String(err).slice(0, 1800)}\`\`\``).catch(() => {});
    }
    return true;
  }

  // --- -unban ---
  if (cmd === '-unban') {
    if (!message.member.roles.cache.has(MOD_ACTION_ROLE_ID)) return noPermission(message);

    // Banned users aren't guild members, so they won't resolve via
    // message.mentions.members — fall back to a raw user ID/mention.
    const mentionedUser = message.mentions.users?.first();
    const rawIdArg = parts[1] && /^\d{17,20}$/.test(parts[1]) ? parts[1] : null;
    const targetId = mentionedUser?.id || rawIdArg;

    if (!targetId) {
      return usage(message, 'Usage: `-unban <@user or user ID> [reason]`');
    }

    const reasonTokens = parts.slice(1).filter((p) => !/^<@!?(\d+)>$/.test(p) && p !== targetId);
    const reason = reasonTokens.join(' ') || 'No reason provided';

    try {
      await message.guild.bans.remove(targetId, reason);
    } catch {
      return usage(message, "Couldn't unban that user — they may not currently be banned.");
    }

    const unbanEmbed = {
      title: '\uD83D\uDD13 Member Unbanned',
      color: 0x22c55e,
      fields: [
        { name: '\uD83D\uDC64 Member', value: mentionedUser ? `${mentionedUser.username} (<@${targetId}>)` : `<@${targetId}>`, inline: false },
        { name: '\uD83D\uDCDD Reason', value: reason, inline: false },
        { name: '\uD83D\uDEE1\uFE0F Unbanned By', value: `<@${message.author.id}>`, inline: false },
      ],
      timestamp: new Date().toISOString(),
    };

    const logChannel = await client.channels.fetch(MOD_ACTION_LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) await logChannel.send({ embeds: [unbanEmbed] }).catch(() => {});

    await message.channel.send(`Unbanned <@${targetId}>. Logged in <#${MOD_ACTION_LOG_CHANNEL_ID}>.`).catch(() => {});
    return true;
  }

  // --- -warn / -kick / -ban / -timeout ---
  if (['-warn', '-kick', '-ban', '-timeout'].includes(cmd)) {
    if (!message.member.roles.cache.has(MOD_ACTION_ROLE_ID)) return noPermission(message);

    const targetMember = message.mentions.members?.first();
    if (!targetMember) {
      return usage(message, `Usage: \`${cmd} @member ${cmd === '-timeout' ? '<minutes> ' : ''}<reason>\``);
    }

    const isOwner = message.guild.ownerId === message.author.id;
    if (!isOwner && targetMember.roles.highest.comparePositionTo(message.member.roles.highest) >= 0) {
      return usage(message, "You can't do that to someone with an equal or higher role than you.");
    }

    // Strip the command and the raw mention token out of the args, whatever
    // form the mention took (<@id> or <@!id>).
    const rest = parts.slice(1).filter((p) => !/^<@!?(\d+)>$/.test(p));

    let durationMinutes;
    let reason;
    if (cmd === '-timeout') {
      durationMinutes = parseInt(rest[0], 10);
      if (!durationMinutes || durationMinutes < 1) {
        return usage(message, 'Usage: `!timeout @member <minutes> <reason>`');
      }
      reason = rest.slice(1).join(' ');
    } else {
      reason = rest.join(' ');
    }

    if (!reason) {
      return usage(message, `Usage: \`${cmd} @member ${cmd === '-timeout' ? '<minutes> ' : ''}<reason>\``);
    }

    const punishmentType = { '-warn': 'Warning', '-kick': 'Kick', '-ban': 'Ban', '-timeout': 'Timeout' }[cmd];
    const actionPhrase = {
      '-warn': 'warned',
      '-kick': 'kicked',
      '-ban': 'banned',
      '-timeout': `timed out for ${durationMinutes} minutes`,
    }[cmd];

    const insertPayload = {
      guild_id: message.guild.id,
      user_id: targetMember.id,
      moderator_id: message.author.id,
      reason,
      status: 'active',
      punishment_type: punishmentType,
      appealable: true,
    };
    if (cmd === '-timeout') insertPayload.duration_minutes = durationMinutes;

    const { data: inserted, error } = await supabase.from('cases').insert(insertPayload).select().single();

    if (error || !inserted) {
      await message.channel.send(`Something went wrong logging that ${punishmentType.toLowerCase()}.`).catch(() => {});
      return true;
    }

    // DM before removal so it has the best chance of landing.
    await targetMember.send({ content: moderationDMMessage(inserted.id, actionPhrase, reason) }).catch(() => {});

    try {
      if (cmd === '-kick') {
        await targetMember.kick(`Case #${inserted.id}: ${reason}`);
      } else if (cmd === '-ban') {
        await targetMember.ban({ reason: `Case #${inserted.id}: ${reason}` });
      } else if (cmd === '-timeout') {
        await targetMember.timeout(durationMinutes * 60_000, `Case #${inserted.id}: ${reason}`);
      }
      // !warn takes no Discord-side action beyond the case + DM.
    } catch (err) {
      await message.channel.send(`I don't have permission to ${cmd.slice(1)} that member. The case was still logged.`).catch(() => {});
      return true;
    }

    await logModAction(targetMember.id, moderationDMMessage(inserted.id, actionPhrase, reason));

    // Kick/ban/timeout already get caught universally by the audit-log
    // listener above — warn has no Discord-native audit trail, so it's the
    // only one of these four that needs its own explicit post here.
    if (cmd === '-warn') {
      const logChannel = await client.channels.fetch(UNIVERSAL_MOD_LOG_CHANNEL_ID).catch(() => null);
      if (logChannel) {
        await logChannel.send({
          content: `**Warned**\n**User:** <@${targetMember.id}>\n**By:** <@${message.author.id}>\n**Reason:** ${reason}`,
        }).catch(() => {});
      }
    }

    await message.channel.send(`<@${targetMember.id}> has been ${actionPhrase}. Case #${inserted.id} logged.`).catch(() => {});
    return true;
  }

  return false;
}

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  if (await handleTc(message)) return;

  if (message.content.trim().startsWith('-')) {
    const handled = await handlePrefixCommand(message);
    if (handled) return;
  }

  handleAutoMod(message);
});


client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('LOGIN FAILED:', err);
});
