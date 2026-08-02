// Supabase Edge Function: discord-interactions
// Handles Discord's HTTP Interactions for all slash commands + follow-up
// components/modals:
//   /shift manage       -> on-duty status embed with Start/End buttons
//   /shift leaderboard  -> current wave leaderboard embed
//   /feedback           -> opens a modal (rating 1-5 + notes), posts a styled embed on submit
//   /reaction_role      -> posts an embed with a dropdown; picking an option toggles a role
//   /apply              -> multi-step application form (modal chain), posts submission for review
//   LOA approve/deny buttons + modals (posted elsewhere, handled here)
//
// Required secrets (set with `supabase secrets set`):
//   DISCORD_PUBLIC_KEY       - Discord Developer Portal -> your app -> General Information
//   DISCORD_BOT_TOKEN        - Discord Developer Portal -> your app -> Bot -> Token
//   DISCORD_GUILD_ID         - the CSO Discord server ID
//   FEEDBACK_CHANNEL_ID      - channel /feedback embeds are posted to
//   APPLICATIONS_CHANNEL_ID  - channel /apply submissions are posted to for visibility
//   LOA_ROLE_ID              - role applied while an LOA is active
//   LOA_APPROVER_ROLE_ID     - role allowed to approve/deny LOA requests
//   LOA_CHANNEL_ID           - channel LOA approve/deny notifications are posted to
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - standard Supabase function env

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nacl from "npm:tweetnacl@1.0.3";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendDM } from "../_shared/discord.ts";
import { buildAmendmentsDocument, buildAmendmentsSummaryLines } from "../_shared/amendments.ts";
import {
  buildQuestionMessage,
  finalizeApplication,
  loadOrderedQuestions,
  sendDMPayload,
} from "../_shared/application-flow.ts";

const CSO_LOGO_URL = "https://cso-corporations.vercel.app/CSO_CORPORATION_LOGO_1-2.png";
const REACTIONROLE_ALLOWED_ROLE_ID = "1530325162560458752";
const APPLY_ALLOWED_ROLE_ID = "1530325162560458752";
const APPEAL_ALLOWED_ROLE_ID = "1462500854253883455";
const APPEAL_REVIEW_ROLE_ID = "1530325162560458752";
const APPEAL_TICKET_CATEGORY_ID = "1531494351673495722";
const INVESTIGATION_ROLE_ID = "1522316411219738694";
const INVESTIGATION_ISSUER_ROLE_ID = "1530325162560458752";
// Role applied to a member when they're punished with Suspension via /punish.
const SUSPENSION_ROLE_ID = "1510524979052154972";
const CHAIN_OF_COMMAND_CHANNEL_ID = "1462510709647610039";
// Role allowed to use /ban, /kick, /warn, /timeout, /cases, /edit_case, and /view_cases.
const MOD_ACTION_ROLE_ID = "1517739789816828024";
const MOD_ACTION_LOG_CHANNEL_ID = "1467558237111849182";
// Role reused to gate who can click Accept/Deny/Check AI on a submitted /apply application.
const APPLICATION_REVIEW_ROLE_ID = APPLY_ALLOWED_ROLE_ID;
const APPLICATION_LOG_CHANNEL_ID = "1462506005538668654";
const APPLICATION_AI_CHECK_LOG_CHANNEL_ID = "1532302856248627230";
// On Accept: this role is added...
const APPLICATION_ACCEPT_ADD_ROLE_ID = "1467421508803629129";
// ...and this role is removed (no-op if the member doesn't have it).
const APPLICATION_ACCEPT_REMOVE_ROLE_ID = "1467674380023894111";
// TODO: set this to the server's exact display name/branding as it should appear in DMs to
// members, e.g. "\u2728 | Comet Strategic Operations Corporation\u2122" \u2014 copy the exact text/emoji/symbol.
const SERVER_NAME = "\u2728 | Comet Strategic Operations Corporation";

const APPLY_GUIDELINES_TEXT = `Before you begin, please consider the following:

\u2022 Must be 13+ (VC checks will be standard procedure)
\u2022 Must have a mic
\u2022 Must be in an Associated Discord Server
\u2022 Cannot be Blacklisted from a Department.
\u2022 Works good under pressure
\u2022 Specializes in Teamwork

If you don't follow at least one of our minimum requirements, please don't apply. Once you apply, you may NOT leave the CSO server without your application being accepted or denied. You will be blacklisted if you do so.

You may also not ask for your application to be read or hint at it during any point of time.

If you accept our guidelines, then you may proceed with the application.

Good Luck!`;

const CHAIN_OF_COMMAND_MESSAGE = `** ===== Senior Command Staff =====**
<@&1511751384637374525> 
<@&1532169753022693479> 
 <:GENSTAFF:1511878073648287854>**=====  Command Staff =====** 
<@&1462490581291761841>
<@&1462490786842280072>
<:GENSTAFF:1511878073648287854>**===== Chief of Staff =====**
<@&1530405698637140014>
<:COD:1509368153426362488> **===== General Staff =====**
<@&1462491274543239303>
<@&1462491179697569918>
<:COMET:1497638685942743150> **C.O.M.E.T. Task Force**
<@&1497779990241087579> 
<@&1497780058058657852> 
<@&1497780230109007994> 
<@&1497780668720091197> 
** ===== Division Members =====**
<@&1466226180863561738>
<@&1511868846619885628> 
<@&1515545204340555898> 
<@&1463685989154427041>
<@&1462491546145259586>
 **===== Warden Ranks =====**
<@&1464049852114796692>
<@&1464049762050248706>
<@&1462492552396541972>
**===== Entry Level =====**
<@&1467421508803629129> 
*Any ranks copied from this server to another server will result in a blacklist and we will get your server shutdown for stealing assets.*`;

// Roles a member is allowed to keep when placed "Under Investigation" via
// /punish — every other role they currently hold gets stripped and restored
// later by /end_investigation.
const INVESTIGATION_KEEP_ROLE_IDS = [
  "1509297960528117951",
  "1508957800192016435",
  "1462498752790135070",
  "1469158894512373948",
  "1469158846277877924",
  "1469158683857649838",
  "1509643852859048116",
  "1521914259372511422",
  "1502469626271895674",
  "1510011516374614218",
  "1467667392669810783",
  "1523461877152219188",
  "1507743824825417838",
  "1507743733322616863",
  "1507743593417408686",
  "1511864826098614373",
  "1507744549454217247",
  "1462501077860483072",
  "1467674380023894111",
  "1498444550224609321",
  "1512189372102082812",
  "1510338982477828268",
  "1504867979203051690",
  "1480249350612586587",
  "1477763821731975329",
  "1524194709764051014",
  "1490150469778280578",
  "1472753026522550294",
];
// /punish Termination strips every role except this same set — currently
// identical to the investigation keep-list, kept as its own name in case the
// two ever need to diverge.
const TERMINATION_KEEP_ROLE_IDS = INVESTIGATION_KEEP_ROLE_IDS;

const DEFAULT_REACTIONROLE_DESCRIPTION = `To prevent mass pings, CSO Operations has decided to implement the usage of Reaction Roles civilians may use at any point in time. Please make a selection below!
--------------------------------------------------

[CSO] Announcement Ping
\u2022 This ping could be used for any announcements that the Division Commanders may have regarding the Corps, Applications, Discord, etc.

[CSO] Event Ping
\u2022 Per CSO policy, members who are not a part of the Business are still allowed to use Liveries as long as it is authorized by a Unit Supervisor. If an event occurs where this applies, you can easily be notified to join in-game if you wish to participate.

[CSO] News Ping
\u2022 In the case CSO releases news articles about the Divisions or Corps as a whole, you can keep updated with the News Ping.`;

// ---------- generic helpers ----------

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function getComponentValue(components: any[], customId: string): string {
  for (const row of components ?? []) {
    for (const comp of row.components ?? []) {
      if (comp.custom_id === customId) return comp.value ?? "";
    }
  }
  return "";
}

function formatDuration(totalMinutes: number): string {
  const totalSeconds = Math.round(totalMinutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (h === 0 && m === 0) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(", ") || "0 seconds";
}

function formatElapsedForReport(totalMinutes: number): string {
  const totalSeconds = Math.round(totalMinutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h !== 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? "s" : ""}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} second${s !== 1 ? "s" : ""}`);
  return parts.join(" ");
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Matches src/lib/period.ts's getPeriodKey() and start-shift/index.ts's isoWeekKey()
// exactly. Do not change without updating all three.
function periodKey(d: Date): string {
  const ANCHOR_UTC = Date.UTC(2024, 0, 1);
  const PERIOD_DAYS = 14;
  const DAY_MS = 86400000;
  const dayUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const daysSinceAnchor = Math.floor((dayUTC - ANCHOR_UTC) / DAY_MS);
  const periodIndex = Math.floor(daysSinceAnchor / PERIOD_DAYS);
  const start = new Date(ANCHOR_UTC + periodIndex * PERIOD_DAYS * DAY_MS);
  const yyyy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(start.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function starBar(rating: number) {
  const filled = "\u2605".repeat(rating);
  const empty = "\u2606".repeat(5 - rating);
  return filled + empty;
}

function ratingColor(rating: number) {
  if (rating >= 4) return 0x3ba55d; // green
  if (rating === 3) return 0xf5b942; // amber
  return 0xed4245; // red
}

const PERMISSION_MODERATE_MEMBERS = 1n << 40n;
const PERMISSION_ADMINISTRATOR = 1n << 3n;

function hasModeratePermission(permissionsStr: string | undefined): boolean {
  if (!permissionsStr) return false;
  const perms = BigInt(permissionsStr);
  return (perms & PERMISSION_MODERATE_MEMBERS) !== 0n || (perms & PERMISSION_ADMINISTRATOR) !== 0n;
}

function topRolePosition(roleIds: string[], rolePositionById: Record<string, number>): number {
  if (roleIds.length === 0) return 0; // @everyone
  return Math.max(...roleIds.map((id) => rolePositionById[id] ?? 0));
}

function caseFooterTimestamp(): string {
  const d = new Date();
  const dateStr = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${dateStr} at ${timeStr} UTC`;
}

function caseFooterShort(caseId: number): string {
  const d = new Date();
  const ts = d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return `Case #${caseId} | ${ts}`;
}

// ---------- /apply helpers ----------

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

function buildApplyIntroResponse(templates: any[]): any {
  return {
    type: 4,
    data: {
      embeds: [
        {
          title: "Comet Strategic Operations Application Panel",
          description: APPLY_GUIDELINES_TEXT,
          color: 0xf5b942,
          thumbnail: { url: CSO_LOGO_URL },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: "apply_template_select",
              placeholder: "Choose an application to start...",
              options: templates.map((t: any) => ({ label: t.name, value: t.id })),
            },
          ],
        },
      ],
      flags: 64,
    },
  };
}

// ---------- /shift manage + /shift leaderboard ----------

async function buildShiftManageResponse(supabase: any, discordUserId: string): Promise<any> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, discord_username")
    .eq("discord_id", discordUserId)
    .maybeSingle();

  if (!profile) {
    return {
      type: 4,
      data: { content: "No CSO Portal profile is linked to your Discord account.", flags: 64 },
    };
  }

  const { data: activeShift } = await supabase
    .from("shifts")
    .select("*")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();

  const isOnDuty = !!activeShift;
  const onBreak = !!activeShift?.on_break;

  const embed: any = {
    author: { name: "\u2728 | Comet Strategic Operations Corporation", icon_url: CSO_LOGO_URL },
    color: onBreak ? 0xf5b942 : isOnDuty ? 0x22c55e : 0x99a1af,
  };

  if (isOnDuty) {
    const startedAtUnix = Math.floor(new Date(activeShift.started_at).getTime() / 1000);
    const effectiveStartUnix = startedAtUnix + Math.round(activeShift.break_seconds ?? 0);

    embed.title = onBreak ? "\u23F8\uFE0F On Break" : "\uD83D\uDE80 Shift Started";
    embed.description =
      `**Current Shift**\n` +
      `> **Started:** <t:${startedAtUnix}:R>\n` +
      `> **Breaks:** ${activeShift.break_count ?? 0}\n` +
      `> **Elapsed Time:** <t:${effectiveStartUnix}:R>`;
  } else {
    embed.title = "Currently Off-Duty";
    embed.description = "You're not clocked in. Hit **On-Duty** to start a shift.";
  }

  const components = [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: "On-Duty", custom_id: "shiftmgr_onduty", disabled: isOnDuty },
        { type: 2, style: 2, label: "Toggle Break", custom_id: "shiftmgr_togglebreak", disabled: !isOnDuty },
        { type: 2, style: 4, label: "Off-Duty", custom_id: "shiftmgr_offduty", disabled: !isOnDuty },
      ],
    },
  ];

  return { type: 4, data: { embeds: [embed], components, flags: 64 } };
}

async function buildLeaderboardResponse(supabase: any): Promise<any> {
  const { data: currentWave } = await supabase
    .from("shift_waves")
    .select("id, label")
    .eq("is_current", true)
    .maybeSingle();

  if (!currentWave) {
    return { type: 4, data: { content: "No active shift wave is currently set." } };
  }

  const { data: totals } = await supabase
    .from("wave_totals_with_adjustments_v")
    .select("user_id, total_seconds")
    .eq("wave_id", currentWave.id)
    .order("total_seconds", { ascending: false })
    .limit(15);

  if (!totals || totals.length === 0) {
    return { type: 4, data: { content: `No logged shift time yet for **${currentWave.label}**.` } };
  }

  const userIds = totals.map((t: any) => t.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, discord_username")
    .in("id", userIds);

  const nameById: Record<string, string> = {};
  (profiles ?? []).forEach((p: any) => {
    nameById[p.id] = p.discord_username ?? "Unknown";
  });

  const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
  const lines = totals.map((t: any, i: number) => {
    const rank = medals[i] ?? `${i + 1}.`;
    const name = nameById[t.user_id] ?? "Unknown";
    const h = Math.floor(t.total_seconds / 3600);
    const m = Math.floor((t.total_seconds % 3600) / 60);
    return `${rank} **${name}** \u2014 ${h}h ${m}m`;
  });

  const embed = {
    title: `\uD83C\uDFC6 Shift Leaderboard \u2014 ${currentWave.label}`,
    description: lines.join("\n"),
    color: 0xf5b942,
    timestamp: new Date().toISOString(),
  };

  return { type: 4, data: { embeds: [embed] } };
}

async function getEligibleShiftTypeOptions(supabase: any, memberRoles: string[]) {
  const { data: types } = await supabase
    .from("shift_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  const eligible = (types ?? []).filter(
    (t: any) => !t.required_role_id || memberRoles.includes(t.required_role_id),
  );

  return eligible.map((t: any) => ({
    label: t.label,
    value: t.key,
    description: t.description ? String(t.description).slice(0, 100) : undefined,
  }));
}

async function startShiftForDiscordUser(
  supabase: any,
  discordUserId: string,
  memberRoles: string[],
  shiftTypeKey: string,
  BOT_TOKEN: string,
  GUILD_ID: string,
): Promise<{ error?: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, discord_id")
    .eq("discord_id", discordUserId)
    .maybeSingle();
  if (!profile) return { error: "No linked CSO Portal profile." };

  if (memberRoles.includes(SUSPENSION_ROLE_ID)) {
    return { error: "You're currently suspended and can't go on shift." };
  }

  const { data: shiftType } = await supabase
    .from("shift_types")
    .select("*")
    .eq("key", shiftTypeKey)
    .single();
  if (!shiftType) return { error: "Unknown shift type." };

  const { data: existing } = await supabase
    .from("shifts")
    .select("id")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return { error: "You already have an active shift." };

  if (shiftType.required_role_id && !memberRoles.includes(shiftType.required_role_id)) {
    return { error: "Missing the required Discord role for this shift." };
  }

  const now = new Date();
  const weekKey = periodKey(now);

  const { data: currentWave } = await supabase
    .from("shift_waves")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  const { error: insertErr } = await supabase.from("shifts").insert({
    user_id: profile.id,
    shift_type_id: shiftType.id,
    status: "active",
    week_key: weekKey,
    started_at: now.toISOString(),
    wave_id: currentWave?.id ?? null,
  });
  if (insertErr) return { error: insertErr.message };

  if (shiftType.active_role_id) {
    try {
      await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${shiftType.active_role_id}`,
        { method: "PUT", headers: { Authorization: `Bot ${BOT_TOKEN}` } },
      );
    } catch {
      // best-effort
    }
  }

  await supabase.from("profiles").update({ current_assignment: shiftType.label }).eq("id", profile.id);

  return {};
}

async function endShiftForDiscordUser(
  supabase: any,
  discordUserId: string,
  BOT_TOKEN: string,
  GUILD_ID: string,
): Promise<{ error?: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, callsign, discord_username")
    .eq("discord_id", discordUserId)
    .maybeSingle();
  if (!profile) return { error: "No linked CSO Portal profile." };

  const { data: shift } = await supabase
    .from("shifts")
    .select("*, shift_types(*)")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (!shift) return { error: "No active shift found." };

  const startedAt = new Date(shift.started_at);
  const endedAt = new Date();
  const minutesWorked = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 60000);
  const multiplier = shift.shift_types?.multiplier ?? 1;
  const minutesCredited = minutesWorked * multiplier;

  const { error: updateErr } = await supabase
    .from("shifts")
    .update({
      status: "completed",
      ended_at: endedAt.toISOString(),
      minutes_worked: minutesWorked,
      minutes_credited: minutesCredited,
    })
    .eq("id", shift.id);
  if (updateErr) return { error: updateErr.message };

  if (shift.shift_types?.active_role_id) {
    try {
      await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${shift.shift_types.active_role_id}`,
        { method: "DELETE", headers: { Authorization: `Bot ${BOT_TOKEN}` } },
      );
    } catch {
      // best-effort
    }
  }

  await supabase.from("profiles").update({ current_assignment: null }).eq("id", profile.id);

  try {
    const shiftTypeName = shift.shift_types?.label ?? shift.shift_types?.name ?? "Default";
    const nickname =
      [profile.callsign, profile.discord_username].filter(Boolean).join(" | ") || "Unknown";

    const embed = {
      title: "Shift Report",
      color: 0xf5b942,
      thumbnail: { url: CSO_LOGO_URL },
      description:
        `**Shift Information**\n` +
        `> **Shift Type:** ${shiftTypeName}\n` +
        `> **Shift Start:** ${formatTimestamp(startedAt)}\n` +
        `> **Shift End:** ${formatTimestamp(endedAt)}\n` +
        `> **Nickname:** \`${nickname}\`\n\n` +
        `**Elapsed Time**\n` +
        `> ${formatElapsedForReport(minutesWorked)}`,
      timestamp: endedAt.toISOString(),
    };

    await sendDM(discordUserId, { embeds: [embed] });
  } catch (dmErr) {
    console.error("Shift report DM failed:", dmErr);
  }

  return {};
}

async function toggleBreakForDiscordUser(
  supabase: any,
  discordUserId: string,
): Promise<{ error?: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("discord_id", discordUserId)
    .maybeSingle();
  if (!profile) return { error: "No linked CSO Portal profile." };

  const { data: shift } = await supabase
    .from("shifts")
    .select("id, on_break, break_started_at, break_count, break_seconds")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (!shift) return { error: "No active shift found." };

  if (shift.on_break) {
    const breakStarted = new Date(shift.break_started_at);
    const breakSecondsThisBreak = Math.max(0, (Date.now() - breakStarted.getTime()) / 1000);
    const { error } = await supabase
      .from("shifts")
      .update({
        on_break: false,
        break_started_at: null,
        break_seconds: (shift.break_seconds ?? 0) + breakSecondsThisBreak,
      })
      .eq("id", shift.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("shifts")
      .update({
        on_break: true,
        break_started_at: new Date().toISOString(),
        break_count: (shift.break_count ?? 0) + 1,
      })
      .eq("id", shift.id);
    if (error) return { error: error.message };
  }

  return {};
}

async function fetchAllChannelMessages(
  discordApi: (path: string, init?: RequestInit) => Promise<Response>,
  channelId: string,
): Promise<any[]> {
  const messages: any[] = [];
  let before: string | undefined;
  for (let i = 0; i < 50; i++) {
    const qs = before ? `?limit=100&before=${before}` : "?limit=100";
    const res = await discordApi(`/channels/${channelId}/messages${qs}`);
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    messages.push(...batch);
    before = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  return messages.reverse();
}

function buildTicketTranscriptText(caseRow: any, messages: any[]): string {
  const lines: string[] = [];
  lines.push(`Appeal Ticket Transcript \u2014 Case #${caseRow.id}`);
  lines.push(`Member: ${caseRow.user_id}`);
  lines.push(`Original reason: ${caseRow.reason ?? "n/a"}`);
  lines.push(`Appeal reason: ${caseRow.appeal_reason ?? "n/a"}`);
  lines.push(`Closed: ${new Date().toISOString()}`);
  lines.push("=".repeat(60));
  lines.push("");

  for (const m of messages) {
    const author = m.author?.username ?? "unknown";
    const ts = new Date(m.timestamp).toISOString().replace("T", " ").slice(0, 19);
    let line = `[${ts}] ${author}: ${m.content ?? ""}`;
    if (m.embeds?.length) line += " [embed]";
    lines.push(line);
    for (const att of m.attachments ?? []) {
      lines.push(`    attachment: ${att.url}`);
    }
  }

  if (messages.length === 0) lines.push("(no messages were sent in this ticket)");

  return lines.join("\n");
}

async function postMessageWithFile(
  botToken: string,
  channelId: string,
  jsonPayload: Record<string, unknown>,
  filename: string,
  fileText: string,
): Promise<Response> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify(jsonPayload));
  form.append("files[0]", new Blob([fileText], { type: "text/plain" }), filename);
  return fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}` },
    body: form,
  });
}

async function editOriginalInteractionResponse(
  applicationId: string,
  interactionToken: string,
  payload: unknown,
): Promise<void> {
  try {
    await fetch(
      `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  } catch {
    // best-effort
  }
}

async function sendAllAmendments(
  BOT_TOKEN: string,
  discordUserId: string,
  applicationId: string,
  interactionToken: string,
): Promise<void> {
  let dmChannelId: string;
  try {
    const dmChannelRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: discordUserId }),
    });
    if (!dmChannelRes.ok) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: "\u274C I couldn't send you a DM. Please check your privacy settings and allow direct messages from server members.",
      });
      return;
    }
    const dmChannel = await dmChannelRes.json();
    dmChannelId = dmChannel.id;
  } catch {
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: "\u274C I couldn't send you a DM. Please check your privacy settings and allow direct messages from server members.",
    });
    return;
  }

  const embed = {
    title: "\uD83D\uDCDC The 27 Amendments to the U.S. Constitution",
    description: buildAmendmentsSummaryLines().join("\n"),
    footer: { text: "Full text attached below" },
    color: 0xf5b942,
  };

  const payloadJson = {
    embeds: [embed],
    attachments: [{ id: 0, filename: "27-amendments.txt", description: "Full text of all 27 Amendments to the U.S. Constitution" }],
  };

  const form = new FormData();
  form.append("payload_json", JSON.stringify(payloadJson));
  form.append("files[0]", new Blob([buildAmendmentsDocument()], { type: "text/plain; charset=utf-8" }), "27-amendments.txt");

  let sendOk = false;
  try {
    const sendRes = await fetch(`https://discord.com/api/v10/channels/${dmChannelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      body: form,
    });
    sendOk = sendRes.ok;
  } catch {
    sendOk = false;
  }

  if (!sendOk) {
    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: "\u274C I couldn't send you a DM. Please check your privacy settings and allow direct messages from server members.",
    });
    return;
  }

  await editOriginalInteractionResponse(applicationId, interactionToken, {
    content: "\u2705 Sent! Check your DMs for all 27 Amendments.",
  });
}

const PERM_VIEW_CHANNEL = 1n << 10n;
const PERM_SEND_MESSAGES = 1n << 11n;
const PERM_READ_MESSAGE_HISTORY = 1n << 16n;
const PERM_MANAGE_CHANNELS = 1n << 4n;

async function createAppealTicketChannel(
  discordApi: (path: string, init?: RequestInit) => Promise<Response>,
  guildId: string,
  memberId: string,
  memberUsername: string,
  caseId: number,
): Promise<string | null> {
  try {
    const rolesRes = await discordApi(`/guilds/${guildId}/roles`);
    const rolesList = rolesRes.ok ? await rolesRes.json() : [];
    const meRes = await discordApi(`/users/@me`);
    const me = meRes.ok ? await meRes.json() : null;

    const permissionOverwrites: any[] = [
      { id: guildId, type: 0, deny: String(PERM_VIEW_CHANNEL) },
      {
        id: memberId,
        type: 1,
        allow: String(PERM_VIEW_CHANNEL | PERM_SEND_MESSAGES | PERM_READ_MESSAGE_HISTORY),
      },
    ];
    if (me?.id) {
      permissionOverwrites.push({
        id: me.id,
        type: 1,
        allow: String(PERM_VIEW_CHANNEL | PERM_SEND_MESSAGES | PERM_READ_MESSAGE_HISTORY | PERM_MANAGE_CHANNELS),
      });
    }
    for (const role of rolesList) {
      const rolePerms = BigInt(role.permissions ?? "0");
      if ((rolePerms & PERMISSION_MODERATE_MEMBERS) !== 0n || (rolePerms & PERMISSION_ADMINISTRATOR) !== 0n) {
        permissionOverwrites.push({
          id: role.id,
          type: 0,
          allow: String(PERM_VIEW_CHANNEL | PERM_SEND_MESSAGES | PERM_READ_MESSAGE_HISTORY),
        });
      }
    }

    const safeName = memberUsername.toLowerCase().replace(/[^a-z0-9-]/g, "") || "member";
    const channelName = `appeal-${safeName}-${caseId}`;

    const createChanRes = await discordApi(`/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name: channelName,
        type: 0,
        parent_id: APPEAL_TICKET_CATEGORY_ID,
        permission_overwrites: permissionOverwrites,
      }),
    });
    if (!createChanRes.ok) return null;
    const chan = await createChanRes.json();
    return chan.id;
  } catch {
    return null;
  }
}

// ---------- main handler ----------

Deno.serve(async (req) => {
  const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;
  const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
  const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID")!;
  const LOA_ROLE_ID = Deno.env.get("LOA_ROLE_ID")!;
  const APPROVER_ROLE_ID = Deno.env.get("LOA_APPROVER_ROLE_ID")!;
  const LOA_CHANNEL_ID = Deno.env.get("LOA_CHANNEL_ID")!;
  const FEEDBACK_CHANNEL_ID = Deno.env.get("FEEDBACK_CHANNEL_ID")!;
  const APPLICATIONS_CHANNEL_ID = Deno.env.get("APPLICATIONS_CHANNEL_ID")!;
  const LOG_CHANNEL_ID = Deno.env.get("LOG_CHANNEL_ID")!;
  const SAPLING_API_KEY = Deno.env.get("SAPLING_API_KEY")!;
  const APPEAL_CHANNEL_ID = "1462468083905204330";
  const APPEAL_CLOSE_LOG_CHANNEL_ID = "1462489107883364465";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = await req.text();

  if (!signature || !timestamp) {
    return new Response("Missing signature headers", { status: 401 });
  }

  const isValid = nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + rawBody),
    hexToUint8Array(signature),
    hexToUint8Array(PUBLIC_KEY),
  );
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  async function discordApi(path: string, init: RequestInit = {}) {
    return fetch(`https://discord.com/api/v10${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  function moderationDMMessage(caseId: number, actionPhrase: string, reason: string): string {
    return `**Case #${caseId} \u2013 You have been ${actionPhrase} in ${SERVER_NAME}.**\n**Reason:** ${reason}`;
  }

  if (body.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }
console.log("interaction context:", JSON.stringify({ hasMember: !!body.member, memberUserId: body.member?.user?.id, hasUser: !!body.user, userId: body.user?.id, guildId: body.guild_id }));
  const memberRoles: string[] = body.member?.roles ?? [];
  const reviewerName = body.member?.user?.username ?? body.member?.nick ?? "Unknown";
  const discordUserId: string | undefined = body.member?.user?.id ?? body.user?.id;

  // ---------- Slash commands ----------
  if (body.type === 2) {
    const commandName = body.data?.name;

    if (commandName === "shift") {
      const sub = body.data?.options?.[0]?.name;
      if (sub === "manage") {
        const resp = await buildShiftManageResponse(supabase, discordUserId!);
        return new Response(JSON.stringify(resp), { headers: { "Content-Type": "application/json" } });
      }
      if (sub === "leaderboard") {
        const resp = await buildLeaderboardResponse(supabase);
        return new Response(JSON.stringify(resp), { headers: { "Content-Type": "application/json" } });
      }
    }

    if (commandName === "apply") {
      if (!memberRoles.includes(APPLY_ALLOWED_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: templates } = await supabase
        .from("application_templates")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (!templates || templates.length === 0) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "No applications are open right now.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify(buildApplyIntroResponse(templates)), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (commandName === "suggestions") {
  return new Response(
    JSON.stringify({
      type: 9,
      data: {
        custom_id: "suggestions_modal",
        title: "Submit a Suggestion",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "roblox_user",
                label: "Roblox Username",
                style: 1,
                placeholder: "e.g. Bread",
                required: true,
                max_length: 100,
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "message",
                label: "Suggestion",
                style: 2,
                placeholder: "Share your suggestion...",
                required: true,
                max_length: 1000,
              },
            ],
          },
        ],
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

if (commandName === "personnel_suggestions") {
  return new Response(
    JSON.stringify({
      type: 9,
      data: {
        custom_id: "personnel_suggestions_modal",
        title: "Submit a Personnel Suggestion",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "roblox_user",
                label: "Roblox Username",
                style: 1,
                placeholder: "e.g. Bread",
                required: true,
                max_length: 100,
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "message",
                label: "Personnel Suggestion",
                style: 2,
                placeholder: "Share your suggestion...",
                required: true,
                max_length: 1000,
              },
            ],
          },
        ],
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
    
if (commandName === "feedback") {
      const staffOption = body.data.options?.find((o: any) => o.name === "staff");
      const staffUserId = staffOption?.value ?? "";

      return new Response(
        JSON.stringify({
          type: 9,
          data: {
            custom_id: `feedback_modal:${staffUserId}`,
            title: "Staff Feedback",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "rating",
                    label: "Rating (1-5)",
                    style: 1,
                    min_length: 1,
                    max_length: 1,
                    placeholder: "e.g. 5",
                    required: true,
                  },
                ],
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "notes",
                    label: "Notes",
                    style: 2,
                    placeholder: "Share your feedback...",
                    required: true,
                    max_length: 1000,
                  },
                ],
              },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "reaction_role") {
      if (!memberRoles.includes(REACTIONROLE_ALLOWED_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const title = get("title") ?? "Reaction Roles";

      const selectOptions: { label: string; value: string; emoji?: { name: string } }[] = [];
      for (let i = 1; i <= 5; i++) {
        const roleId = get(`role${i}`);
        const label = get(`label${i}`);
        const emoji = get(`emoji${i}`);
        if (roleId && label) {
          selectOptions.push({ label, value: roleId, ...(emoji ? { emoji: { name: emoji } } : {}) });
        }
      }

      if (selectOptions.length === 0) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You need at least role1 and label1 set.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: staged } = await supabase
        .from("pending_reaction_roles")
        .insert({ title, options: selectOptions })
        .select()
        .single();

      return new Response(
        JSON.stringify({
          type: 9,
          data: {
            custom_id: `reactionrole_modal:${staged.id}`,
            title: "Reaction Role Description",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "description",
                    label: "Description",
                    style: 2,
                    value: DEFAULT_REACTIONROLE_DESCRIPTION,
                    required: true,
                    max_length: 3900,
                  },
                ],
              },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "amendment") {
      const applicationId = body.application_id;
      const interactionToken = body.token;

      const task = sendAllAmendments(BOT_TOKEN, discordUserId!, applicationId, interactionToken);
      // @ts-ignore - EdgeRuntime is provided by the Supabase Edge Functions runtime
      if (typeof EdgeRuntime !== "undefined") {
        // @ts-ignore
        EdgeRuntime.waitUntil(task);
      } else {
        await task;
      }

      return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (commandName === "chain_of_command") {
      const postRes = await discordApi(`/channels/${CHAIN_OF_COMMAND_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: CHAIN_OF_COMMAND_MESSAGE,
          allowed_mentions: { parse: [] },
        }),
      });

      return new Response(
        JSON.stringify({
          type: 4,
          data: postRes.ok
            ? { content: `Posted in <#${CHAIN_OF_COMMAND_CHANNEL_ID}>.`, flags: 64 }
            : { content: "I couldn't post to that channel — check my permissions there.", flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "punish") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You need the Moderate Members permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;

      const targetUserId: string = get("member");
      const punishmentType: string = get("punishment_type");
      const reason: string = get("reason");
      const appealable: boolean = get("appealable");
      const durationMinutes: number = get("duration_minutes") ?? 60;
      const suspensionStartDate: string | undefined = get("start_date");
      const suspensionEndDate: string | undefined = get("end_date");
      const demoteFromRole: string | undefined = get("demote_from_role");
      const demoteToRole: string | undefined = get("demote_to_role");
      const textProof: string | undefined = get("text_proof");
      const proofAttachmentId: string | undefined = get("proof");

      if (punishmentType === "Under Investigation" && !memberRoles.includes(INVESTIGATION_ISSUER_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use the Under Investigation punishment type.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const resolvedMember = body.data.resolved?.members?.[targetUserId];
      const targetRoles: string[] = resolvedMember?.roles ?? [];
      const applicationId = body.application_id;
      const interactionToken = body.token;

      const task = (async () => {
        const guildRes = await discordApi(`/guilds/${GUILD_ID}`);
        const guildInfo = guildRes.ok ? await guildRes.json() : {};
        const rolesRes = await discordApi(`/guilds/${GUILD_ID}/roles`);
        const rolesList = rolesRes.ok ? await rolesRes.json() : [];
        const rolePositionById: Record<string, number> = {};
        for (const r of rolesList) rolePositionById[r.id] = r.position;

        const invokerTopPos = topRolePosition(memberRoles, rolePositionById);
        const targetTopPos = topRolePosition(targetRoles, rolePositionById);
        const invokerIsOwner = guildInfo.owner_id === discordUserId;

        if (targetTopPos >= invokerTopPos && !invokerIsOwner) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "You can't punish someone with an equal or higher role than you.",
          });
          return;
        }

        let investigationRemovedRoleIds: string[] = [];

        if (punishmentType === "Suspension") {
          const roleRes = await discordApi(
            `/guilds/${GUILD_ID}/members/${targetUserId}/roles/${SUSPENSION_ROLE_ID}`,
            { method: "PUT" },
          );
          if (!roleRes.ok) {
            await editOriginalInteractionResponse(applicationId, interactionToken, {
              content: "I don't have permission to apply the suspension role to that member.",
            });
            return;
          }
        }

        if (punishmentType === "Termination") {
          const keptRoles = targetRoles.filter((r) => TERMINATION_KEEP_ROLE_IDS.includes(r));

          const roleUpdateRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`, {
            method: "PATCH",
            body: JSON.stringify({ roles: keptRoles }),
          });
          if (!roleUpdateRes.ok) {
            await editOriginalInteractionResponse(applicationId, interactionToken, {
              content: "I don't have permission to update that member's roles.",
            });
            return;
          }
        }

        if (punishmentType === "Demotion" && (demoteFromRole || demoteToRole)) {
          let newRoles = targetRoles.filter((r) => r !== demoteFromRole);
          if (demoteToRole && !newRoles.includes(demoteToRole)) {
            newRoles = [...newRoles, demoteToRole];
          }

          const roleUpdateRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`, {
            method: "PATCH",
            body: JSON.stringify({ roles: newRoles }),
          });
          if (!roleUpdateRes.ok) {
            await editOriginalInteractionResponse(applicationId, interactionToken, {
              content: "I don't have permission to update that member's roles.",
            });
            return;
          }
        }

        if (punishmentType === "Under Investigation") {
          investigationRemovedRoleIds = targetRoles.filter((r) => !INVESTIGATION_KEEP_ROLE_IDS.includes(r));
          const keptRoles = targetRoles.filter((r) => INVESTIGATION_KEEP_ROLE_IDS.includes(r));
          const newRoles = Array.from(new Set([...keptRoles, INVESTIGATION_ROLE_ID]));

          const roleUpdateRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`, {
            method: "PATCH",
            body: JSON.stringify({ roles: newRoles }),
          });
          if (!roleUpdateRes.ok) {
            await editOriginalInteractionResponse(applicationId, interactionToken, {
              content: "I don't have permission to update that member's roles.",
            });
            return;
          }
        }

        const { data: caseRow, error: caseErr } = await supabase
          .from("cases")
          .insert({
            guild_id: String(GUILD_ID),
            user_id: targetUserId,
            moderator_id: discordUserId,
            reason,
            duration_minutes: punishmentType === "Suspension" ? durationMinutes : null,
            punishment_type: punishmentType,
            appealable,
            signed_by: discordUserId,
            removed_role_ids: punishmentType === "Under Investigation" ? investigationRemovedRoleIds : null,
            suspension_start_date: punishmentType === "Suspension" ? (suspensionStartDate || null) : null,
            suspension_end_date: punishmentType === "Suspension" ? (suspensionEndDate || null) : null,
          })
          .select()
          .single();

        if (caseErr) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: `Failed to log case: ${caseErr.message}`,
          });
          return;
        }

        const signedName = `<@${discordUserId}>`;
        const staffMemberName = `<@${targetUserId}>`;

        function buildPunishmentEmbed(isDm: boolean) {
          const fields = [
            { name: "\uD83D\uDC64 | Staff Member", value: staffMemberName, inline: false },
            { name: "\u2696\uFE0F | Punishment", value: punishmentType, inline: false },
            { name: "\uD83D\uDCDD | Reason", value: reason, inline: false },
            { name: "Appealable", value: appealable ? "Yes" : "No", inline: false },
            { name: "\uD83D\uDEE1\uFE0F | Signed", value: signedName, inline: false },
          ];
          if (proofAttachmentId && body.data.resolved?.attachments?.[proofAttachmentId]) {
            fields.push({
              name: "\uD83D\uDCF7 | Proof",
              value: `[View Attachment](${body.data.resolved.attachments[proofAttachmentId].url})`,
              inline: false,
            });
          }
          if (textProof) fields.push({ name: "\uD83D\uDCC4 | Text Proof", value: textProof, inline: false });

          return {
            title: isDm ? "Staff Discipline \u2014 You have been punished" : "Staff Discipline",
            description:
              `The High-ranking team of **${guildInfo.name ?? "the server"}** has issued you a punishment. ` +
              `Do not start any drama about this. Arguing will result in further moderation.`,
            color: 0xe74c3c,
            thumbnail: guildInfo.icon
              ? { url: `https://cdn.discordapp.com/icons/${GUILD_ID}/${guildInfo.icon}.png` }
              : { url: CSO_LOGO_URL },
            fields,
            footer: { text: `Case #${caseRow.id} | ${caseFooterTimestamp()}` },
          };
        }

        const logEmbed = buildPunishmentEmbed(false);
        const ping = `||<@${targetUserId}>||`;

        if (LOG_CHANNEL_ID) {
          await discordApi(`/channels/${LOG_CHANNEL_ID}/messages`, {
            method: "POST",
            body: JSON.stringify({ content: ping, embeds: [logEmbed] }),
          });
        }

        try {
          const dmEmbed = buildPunishmentEmbed(true);
          await sendDM(targetUserId, { embeds: [dmEmbed] });
        } catch (dmErr) {
          console.error("Punishment DM failed:", dmErr);
        }

        await editOriginalInteractionResponse(
          applicationId,
          interactionToken,
          LOG_CHANNEL_ID
            ? { content: `Case #${caseRow.id} logged in <#${LOG_CHANNEL_ID}>.` }
            : { content: ping, embeds: [logEmbed] },
        );
      })();

      // @ts-ignore - EdgeRuntime is provided by the Supabase Edge Functions runtime
      if (typeof EdgeRuntime !== "undefined") {
        // @ts-ignore
        EdgeRuntime.waitUntil(task);
      } else {
        await task;
      }

      return new Response(
        JSON.stringify({ type: 5, data: { flags: 64 } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "revoke") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You need the Moderate Members permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const caseId: number = get("case_id");
      const reason: string = get("reason") ?? "Revoked.";

      const { data: caseRow } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .eq("guild_id", GUILD_ID)
        .maybeSingle();

      if (!caseRow) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `No case #${caseId} found in this server.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (caseRow.status !== "active") {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `Case #${caseId} is already ${caseRow.status}.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("cases").update({ status: "revoked" }).eq("id", caseId);

      if (caseRow.punishment_type === "Suspension") {
        try {
          await discordApi(
            `/guilds/${GUILD_ID}/members/${caseRow.user_id}/roles/${SUSPENSION_ROLE_ID}`,
            { method: "DELETE" },
          );
        } catch {
          // best-effort
        }
      }

      const revokeEmbed = {
        title: "\uD83D\uDEE1\uFE0F Case Forcefully Revoked",
        description: `This case has been revoked by <@${discordUserId}>.`,
        color: 0xf1c40f,
        fields: [
          { name: "\uD83D\uDCDD Reason", value: reason, inline: false },
          { name: "\uD83D\uDCC4 Result", value: "Record cleared.", inline: false },
        ],
        footer: { text: caseFooterShort(caseId) },
      };
      const ping = `||<@${caseRow.user_id}>||`;

      if (LOG_CHANNEL_ID) {
        await discordApi(`/channels/${LOG_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: ping, embeds: [revokeEmbed] }),
        });
      }

      try {
        await sendDM(caseRow.user_id, {
          content: `Your punishment (case #${caseId}) in this server has been revoked.`,
        });
      } catch {
        // best-effort
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: LOG_CHANNEL_ID
            ? { content: `Case #${caseId} revocation logged in <#${LOG_CHANNEL_ID}>.`, flags: 64 }
            : { content: ping, embeds: [revokeEmbed] },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "edit_punishment") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You need the Moderate Members permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;

      const caseId: number = get("case_id");
      const newReason: string | undefined = get("reason");
      const newPunishmentType: string | undefined = get("punishment_type");
      const newDurationMinutes: number | undefined = get("duration_minutes");
      const newAppealable: boolean | undefined = get("appealable");
      const newStartDate: string | undefined = get("start_date");
      const newEndDate: string | undefined = get("end_date");

      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if ((newStartDate && !dateRe.test(newStartDate)) || (newEndDate && !dateRe.test(newEndDate))) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "Dates must be in YYYY-MM-DD format.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: caseRow } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .eq("guild_id", GUILD_ID)
        .maybeSingle();

      if (!caseRow) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `No case #${caseId} found in this server.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const updates: Record<string, any> = {};
      const changes: string[] = [];

      if (newReason !== undefined && newReason !== caseRow.reason) {
        updates.reason = newReason;
        changes.push(`**Reason:** ${caseRow.reason ?? "N/A"} \u2192 ${newReason}`);
      }
      if (newPunishmentType !== undefined && newPunishmentType !== caseRow.punishment_type) {
        updates.punishment_type = newPunishmentType;
        changes.push(`**Type:** ${caseRow.punishment_type ?? "N/A"} \u2192 ${newPunishmentType}`);
      }
      if (newDurationMinutes !== undefined && newDurationMinutes !== caseRow.duration_minutes) {
        updates.duration_minutes = newDurationMinutes;
        changes.push(`**Duration:** ${caseRow.duration_minutes ?? "N/A"} min \u2192 ${newDurationMinutes} min`);
      }
      if (newAppealable !== undefined && newAppealable !== caseRow.appealable) {
        updates.appealable = newAppealable;
        changes.push(`**Appealable:** ${caseRow.appealable ? "Yes" : "No"} \u2192 ${newAppealable ? "Yes" : "No"}`);
      }
      if (newStartDate !== undefined && newStartDate !== caseRow.start_date) {
        updates.start_date = newStartDate;
        changes.push(`**Start Date:** ${caseRow.start_date ?? "N/A"} \u2192 ${newStartDate}`);
      }
      if (newEndDate !== undefined && newEndDate !== caseRow.end_date) {
        updates.end_date = newEndDate;
        changes.push(`**End Date:** ${caseRow.end_date ?? "N/A"} \u2192 ${newEndDate}`);
      }

      if (changes.length === 0) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "No changes provided \u2014 nothing to update.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("cases").update(updates).eq("id", caseId);

      const editEmbed = {
        title: "\uD83D\uDCDD Case Edited",
        description: `Case #${caseId} was edited by <@${discordUserId}>.\n\nThis is a record-only edit \u2014 the member's current roles/timeout were not changed.`,
        color: 0x3498db,
        fields: [{ name: "Changes", value: changes.join("\n"), inline: false }],
        footer: { text: caseFooterShort(caseId) },
      };
      const ping = `||<@${caseRow.user_id}>||`;

      if (LOG_CHANNEL_ID) {
        await discordApi(`/channels/${LOG_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: ping, embeds: [editEmbed] }),
        });
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: LOG_CHANNEL_ID
            ? { content: `Case #${caseId} edit logged in <#${LOG_CHANNEL_ID}>.`, flags: 64 }
            : { content: ping, embeds: [editEmbed] },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "warn") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const targetUserId: string = get("member");
      const reason: string = get("reason");
      const applicationId = body.application_id;
      const interactionToken = body.token;

      const task = (async () => {
        const { data: inserted } = await supabase
          .from("cases")
          .insert({
            guild_id: GUILD_ID,
            user_id: targetUserId,
            moderator_id: discordUserId,
            reason,
            status: "active",
            punishment_type: "Warning",
            appealable: true,
          })
          .select()
          .single();

        if (!inserted) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "Something went wrong logging that warning.",
          });
          return;
        }

        try {
          await sendDM(targetUserId, { content: moderationDMMessage(inserted.id, "warned", reason) });
        } catch {
          // best-effort
        }

        await discordApi(`/channels/${MOD_ACTION_LOG_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `||<@${targetUserId}>||\n${moderationDMMessage(inserted.id, "warned", reason)}`,
          }),
        });

        await editOriginalInteractionResponse(applicationId, interactionToken, {
          content: `<@${targetUserId}> has been warned. Case #${inserted.id} logged.`,
        });
      })();

      EdgeRuntime.waitUntil(task);
      return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (commandName === "kick") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const targetUserId: string = get("member");
      const reason: string = get("reason");
      const applicationId = body.application_id;
      const interactionToken = body.token;

      const task = (async () => {
        const { data: inserted } = await supabase
          .from("cases")
          .insert({
            guild_id: GUILD_ID,
            user_id: targetUserId,
            moderator_id: discordUserId,
            reason,
            status: "active",
            punishment_type: "Kick",
            appealable: true,
          })
          .select()
          .single();

        if (!inserted) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "Something went wrong logging that kick.",
          });
          return;
        }

        try {
          await sendDM(targetUserId, { content: moderationDMMessage(inserted.id, "kicked", reason) });
        } catch {
          // best-effort, DM before removal so it has the best chance of landing
        }

        const kickRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`, {
          method: "DELETE",
          headers: { "X-Audit-Log-Reason": encodeURIComponent(`Case #${inserted.id}: ${reason}`) },
        });

        if (!kickRes.ok) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "I don't have permission to kick that member. The case was still logged.",
          });
          return;
        }

        await discordApi(`/channels/${MOD_ACTION_LOG_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `||<@${targetUserId}>||\n${moderationDMMessage(inserted.id, "kicked", reason)}`,
          }),
        });

        await editOriginalInteractionResponse(applicationId, interactionToken, {
          content: `<@${targetUserId}> has been kicked. Case #${inserted.id} logged.`,
        });
      })();

      EdgeRuntime.waitUntil(task);
      return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (commandName === "ban") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const targetUserId: string = get("member");
      const reason: string = get("reason");
      const deleteMessageDays: number = get("delete_message_days") ?? 0;
      const applicationId = body.application_id;
      const interactionToken = body.token;

      const task = (async () => {
        const { data: inserted } = await supabase
          .from("cases")
          .insert({
            guild_id: GUILD_ID,
            user_id: targetUserId,
            moderator_id: discordUserId,
            reason,
            status: "active",
            punishment_type: "Ban",
            appealable: true,
          })
          .select()
          .single();

        if (!inserted) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "Something went wrong logging that ban.",
          });
          return;
        }

        try {
          await sendDM(targetUserId, { content: moderationDMMessage(inserted.id, "banned", reason) });
        } catch {
          // best-effort, DM before removal so it has the best chance of landing
        }

        const banRes = await discordApi(`/guilds/${GUILD_ID}/bans/${targetUserId}`, {
          method: "PUT",
          body: JSON.stringify({ delete_message_seconds: deleteMessageDays * 86400 }),
          headers: { "X-Audit-Log-Reason": encodeURIComponent(`Case #${inserted.id}: ${reason}`) },
        });

        if (!banRes.ok) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "I don't have permission to ban that member. The case was still logged.",
          });
          return;
        }

        await discordApi(`/channels/${MOD_ACTION_LOG_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `||<@${targetUserId}>||\n${moderationDMMessage(inserted.id, "banned", reason)}`,
          }),
        });

        await editOriginalInteractionResponse(applicationId, interactionToken, {
          content: `<@${targetUserId}> has been banned. Case #${inserted.id} logged.`,
        });
      })();

      EdgeRuntime.waitUntil(task);
      return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (commandName === "unban") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const targetUserId: string = get("member");
      const reason: string = get("reason") ?? "No reason provided";
      const resolvedUser = body.data.resolved?.users?.[targetUserId];

      const unbanRes = await discordApi(`/guilds/${GUILD_ID}/bans/${targetUserId}`, { method: "DELETE" });
      if (!unbanRes.ok) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: `Couldn't unban that user — they may not currently be banned.`, flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const unbanEmbed = {
        title: "\uD83D\uDD13 Member Unbanned",
        color: 0x22c55e,
        fields: [
          { name: "\uD83D\uDC64 Member", value: resolvedUser ? `${resolvedUser.username} (<@${targetUserId}>)` : `<@${targetUserId}>`, inline: false },
          { name: "\uD83D\uDCDD Reason", value: reason, inline: false },
          { name: "\uD83D\uDEE1\uFE0F Unbanned By", value: `<@${discordUserId}>`, inline: false },
        ],
        timestamp: new Date().toISOString(),
      };

      await discordApi(`/channels/${MOD_ACTION_LOG_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ embeds: [unbanEmbed] }),
      });

      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: `Unbanned <@${targetUserId}>. Logged in <#${MOD_ACTION_LOG_CHANNEL_ID}>.`, flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "timeout") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const targetUserId: string = get("member");
      const reason: string = get("reason");
      const durationMinutes: number = get("duration_minutes");
      const applicationId = body.application_id;
      const interactionToken = body.token;

      const task = (async () => {
        const { data: inserted } = await supabase
          .from("cases")
          .insert({
            guild_id: GUILD_ID,
            user_id: targetUserId,
            moderator_id: discordUserId,
            reason,
            status: "active",
            punishment_type: "Timeout",
            duration_minutes: durationMinutes,
            appealable: true,
          })
          .select()
          .single();

        if (!inserted) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "Something went wrong logging that timeout.",
          });
          return;
        }

        const until = new Date(Date.now() + durationMinutes * 60_000).toISOString();
        const timeoutRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`, {
          method: "PATCH",
          body: JSON.stringify({ communication_disabled_until: until }),
          headers: { "X-Audit-Log-Reason": encodeURIComponent(`Case #${inserted.id}: ${reason}`) },
        });

        if (!timeoutRes.ok) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "I don't have permission to time out that member. The case was still logged.",
          });
          return;
        }

        try {
          await sendDM(targetUserId, {
            content: moderationDMMessage(inserted.id, `timed out for ${durationMinutes} minutes`, reason),
          });
        } catch {
          // best-effort
        }

        await discordApi(`/channels/${MOD_ACTION_LOG_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `||<@${targetUserId}>||\n${moderationDMMessage(inserted.id, `timed out for ${durationMinutes} minutes`, reason)}`,
          }),
        });

        await editOriginalInteractionResponse(applicationId, interactionToken, {
          content: `<@${targetUserId}> has been timed out for ${durationMinutes} minutes. Case #${inserted.id} logged.`,
        });
      })();

      EdgeRuntime.waitUntil(task);
      return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (commandName === "cases") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const targetUserId: string = opts.find((o: any) => o.name === "member")?.value;

      const { data: caseRows, error: casesError } = await supabase
        .from("cases")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("guild_id", GUILD_ID)
        .in("punishment_type", ["Warning", "Kick", "Ban", "Timeout"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (casesError) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "Something went wrong looking up that member's cases.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (!caseRows || caseRows.length === 0) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `<@${targetUserId}> has no warns, kicks, or bans on record.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const embed = {
        title: `Cases \u2014 ${caseRows.length} on record`,
        color: 0xf5b942,
        thumbnail: { url: CSO_LOGO_URL },
        description: `Showing the most recent ${caseRows.length} warn/kick/ban case(s) for <@${targetUserId}>.`,
        fields: caseRows.map((c: any) => ({
          name: `#${c.id} \u2014 ${c.punishment_type} (${c.status})`,
          value: [
            `**Reason:** ${c.reason ?? "N/A"}`,
            `**Moderator:** <@${c.moderator_id}>`,
            `**Date:** <t:${Math.floor(new Date(c.created_at).getTime() / 1000)}:D>`,
            c.duration_minutes ? `**Duration:** ${c.duration_minutes} min` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          inline: false,
        })),
        footer: { text: `Requested by ${body.member?.user?.username ?? "unknown"}` },
        timestamp: new Date().toISOString(),
      };

      return new Response(
        JSON.stringify({ type: 4, data: { embeds: [embed], flags: 64 } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "edit_case") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;

      const caseId: number = get("case_id");
      const newReason: string | undefined = get("reason");
      const newDurationMinutes: number | undefined = get("duration_minutes");

      const { data: caseRow } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .eq("guild_id", GUILD_ID)
        .maybeSingle();

      if (!caseRow) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `No case #${caseId} found in this server.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const updates: Record<string, any> = {};
      const changes: string[] = [];

      if (newReason !== undefined && newReason !== caseRow.reason) {
        updates.reason = newReason;
        changes.push(`**Reason:** ${caseRow.reason ?? "N/A"} \u2192 ${newReason}`);
      }
      if (newDurationMinutes !== undefined && newDurationMinutes !== caseRow.duration_minutes) {
        updates.duration_minutes = newDurationMinutes;
        changes.push(`**Duration:** ${caseRow.duration_minutes ?? "N/A"} min \u2192 ${newDurationMinutes} min`);
      }

      if (changes.length === 0) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "No changes provided \u2014 nothing to update.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("cases").update(updates).eq("id", caseId);

      const editEmbed = {
        title: "\uD83D\uDCDD Case Edited",
        description: `Case #${caseId} was edited by <@${discordUserId}>.\n\nThis is a record-only edit \u2014 the member's current roles/timeout were not changed.`,
        color: 0x3498db,
        fields: [{ name: "Changes", value: changes.join("\n"), inline: false }],
        footer: { text: caseFooterShort(caseId) },
      };
      const ping = `||<@${caseRow.user_id}>||`;

      if (LOG_CHANNEL_ID) {
        await discordApi(`/channels/${LOG_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: ping, embeds: [editEmbed] }),
        });
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: LOG_CHANNEL_ID
            ? { content: `Case #${caseId} edit logged in <#${LOG_CHANNEL_ID}>.`, flags: 64 }
            : { content: ping, embeds: [editEmbed] },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "remove_case") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const caseId: number = opts.find((o: any) => o.name === "case_id")?.value;

      const { data: caseRow } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .eq("guild_id", GUILD_ID)
        .maybeSingle();

      if (!caseRow) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `No case #${caseId} found in this server.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("cases").delete().eq("id", caseId);

      const ping = `||<@${caseRow.user_id}>||`;
      const logContent = `${ping}\n**Case #${caseId} \u2013 removed by <@${discordUserId}>.**\nThis case has been permanently deleted and will no longer appear in /cases or /view_cases. This does not undo any role/timeout/ban/kick that was applied.`;

      await discordApi(`/channels/${MOD_ACTION_LOG_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: logContent }),
      });

      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: `Case #${caseId} has been removed and logged in <#${MOD_ACTION_LOG_CHANNEL_ID}>.`, flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "appeal") {
      if (!memberRoles.includes(APPEAL_ALLOWED_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const caseId: number = get("case_id");
      const reason: string = get("reason");

      const { data: caseRow } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .eq("guild_id", GUILD_ID)
        .maybeSingle();

      if (!caseRow) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `No case #${caseId} found in this server.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (caseRow.user_id !== discordUserId) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You can only appeal your own cases.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (!caseRow.appealable) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `Case #${caseId} is not appealable.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (caseRow.appeal_status === "pending") {
        return new Response(
          JSON.stringify({ type: 4, data: { content: `Case #${caseId} already has a pending appeal.`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("cases").update({ appeal_status: "pending", appeal_reason: reason }).eq("id", caseId);

      const memberUsername = body.member?.user?.username ?? "member";
      const channelId = await createAppealTicketChannel(discordApi, GUILD_ID, discordUserId!, memberUsername, caseId);
      if (channelId) {
        await supabase.from("cases").update({ ticket_channel_id: channelId }).eq("id", caseId);
      }

      const appealEmbed: any = {
        title: `\uD83D\uDCCB Case #${caseId} Appeal`,
        color: 0xe67e22,
        thumbnail: { url: CSO_LOGO_URL },
        fields: [
          { name: "\uD83D\uDC64 Member", value: `<@${discordUserId}>`, inline: false },
          { name: "\u2696\uFE0F Original Reason", value: caseRow.reason, inline: false },
          { name: "\uD83D\uDCDD Appeal Reason", value: reason, inline: false },
        ],
        footer: { text: caseFooterShort(caseId) },
      };

      await discordApi(`/channels/${APPEAL_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: `<@${discordUserId}>`, embeds: [appealEmbed] }),
      });

      if (channelId) {
        await discordApi(`/channels/${channelId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `||<@${discordUserId}>||`,
            embeds: [appealEmbed],
            components: [
              {
                type: 1,
                components: [
                  { type: 2, style: 3, label: "Approve", custom_id: `appealreview_approve:${caseId}` },
                  { type: 2, style: 4, label: "Deny", custom_id: `appealreview_deny:${caseId}` },
                ],
              },
            ],
          }),
        });

        return new Response(
          JSON.stringify({ type: 4, data: { content: `Your appeal ticket has been created: <#${channelId}>`, flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content:
              "Your appeal was recorded and posted for review, but I couldn't create a private ticket channel for it. Ask an admin to give me the Manage Channels permission.",
            flags: 64,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "close_appeal_ticket") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You need the Moderate Members permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const currentChannelId = body.channel_id;
      const { data: caseRow } = await supabase
        .from("cases")
        .select("*")
        .eq("ticket_channel_id", currentChannelId)
        .maybeSingle();

      if (!caseRow) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "This channel isn't an open appeal ticket.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("cases").update({ ticket_channel_id: null }).eq("id", caseRow.id);

      const closeEmbed = {
        title: `\uD83D\uDD12 Appeal Ticket Closed \u2014 Case #${caseRow.id}`,
        description: `The appeal ticket for <@${caseRow.user_id}> was closed by <@${discordUserId}>.`,
        color: 0x99a1af,
        footer: { text: caseFooterShort(caseRow.id) },
      };

      const closeTask = (async () => {
        let transcriptText = "";
        try {
          const messages = await fetchAllChannelMessages(discordApi, currentChannelId);
          transcriptText = buildTicketTranscriptText(caseRow, messages);
        } catch (err) {
          console.error("Transcript fetch failed:", err);
        }

        try {
          if (transcriptText) {
            await postMessageWithFile(
              BOT_TOKEN,
              APPEAL_CLOSE_LOG_CHANNEL_ID,
              { embeds: [closeEmbed] },
              `appeal-case-${caseRow.id}-transcript.txt`,
              transcriptText,
            );
          } else {
            await discordApi(`/channels/${APPEAL_CLOSE_LOG_CHANNEL_ID}/messages`, {
              method: "POST",
              body: JSON.stringify({ embeds: [closeEmbed] }),
            });
          }
        } catch {
          // best-effort
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
          await discordApi(`/channels/${currentChannelId}`, { method: "DELETE" });
        } catch {
          // best-effort
        }
      })();

      // @ts-ignore - EdgeRuntime is provided by the Supabase Edge Functions runtime
      if (typeof EdgeRuntime !== "undefined") {
        // @ts-ignore
        EdgeRuntime.waitUntil(closeTask);
      } else {
        await closeTask;
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: `Closing this ticket and logging it in <#${APPEAL_CLOSE_LOG_CHANNEL_ID}>...` },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "end_investigation") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You need the Moderate Members permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;
      const targetUserId: string = get("member");

      const { data: caseRow } = await supabase
        .from("cases")
        .select("*")
        .eq("guild_id", GUILD_ID)
        .eq("user_id", targetUserId)
        .eq("punishment_type", "Under Investigation")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!caseRow) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "That member doesn't have an active investigation.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const memberRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`);
      const memberInfo = memberRes.ok ? await memberRes.json() : null;
      const currentRoles: string[] = memberInfo?.roles ?? [];
      const removedRoleIds: string[] = caseRow.removed_role_ids ?? [];

      const restoredRoles = Array.from(
        new Set([...currentRoles.filter((r) => r !== INVESTIGATION_ROLE_ID), ...removedRoleIds]),
      );

      const roleUpdateRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`, {
        method: "PATCH",
        body: JSON.stringify({ roles: restoredRoles }),
      });
      if (!roleUpdateRes.ok) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "I don't have permission to update that member's roles.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("cases").update({ status: "investigation_ended" }).eq("id", caseRow.id);

      const rolesList = removedRoleIds.length > 0
        ? removedRoleIds.map((r) => `<@&${r}>`).join(", ")
        : "No roles had been removed.";

      const endEmbed = {
        title: `\uD83D\uDD0D Investigation Ended \u2014 Case #${caseRow.id}`,
        description: `The investigation on <@${targetUserId}> was ended by <@${discordUserId}>.`,
        color: 0x22c55e,
        fields: [{ name: "Roles Restored", value: rolesList, inline: false }],
        footer: { text: caseFooterShort(caseRow.id) },
      };

      if (LOG_CHANNEL_ID) {
        await discordApi(`/channels/${LOG_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({ embeds: [endEmbed] }),
        });
      }

      try {
        await sendDM(targetUserId, {
          content: `Your investigation in this server has ended and your prior roles have been restored.`,
        });
      } catch {
        // best-effort
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: LOG_CHANNEL_ID
            ? { content: `Investigation ended. Logged in <#${LOG_CHANNEL_ID}>.`, flags: 64 }
            : { embeds: [endEmbed] },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "view_cases") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options ?? [];
      const targetUserId: string = opts.find((o: any) => o.name === "member")?.value;

      const { data: caseRows, error: casesError } = await supabase
        .from("cases")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("guild_id", GUILD_ID)
        .order("created_at", { ascending: false })
        .limit(10);

      if (casesError) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "Something went wrong looking up that member's cases.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (!caseRows || caseRows.length === 0) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: `<@${targetUserId}> has no cases on record.`, flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const embed = {
        title: `Cases \u2014 ${caseRows.length} on record`,
        color: 0xf5b942,
        thumbnail: { url: CSO_LOGO_URL },
        description: `Showing the most recent ${caseRows.length} case(s) for <@${targetUserId}>.`,
        fields: caseRows.map((c: any) => ({
          name: `#${c.id} \u2014 ${c.punishment_type ?? "Unknown"} (${c.status})`,
          value: [
            `**Reason:** ${c.reason ?? "N/A"}`,
            `**Moderator:** <@${c.moderator_id}>`,
            `**Date:** <t:${Math.floor(new Date(c.created_at).getTime() / 1000)}:D>`,
            c.duration_minutes ? `**Duration:** ${c.duration_minutes} min` : null,
            c.appeal_status ? `**Appeal:** ${c.appeal_status}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          inline: false,
        })),
        footer: { text: `Requested by ${body.member?.user?.username ?? "unknown"}` },
        timestamp: new Date().toISOString(),
      };

      return new Response(
        JSON.stringify({
          type: 4,
          data: { embeds: [embed], flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "loa") {
      const opts = body.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;

      const commanderUserId: string | undefined = get("commander");
      const startDate: string = get("start_date") ?? "";
      const endDate: string = get("end_date") ?? "";
      const reason: string = get("reason") ?? "";

      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRe.test(startDate) || !dateRe.test(endDate)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "Dates must be in YYYY-MM-DD format.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const applicationId = body.application_id;
      const interactionToken = body.token;

      const task = (async () => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("discord_id", discordUserId)
          .maybeSingle();

        if (!profile) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "We couldn't find a portal account linked to your Discord account. Please log in to the portal first.",
          });
          return;
        }

        const { data: inserted, error: insertError } = await supabase
          .from("loa_requests")
          .insert({
            user_id: profile.id,
            start_date: startDate,
            end_date: endDate,
            reason,
            status: "pending",
          })
          .select()
          .single();

        if (insertError || !inserted) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: "Something went wrong submitting your request. Please try again.",
          });
          return;
        }

        const requestEmbed = {
          title: "\uD83D\uDCC4 New LOA Request",
          color: 0xf5b942,
          thumbnail: { url: CSO_LOGO_URL },
          fields: [
            { name: "Member", value: `<@${discordUserId}>`, inline: true },
            { name: "Commander", value: `<@${commanderUserId}>`, inline: true },
            { name: "Start Date", value: startDate, inline: true },
            { name: "End Date", value: endDate, inline: true },
            { name: "Reason", value: reason, inline: false },
          ],
          footer: { text: `Request #${inserted.id} \u2014 Pending review` },
          timestamp: new Date().toISOString(),
        };

        await discordApi(`/channels/${LOA_CHANNEL_ID}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `<@${commanderUserId}>`,
            embeds: [requestEmbed],
            components: [
              {
                type: 1,
                components: [
                  { type: 2, style: 3, custom_id: `loa_approve:${inserted.id}`, label: "Approve" },
                  { type: 2, style: 4, custom_id: `loa_deny:${inserted.id}`, label: "Deny" },
                ],
              },
            ],
          }),
        });

        await editOriginalInteractionResponse(applicationId, interactionToken, {
          content: `Your LOA request has been submitted for review in <#${LOA_CHANNEL_ID}>.`,
        });
      })();

      EdgeRuntime.waitUntil(task);

      return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Unknown command", { status: 400 });
  }

  // ---------- Button clicks / select menus ----------
  if (body.type === 3) {
    const customId: string = body.data.custom_id;

    // --- Apply flow: template picker ---
    if (customId === "apply_template_select") {
      const templateId = body.data.values?.[0];

      const { data: questions } = await supabase
        .from("application_questions")
        .select("id")
        .eq("template_id", templateId);

      if (!questions || questions.length === 0) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "This application doesn't have any questions configured yet.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      // Clear out any stale/orphaned application already in progress for
      // this user before starting a new one, so there's never more than
      // one pending_applications row per user at a time.
      await supabase.from("pending_applications").delete().eq("discord_user_id", discordUserId);

      const { data: pending, error: pendingErr } = await supabase
        .from("pending_applications")
        .insert({
          template_id: templateId,
          discord_user_id: discordUserId,
          discord_username: body.member?.user?.username ?? "Unknown",
          answers: {},
          current_step: 0,
        })
        .select()
        .single();

      if (pendingErr || !pending) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "Couldn't start the application. Try again.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const ordered = await loadOrderedQuestions(supabase, templateId);
      const firstMessage = buildQuestionMessage(pending.id, ordered[0], 0, ordered.length);
      const sent = await sendDMPayload(BOT_TOKEN, discordUserId, firstMessage);

      if (!sent) {
        await supabase.from("pending_applications").delete().eq("id", pending.id);
        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content:
                "I couldn't DM you — please enable direct messages from server members (Privacy Settings) and run /apply again.",
              flags: 64,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: "Check your DMs to continue your application!", flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Apply flow: multiple-choice question answered via DM dropdown ---
    if (customId.startsWith("apply_answer_select:")) {
      const pendingId = customId.split(":")[1];

      const { data: pending } = await supabase
        .from("pending_applications")
        .select("*")
        .eq("id", pendingId)
        .maybeSingle();

      if (!pending || pending.discord_user_id !== discordUserId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "This application session expired. Please run /apply again.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const questions = await loadOrderedQuestions(supabase, pending.template_id);
      const currentQuestion = questions[pending.current_step];
      const chosen = body.data.values?.[0] ?? "";

      const answers: Record<string, string> = { ...(pending.answers ?? {}) };
      if (currentQuestion) answers[currentQuestion.id] = chosen;

      const nextIndex = pending.current_step + 1;

      if (nextIndex < questions.length) {
        await supabase.from("pending_applications").update({ answers, current_step: nextIndex }).eq("id", pendingId);
        const nextMessage = buildQuestionMessage(pendingId, questions[nextIndex], nextIndex, questions.length);
        return new Response(JSON.stringify({ type: 4, data: { ...nextMessage } }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const result = await finalizeApplication(supabase, discordApi, APPLICATIONS_CHANNEL_ID, pending, answers);
      if (result.error) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "Something went wrong saving your application. Please try again.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            embeds: [
              {
                title: "Application Submitted",
                description: "Thanks! Your application has been submitted. You'll be notified here once it's reviewed.",
                color: 0x22c55e,
              },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Apply flow: Cancel Application button ---
    if (customId.startsWith("apply_cancel:")) {
      const pendingId = customId.split(":")[1];

      const { data: pending } = await supabase
        .from("pending_applications")
        .select("id, discord_user_id")
        .eq("id", pendingId)
        .maybeSingle();

      if (pending && pending.discord_user_id === discordUserId) {
        await supabase.from("pending_applications").delete().eq("id", pendingId);
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: "Your application has been cancelled.", flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Shift manage flow ---
    if (customId === "shiftmgr_onduty") {
      const options = await getEligibleShiftTypeOptions(supabase, memberRoles);
      if (options.length === 0) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have an eligible shift type available.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          type: 7,
          data: {
            embeds: [{ title: "Select a shift type to begin:", color: 0xf5b942 }],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 3,
                    custom_id: "shiftmgr_type_select",
                    placeholder: "Choose a shift type...",
                    options,
                  },
                ],
              },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (customId === "shiftmgr_type_select") {
      const chosenKey = body.data.values?.[0];
      const result = await startShiftForDiscordUser(
        supabase, discordUserId!, memberRoles, chosenKey, BOT_TOKEN, GUILD_ID,
      );
      if (result.error) {
        return new Response(JSON.stringify({ type: 4, data: { content: result.error, flags: 64 } }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const refreshed = await buildShiftManageResponse(supabase, discordUserId!);
      return new Response(JSON.stringify({ type: 7, data: refreshed.data }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (customId === "shiftmgr_togglebreak") {
      const result = await toggleBreakForDiscordUser(supabase, discordUserId!);
      if (result.error) {
        return new Response(JSON.stringify({ type: 4, data: { content: result.error, flags: 64 } }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const refreshed = await buildShiftManageResponse(supabase, discordUserId!);
      return new Response(JSON.stringify({ type: 7, data: refreshed.data }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (customId === "shiftmgr_offduty") {
      const result = await endShiftForDiscordUser(supabase, discordUserId!, BOT_TOKEN, GUILD_ID);
      if (result.error) {
        return new Response(JSON.stringify({ type: 4, data: { content: result.error, flags: 64 } }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const refreshed = await buildShiftManageResponse(supabase, discordUserId!);
      return new Response(JSON.stringify({ type: 7, data: refreshed.data }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Reaction role dropdown ---
    if (customId === "reactionrole_select") {
      const roleId = body.data.values[0];
      const guildId = body.guild_id;
      const userId = body.member.user.id;
      const alreadyHasRole = (body.member.roles ?? []).includes(roleId);

      const method = alreadyHasRole ? "DELETE" : "PUT";
      const res = await discordApi(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method });

      const message = res.ok
        ? alreadyHasRole
          ? `Removed <@&${roleId}> from you.`
          : `Gave you <@&${roleId}>.`
        : `Something went wrong (${res.status}). Make sure the bot's role is above that role in Server Settings -> Roles.`;

      return new Response(JSON.stringify({ type: 4, data: { content: message, flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Appeal review flow ---
    if (customId.startsWith("appealreview_approve:") || customId.startsWith("appealreview_deny:")) {
      const approve = customId.startsWith("appealreview_approve:");
      const caseId = Number(customId.split(":")[1]);

      if (!memberRoles.includes(APPEAL_REVIEW_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to review appeals.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: caseRow } = await supabase.from("cases").select("*").eq("id", caseId).maybeSingle();
      if (!caseRow) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "That case no longer exists.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase
        .from("cases")
        .update({
          appeal_status: approve ? "approved" : "denied",
          status: approve ? "revoked" : caseRow.status,
        })
        .eq("id", caseId);

      if (approve && caseRow.punishment_type === "Suspension") {
        try {
          await discordApi(
            `/guilds/${GUILD_ID}/members/${caseRow.user_id}/roles/${SUSPENSION_ROLE_ID}`,
            { method: "DELETE" },
          );
        } catch {
          // best-effort
        }
      }

      const disabledComponents = (body.message?.components ?? []).map((row: any) => ({
        ...row,
        components: row.components.map((c: any) => ({ ...c, disabled: true })),
      }));

      const resultEmbed = approve
        ? {
            title: `\u2696\uFE0F Case #${caseId} Appealed Successfully`,
            description: `This case has been appealed by <@${discordUserId}>.`,
            color: 0x22c55e,
            fields: [{ name: "Action Taken", value: "Record cleared.", inline: false }],
            footer: { text: caseFooterShort(caseId) },
          }
        : {
            title: `\u274C Case #${caseId} Appeal Denied`,
            description: `This appeal has been denied by <@${discordUserId}>.`,
            color: 0xed4245,
            footer: { text: caseFooterShort(caseId) },
          };

      await discordApi(`/channels/${body.channel_id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: `||<@${caseRow.user_id}>||`, embeds: [resultEmbed] }),
      });

      try {
        await sendDM(caseRow.user_id, {
          content: approve
            ? `Your appeal for case #${caseId} was approved and your punishment was lifted.`
            : `Your appeal for case #${caseId} was denied.`,
        });
      } catch {
        // best-effort
      }

      return new Response(
        JSON.stringify({ type: 7, data: { components: disabledComponents } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Application review: Accept / Deny ---
    if (customId.startsWith("app_accept:") || customId.startsWith("app_deny:")) {
      const accept = customId.startsWith("app_accept:");
      const submissionId = customId.split(":")[1];

      if (!memberRoles.includes(APPLICATION_REVIEW_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to review applications.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: submissionRow } = await supabase
        .from("application_submissions")
        .select("*")
        .eq("id", submissionId)
        .maybeSingle();

      if (!submissionRow) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This application no longer exists.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (accept) {
        try {
          await discordApi(
            `/guilds/${GUILD_ID}/members/${submissionRow.discord_user_id}/roles/${APPLICATION_ACCEPT_ADD_ROLE_ID}`,
            { method: "PUT" },
          );
        } catch {
          // best-effort
        }
        try {
          await discordApi(
            `/guilds/${GUILD_ID}/members/${submissionRow.discord_user_id}/roles/${APPLICATION_ACCEPT_REMOVE_ROLE_ID}`,
            { method: "DELETE" },
          );
        } catch {
          // best-effort — no-op if they don't have the role
        }
      }

      const disabledComponents = (body.message?.components ?? []).map((row: any) => ({
        ...row,
        components: row.components.map((c: any) => ({ ...c, disabled: true })),
      }));

      const resultEmbed = accept
        ? {
            title: "\u2705 Application Accepted",
            description: `${submissionRow.discord_username}'s application was accepted by <@${discordUserId}>.`,
            color: 0x22c55e,
            footer: { text: `Submission ID: ${submissionRow.id}` },
          }
        : {
            title: "\u274C Application Denied",
            description: `${submissionRow.discord_username}'s application was denied by <@${discordUserId}>.`,
            color: 0xed4245,
            footer: { text: `Submission ID: ${submissionRow.id}` },
          };

      await discordApi(`/channels/${APPLICATION_LOG_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ embeds: [resultEmbed] }),
      });

      try {
        await sendDM(submissionRow.discord_user_id, {
          content: accept
            ? "Congratulations! Your CSO application has been **accepted**."
            : "Thank you for applying. Unfortunately your CSO application has been **denied**.",
        });
      } catch {
        // best-effort
      }

      return new Response(
        JSON.stringify({ type: 7, data: { components: disabledComponents } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Application review: Check AI ---
    if (customId.startsWith("app_checkai:")) {
      const submissionId = customId.split(":")[1];

      if (!memberRoles.includes(APPLICATION_REVIEW_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to review applications.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: submissionRow } = await supabase
        .from("application_submissions")
        .select("*")
        .eq("id", submissionId)
        .maybeSingle();

      if (!submissionRow) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This application no longer exists.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: answerRows } = await supabase
        .from("application_answers")
        .select("*")
        .eq("submission_id", submissionId);

      const answers: any[] = answerRows ?? [];

      const results = await Promise.all(
        answers.map(async (a: any) => {
          const text: string = a.answer_text ?? "";
          if (!text.trim()) {
            return { question: a.question_text, score: null as number | null, error: false };
          }
          try {
            const saplingRes = await fetch("https://api.sapling.ai/api/v1/aidetect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key: SAPLING_API_KEY, text }),
            });
            if (!saplingRes.ok) {
              return { question: a.question_text, score: null as number | null, error: true };
            }
            const saplingData = await saplingRes.json();
            const score: number | null = typeof saplingData.score === "number" ? saplingData.score : null;
            return { question: a.question_text, score, error: false };
          } catch {
            return { question: a.question_text, score: null as number | null, error: true };
          }
        }),
      );

      const fields = results.map((r) => ({
        name: r.question.slice(0, 256),
        value: r.error
          ? "Couldn't run AI detection for this answer."
          : r.score === null
          ? "No answer to check."
          : `${Math.round(r.score * 100)}% likely AI-generated`,
        inline: false,
      }));

      const checkEmbed = {
        title: "\uD83E\uDD16 AI Detection Results",
        description: `Checked ${submissionRow.discord_username}'s application (Submission ID: ${submissionRow.id}).`,
        color: 0x5865f2,
        fields,
        footer: { text: `Checked by ${discordUserId ? `<@${discordUserId}>` : "unknown"}` },
      };

      await discordApi(`/channels/${APPLICATION_AI_CHECK_LOG_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ embeds: [checkEmbed] }),
      });

      return new Response(
        JSON.stringify({ type: 4, data: { embeds: [checkEmbed], flags: 64 } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- LOA approve/deny flow ---
    const [action, loaId] = customId.split(":");

    if (!memberRoles.includes(APPROVER_ROLE_ID)) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: "You don't have permission to review LOA requests.", flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: loaRow } = await supabase.from("loa_requests").select("*").eq("id", loaId).single();

    if (!loaRow) {
      return new Response(
        JSON.stringify({ type: 4, data: { content: "This LOA request no longer exists.", flags: 64 } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (action === "loa_deny") {
      return new Response(
        JSON.stringify({
          type: 9,
          data: {
            custom_id: `loa_deny_modal:${loaId}`,
            title: "Deny LOA Request",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "deny_reason",
                    style: 2,
                    label: "Reason for denial",
                    placeholder: "Explain why this request is being denied...",
                    required: true,
                    max_length: 500,
                  },
                ],
              },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (action === "loa_approve") {
      return new Response(
        JSON.stringify({
          type: 9,
          data: {
            custom_id: `loa_approve_modal:${loaId}`,
            title: "Approve LOA Request",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "start_date",
                    style: 1,
                    label: "Start date (YYYY-MM-DD)",
                    value: loaRow.start_date,
                    required: true,
                    max_length: 10,
                  },
                ],
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "end_date",
                    style: 1,
                    label: "End date (YYYY-MM-DD) - shorten if needed",
                    value: loaRow.end_date,
                    required: true,
                    max_length: 10,
                  },
                ],
              },
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "notes",
                    style: 2,
                    label: "Notes (optional)",
                    placeholder: "Any additional notes for this approval...",
                    required: false,
                    max_length: 500,
                  },
                ],
              },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("Unknown action", { status: 400 });
  }

  // ---------- Modal submissions ----------
  if (body.type === 5) {
    const customId: string = body.data.custom_id;

    // --- Reaction role description modal ---
    if (customId.startsWith("reactionrole_modal:")) {
      const pendingId = customId.split(":")[1];
      const fields = body.data.components.flatMap((row: any) => row.components);
      const description = fields.find((f: any) => f.custom_id === "description")?.value ?? "";

      const { data: pending } = await supabase
        .from("pending_reaction_roles")
        .select("*")
        .eq("id", pendingId)
        .maybeSingle();

      if (!pending) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "This request expired. Please run /reaction_role again.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("pending_reaction_roles").delete().eq("id", pendingId);

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            embeds: [
              { title: pending.title, description, color: 0xf5b942, thumbnail: { url: CSO_LOGO_URL } },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 3,
                    custom_id: "reactionrole_select",
                    placeholder: "Make a selection",
                    options: pending.options,
                  },
                ],
              },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (customId === "suggestions_modal" || customId === "personnel_suggestions_modal") {
  const isPersonnel = customId === "personnel_suggestions_modal";
  const fields = body.data.components.flatMap((row: any) => row.components);
  const robloxUser = fields.find((f: any) => f.custom_id === "roblox_user")?.value ?? "";
  const message = fields.find((f: any) => f.custom_id === "message")?.value ?? "";

  const submitter = body.member?.user ?? body.user;
  const channelId = isPersonnel
    ? Deno.env.get("PERSONNEL_SUGGESTIONS_CHANNEL_ID")
    : Deno.env.get("SUGGESTIONS_CHANNEL_ID");

  const embed = {
    author: {
      name: isPersonnel ? "CSO Personnel Suggestions" : "CSO Suggestions",
      icon_url: CSO_LOGO_URL,
    },
    title: isPersonnel ? "📋 New Personnel Suggestion Submitted" : "📋 New Suggestion Submitted",
    description: message.trim(),
    color: 0xf5b942,
    thumbnail: { url: CSO_LOGO_URL },
    fields: [
      { name: "Discord User", value: submitter?.username ?? "Not provided", inline: true },
      { name: "Roblox User", value: robloxUser.trim() || "Not provided", inline: true },
    ],
    footer: { text: "CSO Corporation • cso-corporations.vercel.app" },
    timestamp: new Date().toISOString(),
  };

  const sendRes = await discordApi(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (sendRes.ok) {
    const sentMessage = await sendRes.json();
    for (const emoji of ["✅", "❌"]) {
      await discordApi(
        `/channels/${channelId}/messages/${sentMessage.id}/reactions/${encodeURIComponent(emoji)}/@me`,
        { method: "PUT" },
      );
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return new Response(
    JSON.stringify({ type: 4, data: { content: "Thanks — your suggestion has been submitted!", flags: 64 } }),
    { headers: { "Content-Type": "application/json" } },
  );
}
    
// --- Feedback modal ---
    if (customId.startsWith("feedback_modal:")) {
      const staffUserId = customId.split(":")[1];
      const fields = body.data.components.flatMap((row: any) => row.components);
      const ratingRaw = fields.find((f: any) => f.custom_id === "rating")?.value ?? "";
      const notes = fields.find((f: any) => f.custom_id === "notes")?.value ?? "";

      const rating = parseInt(ratingRaw, 10);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "Rating must be a number from 1 to 5. Please run /feedback again.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const submitter = body.member?.user ?? body.user;

      await discordApi(`/channels/${FEEDBACK_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({
          embeds: [
            {
              author: { name: submitter?.username ?? "Unknown" },
              title: "Staff Feedback",
              color: ratingColor(rating),
              thumbnail: { url: CSO_LOGO_URL },
              fields: [
                { name: "Staff Member", value: staffUserId ? `<@${staffUserId}>` : "Not specified" },
                { name: "Rating", value: starBar(rating) },
                { name: "Review", value: notes },
              ],
              footer: { text: `Feedback ID: ${Date.now()}` },
            },
          ],
        }),
      });

      return new Response(
        JSON.stringify({ type: 4, data: { content: "Thanks — your feedback has been submitted!", flags: 64 } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- LOA approve/deny modals ---
    const [modalAction, loaId] = customId.split(":");
    const components = body.data.components ?? [];

    if (!memberRoles.includes(APPROVER_ROLE_ID)) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: "You don't have permission to review LOA requests.", flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: loaRow } = await supabase.from("loa_requests").select("*").eq("id", loaId).single();

    if (!loaRow) {
      return new Response(
        JSON.stringify({ type: 4, data: { content: "This LOA request no longer exists.", flags: 64 } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: memberProfile } = await supabase
      .from("profiles")
      .select("discord_id, discord_username")
      .eq("id", loaRow.user_id)
      .single();

    const originalEmbed = body.message?.embeds?.[0] ?? {};

    if (modalAction === "loa_deny_modal") {
      const reason = getComponentValue(components, "deny_reason");

      await supabase.from("loa_requests").update({ status: "denied", denial_reason: reason }).eq("id", loaId);
      await supabase.from("profiles").update({ loa_status: "clear" }).eq("id", loaRow.user_id);

      if (memberProfile?.discord_id) {
        try {
          await discordApi(`/channels/${LOA_CHANNEL_ID}/messages`, {
            method: "POST",
            body: JSON.stringify({
              content: `<@${memberProfile.discord_id}>`,
              embeds: [
                {
                  title: "\u274C LOA Request Denied",
                  description: `Your LOA request was denied.\n\n**Reason:** ${reason}`,
                  color: 0xef4444,
                  timestamp: new Date().toISOString(),
                },
              ],
            }),
          });
        } catch {
          // best-effort
        }
      }

      return new Response(
        JSON.stringify({
          type: 7,
          data: {
            embeds: [
              { ...originalEmbed, color: 0xef4444, footer: { text: `\u274C Denied by ${reviewerName} \u2014 ${reason}` } },
            ],
            components: [],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (modalAction === "loa_approve_modal") {
      const newStartDate = getComponentValue(components, "start_date") || loaRow.start_date;
      const newEndDate = getComponentValue(components, "end_date") || loaRow.end_date;
      const notes = getComponentValue(components, "notes");

      await supabase
        .from("loa_requests")
        .update({ status: "approved", start_date: newStartDate, end_date: newEndDate, admin_notes: notes || null })
        .eq("id", loaId);
      await supabase.from("profiles").update({ loa_status: "active" }).eq("id", loaRow.user_id);

      if (memberProfile?.discord_id) {
        try {
          await fetch(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${memberProfile.discord_id}/roles/${LOA_ROLE_ID}`,
            { method: "PUT", headers: { Authorization: `Bot ${BOT_TOKEN}` } },
          );
        } catch {
          // best-effort
        }

        try {
          await discordApi(`/channels/${LOA_CHANNEL_ID}/messages`, {
            method: "POST",
            body: JSON.stringify({
              content: `<@${memberProfile.discord_id}>`,
              embeds: [
                {
                  title: "\u2705 LOA Request Approved",
                  description: `Your LOA request was approved.\n\n**Start:** ${newStartDate}\n**End:** ${newEndDate}${notes ? `\n**Notes:** ${notes}` : ""}`,
                  color: 0x22c55e,
                  timestamp: new Date().toISOString(),
                },
              ],
            }),
          });
        } catch {
          // best-effort
        }
      }

      return new Response(
        JSON.stringify({
          type: 7,
          data: {
            embeds: [
              {
                ...originalEmbed,
                color: 0x22c55e,
                fields: (originalEmbed.fields ?? []).map((f: any) =>
                  f.name === "Start Date"
                    ? { ...f, value: newStartDate }
                    : f.name === "End Date"
                      ? { ...f, value: newEndDate }
                      : f,
                ),
                footer: { text: `\u2705 Approved by ${reviewerName}${notes ? ` \u2014 ${notes}` : ""}` },
              },
            ],
            components: [],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("Unknown modal action", { status: 400 });
  }

  return new Response("Unhandled interaction type", { status: 400 });
});
