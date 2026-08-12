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
// Role allowed to bypass the role-hierarchy check in /punish entirely.
const HIERARCHY_BYPASS_ROLE_ID = "1532169753022693479";
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
const BLACKLIST_ROLE_ID = "1462501582062092329";
const BLACKLIST_LOG_CHANNEL_ID = "1535819631212765214";

const TICKET_CATEGORY_ID = "1462489110659993721";
const TICKET_TRANSCRIPT_CHANNEL_ID = "1462489107883364465";
const TICKET_PING_EXTRA_ROLE_ID = "1462490581291761841";
const TICKET_CATEGORIES: Record<string, { label: string; roleIds: string[]; welcomeIntro: string; color: number; categoryName: string }> = {
  management: {
    label: "CSO Management",
    roleIds: ["1511751384637374525", "1532169753022693479", "1462490786842280072"],
    welcomeIntro:
      "Thank you for contacting CSO Management. At this time the CSO Division Commanders have been contacted and will respond to your ticket soon.",
    color: 0x3498db,
    categoryName: "═════ CSO Management Tickets ═════",
  },
  report: {
    label: "Report Ticket",
    roleIds: [
      "1511751384637374525", "1532169753022693479", "1462490786842280072",
      "1469915757583270031", "1495923952038449354", "1466226180863561738",
    ],
    welcomeIntro:
      "Thank you for submitting a report. At this time staff have been contacted and will respond to your ticket soon.",
    color: 0xed4245,
    categoryName: "═════ CSO Report Tickets ═════",
  },
  inquiry: {
    label: "Inquiry Support",
    roleIds: [
      "1511751384637374525", "1532169753022693479", "1462490786842280072",
      "1469915757583270031", "1495923952038449354", "1466226180863561738",
    ],
    welcomeIntro:
      "Thank you for contacting CSO Inquiry Support. At this time staff have been contacted and will respond to your ticket soon.",
    color: 0x2ecc71,
    categoryName: "═════ CSO Inquiry Tickets ═════",
  },
};
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
// On Accept: the member's server nickname is set to "<prefix> <their current name>"
// (truncated to Discord's 32-character nickname limit).
const APPLICATION_ACCEPT_NICKNAME_PREFIX = "(TR)";
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
  form.append("files[0]", new Blob([fileText], { type: "text/html" }), filename);
  return fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}` },
    body: form,
  });
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTranscriptHtml(
  messages: any[],
  meta: { channelName: string; category: string; opener: string; closedBy: string; reason?: string },
): string {
  const rows = messages
    .map((m) => {
      const author = escapeHtml(m.author?.global_name || m.author?.username || "Unknown");
      const avatar = m.author?.avatar
        ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
        : "https://cdn.discordapp.com/embed/avatars/0.png";
      const time = new Date(m.timestamp).toLocaleString("en-US");
      const content = escapeHtml(m.content || "").replace(/\n/g, "<br>");
      return `<div class="msg"><img src="${avatar}"><div><div class="meta"><span class="author">${author}</span><span class="time">${time}</span></div><div class="content">${content || "<i>(no text content)</i>"}</div></div></div>`;
    })
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transcript - ${escapeHtml(meta.channelName)}</title>
<style>
body{background:#313338;color:#dbdee1;font-family:Whitney,Helvetica,Arial,sans-serif;margin:0;padding:20px;}
.header{background:#2b2d31;padding:16px;border-radius:8px;margin-bottom:16px;}
.header h1{margin:0 0 8px;font-size:20px;}
.header p{margin:2px 0;color:#b5bac1;font-size:14px;}
.msg{display:flex;gap:12px;padding:8px 0;}
.msg img{width:40px;height:40px;border-radius:50%;}
.meta{display:flex;gap:8px;align-items:baseline;}
.author{font-weight:600;color:#f2f3f5;}
.time{font-size:12px;color:#949ba4;}
.content{white-space:pre-wrap;word-break:break-word;}
</style></head><body>
<div class="header">
<h1>#${escapeHtml(meta.channelName)}</h1>
<p>Category: ${escapeHtml(meta.category)}</p>
<p>Opened by: ${escapeHtml(meta.opener)}</p>
<p>Closed by: ${escapeHtml(meta.closedBy)}</p>
${meta.reason ? `<p>Reason: ${escapeHtml(meta.reason)}</p>` : ""}
<p>Messages: ${messages.length}</p>
</div>
${rows}
</body></html>`;
}

async function findOrCreateTicketCategory(
  discordApi: (path: string, init?: RequestInit) => Promise<Response>,
  guildId: string,
  categoryName: string,
  staffRoleIds: string[],
): Promise<string | null> {
  const listRes = await discordApi(`/guilds/${guildId}/channels`);
  if (listRes.ok) {
    const channels = await listRes.json();
    const existing = channels.find((c: any) => c.type === 4 && c.name === categoryName);
    if (existing) return existing.id;
  }

  const VIEW_CHANNEL = 1024n;
  const SEND_MESSAGES = 2048n;
  const permissionOverwrites = [
    { id: guildId, type: 0, deny: VIEW_CHANNEL.toString() },
    ...staffRoleIds.map((r) => ({ id: r, type: 0, allow: (VIEW_CHANNEL | SEND_MESSAGES).toString() })),
  ];

  const createRes = await discordApi(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: categoryName,
      type: 4,
      permission_overwrites: permissionOverwrites,
    }),
  });
  if (!createRes.ok) return null;
  const created = await createRes.json();
  return created.id;
}
async function closeTicket(
  discordApi: (path: string, init?: RequestInit) => Promise<Response>,
  supabase: any,
  botToken: string,
  channelId: string,
  closedByUserId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("channel_id", channelId)
    .eq("status", "open")
    .maybeSingle();

  if (!ticket) return { ok: false, error: "No open ticket found for this channel." };

  const messages = await fetchAllChannelMessages(discordApi, channelId);
  const chRes = await discordApi(`/channels/${channelId}`);
  const chData = chRes.ok ? await chRes.json() : { name: channelId };
  const categoryLabel = TICKET_CATEGORIES[ticket.category]?.label ?? ticket.category;

  const html = buildTranscriptHtml(messages, {
    channelName: chData.name || channelId,
    category: categoryLabel,
    opener: `<@${ticket.opener_id}>`,
    closedBy: `<@${closedByUserId}>`,
    reason,
  });

const transcriptPath = `ticket-${ticket.id}.html`;
  try {
    await supabase.storage
      .from("ticket-transcripts")
      .upload(transcriptPath, new Blob([html], { type: "text/html" }), {
        contentType: "text/html",
        upsert: true,
      });
  } catch (err) {
    console.error("Transcript storage upload failed:", err);
  }

  const transcriptUrl = `https://cso-corporations.vercel.app/portal/transcripts/${ticket.id}`;
  const finalReason = reason || "Resolved.";
  const openedAtUnix = Math.floor(new Date(ticket.created_at ?? Date.now()).getTime() / 1000);
  const TICKET_CATEGORY_ID = "1462489110659993721";
  
const closedEmbed = {
    author: { name: "Comet Strategic Operations Corporation", icon_url: CSO_LOGO_URL },
    title: "Ticket Closed",
    color: 0x2ecc71,
    fields: [
      { name: "\uD83C\uDD94 Ticket ID", value: `${ticket.id}`, inline: true },
      { name: "\u2705 Opened By", value: `<@${ticket.opener_id}>`, inline: true },
      { name: "\uD83D\uDD34 Closed By", value: `<@${closedByUserId}>`, inline: true },
      { name: "\uD83D\uDD50 Open Time", value: `<t:${openedAtUnix}:F>`, inline: true },
      { name: "\uD83D\uDFE3 Claimed By", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Not claimed", inline: true },
      { name: "\u2753 Reason", value: finalReason, inline: false },
    ],
    timestamp: new Date().toISOString(),
  };

  const rowComponents: any[] = [];
  if (transcriptUrl) {
    rowComponents.push({ type: 2, style: 5, label: "View Online Transcript", url: transcriptUrl });
  }
  rowComponents.push({ type: 2, style: 2, label: "Edit Reason", custom_id: `ticket_edit_reason:${ticket.id}` });

  await discordApi(`/channels/${TICKET_TRANSCRIPT_CHANNEL_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      embeds: [closedEmbed],
      components: [{ type: 1, components: rowComponents }],
    }),
  });
try {
    const dmComponents = transcriptUrl
      ? [{ type: 1, components: [{ type: 2, style: 5, label: "View Online Transcript", url: transcriptUrl }] }]
      : [];
    await sendDM(ticket.opener_id, {
      embeds: [closedEmbed],
      components: dmComponents,
    });
  } catch (err) {
    console.error("Ticket-closed DM failed:", err);
  }
  await supabase
    .from("tickets")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      close_reason: finalReason,
      transcript_path: transcriptPath,
    })
    .eq("id", ticket.id);

  await discordApi(`/channels/${channelId}`, { method: "DELETE" });

  return { ok: true };
}async function postMessageWithImageAttachments(
  botToken: string,
  channelId: string,
  jsonPayload: Record<string, unknown>,
  images: { url: string; filename: string }[],
): Promise<Response> {
  const form = new FormData();
  const attachments: { id: number; filename: string }[] = [];

  for (let i = 0; i < images.length; i++) {
    const fileRes = await fetch(images[i].url);
    const blob = await fileRes.blob();
    form.append(`files[${i}]`, blob, images[i].filename);
    attachments.push({ id: i, filename: images[i].filename });
  }

  form.append("payload_json", JSON.stringify({ ...jsonPayload, attachments }));

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

  // Sets (or clears) the SEND_MESSAGES bit for a role's permission overwrite on a
  // channel, without touching any other permission bits already set for that role.
  async function setChannelSendPermission(
    channelId: string,
    roleId: string,
    mode: "deny" | "allow" | "neutral",
  ) {
    const SEND_MESSAGES_BIT = 2048n; // 1 << 11

    const chRes = await discordApi(`/channels/${channelId}`);
    if (!chRes.ok) {
      throw new Error(`GET channel failed (${chRes.status}): ${await chRes.text()}`);
    }
    const channel = await chRes.json();
    const existing = (channel.permission_overwrites || []).find((o: any) => o.id === roleId);

    let allow = existing ? BigInt(existing.allow) : 0n;
    let deny = existing ? BigInt(existing.deny) : 0n;

    if (mode === "deny") {
      deny |= SEND_MESSAGES_BIT;
      allow &= ~SEND_MESSAGES_BIT;
    } else if (mode === "allow") {
      allow |= SEND_MESSAGES_BIT;
      deny &= ~SEND_MESSAGES_BIT;
    } else {
      allow &= ~SEND_MESSAGES_BIT;
      deny &= ~SEND_MESSAGES_BIT;
    }

    const putRes = await discordApi(`/channels/${channelId}/permissions/${roleId}`, {
      method: "PUT",
      body: JSON.stringify({ type: 0, allow: allow.toString(), deny: deny.toString() }),
    });
    if (!putRes.ok) {
      throw new Error(`PUT permission overwrite failed (${putRes.status}): ${await putRes.text()}`);
    }
  }

  function moderationDMMessage(caseId: number, actionPhrase: string, reason: string): string {
    return `**Case #${caseId} \u2013 You have been ${actionPhrase} in ${SERVER_NAME}.**\n**Reason:** ${reason}`;
  }

  if (body.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---------- Autocomplete ----------
  if (body.type === 4) {
    if (body.data?.name === "force_end_shift") {
      const FORCE_END_SHIFT_ROLE_ID = "1529239995607416983";
      const focused = body.data.options?.find((o: any) => o.focused)?.value?.toLowerCase() ?? "";

      const membersRes = await discordApi(`/guilds/${GUILD_ID}/members?limit=1000`);
      const members = membersRes.ok ? await membersRes.json() : [];

      const choices = members
        .filter((m: any) => m.roles?.includes(FORCE_END_SHIFT_ROLE_ID))
        .filter((m: any) => {
          const name = (m.nick || m.user?.global_name || m.user?.username || "").toLowerCase();
          return !focused || name.includes(focused);
        })
        .slice(0, 25)
        .map((m: any) => ({
          name: m.nick || m.user?.global_name || m.user?.username || m.user?.id,
          value: m.user?.id,
        }));

      return new Response(JSON.stringify({ type: 8, data: { choices } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ type: 8, data: { choices: [] } }), {
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

  // Filter out templates the member doesn't meet the role-hierarchy
  // requirement for (e.g. COMET requires role 1463685989154427041 or higher).
  const templatesNeedingCheck = templates.filter((t: any) => t.required_role_id);
  let eligibleTemplates = templates;

  if (templatesNeedingCheck.length > 0) {
    const rolesRes = await discordApi(`/guilds/${GUILD_ID}/roles`);
    const rolesList = rolesRes.ok ? await rolesRes.json() : [];
    const rolePositionById: Record<string, number> = {};
    for (const r of rolesList) rolePositionById[r.id] = r.position;

    const memberTopPos = topRolePosition(memberRoles, rolePositionById);

    eligibleTemplates = templates.filter((t: any) => {
      if (!t.required_role_id) return true;
      const requiredPos = rolePositionById[t.required_role_id] ?? 0;
      return memberTopPos >= requiredPos;
    });
  }

  if (eligibleTemplates.length === 0) {
    return new Response(
      JSON.stringify({
        type: 4,
        data: { content: "No applications are open right now.", flags: 64 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify(buildApplyIntroResponse(eligibleTemplates)), {
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
        const invokerBypassesHierarchy = memberRoles.includes(HIERARCHY_BYPASS_ROLE_ID);

        if (targetTopPos >= invokerTopPos && !invokerIsOwner && !invokerBypassesHierarchy) {
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

const LOG_RESPONSE_ALLOWED_ROLE_IDS = [
  "1497779990241087579",
  "1530325162560458752",
];
const RESPONSE_LOG_CHANNEL_ID = "1536881622727659590";

if (commandName === "log_response") {
  if (!memberRoles.some((r) => LOG_RESPONSE_ALLOWED_ROLE_IDS.includes(r))) {
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

  const client: string = get("client");
  const type: string = get("type");
  const outcome: string = get("outcome");
  const summary: string = get("summary");
  const officers: string = get("officers");
  const cometMembers: string | undefined = get("comet_members");

  const applicationId = body.application_id;
  const interactionToken = body.token;

  const task = (async () => {
    const { data: inserted, error: insertErr } = await supabase
      .from("response_logs")
      .insert({
        guild_id: GUILD_ID,
        responder_id: discordUserId,
        officers,
        comet_members: cometMembers ?? null,
        client,
        type,
        outcome,
        summary,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: "\u26A0\uFE0F Something went wrong saving that log. Please try again.",
      });
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    const caseNumber = `CSO-${String(inserted.id).padStart(5, "0")}`;

    const logEmbed = {
      author: { name: "Comet Strategic Operations \u2014 Incident Report", icon_url: CSO_LOGO_URL },
      title: `\uD83D\uDCC4 Case File ${caseNumber}`,
      color: 0x1f2937,
      description:
        "```\n" +
        `DATE FILED    : ${dateStr} \u2014 ${timeStr} UTC\n` +
        `INCIDENT TYPE : ${type}\n` +
        `DISPOSITION   : ${outcome}\n` +
        "```",
      fields: [
        { name: "\uD83D\uDC6E Reporting Officer", value: `<@${discordUserId}>`, inline: true },
        { name: "\uD83D\uDCCD Location / Client", value: client, inline: true },
        { name: "\u200B", value: "\u200B", inline: false },
        { name: "\uD83E\uDD1D Assisting Officers", value: officers, inline: true },
        { name: "\u26A1 C.O.M.E.T. Task Force", value: cometMembers?.trim() ? cometMembers : "None assigned", inline: true },
        { name: "\u200B", value: "\u200B", inline: false },
        { name: "\uD83D\uDCDD Narrative", value: summary, inline: false },
      ],
      footer: { text: `Case ${caseNumber} \u2022 Filed via CSO Records System` },
      timestamp: now.toISOString(),
    };

    await discordApi(`/channels/${RESPONSE_LOG_CHANNEL_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({ embeds: [logEmbed] }),
    });

    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: `Logged. Posted in <#${RESPONSE_LOG_CHANNEL_ID}>.`,
    });
  })();

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

        await discordApi(`/channels/1535822320134787133/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `**Warned**\n**User:** <@${targetUserId}>\n**By:** <@${discordUserId}>\n**Reason:** ${reason}`,
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

    if (commandName === "fastpass") {
      if (!memberRoles.includes("1530325162560458752")) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const targetUser = body.data.options?.find((o: any) => o.name === "user")?.value;

      const embed = {
        color: 0x2ecc71,
        description:
          "# Thank you for trying to fast pass into Comet Strategic Operations!\n" +
          "You're subject to a No Tolerance Period for a total of 7 days. You will need to attend events or be on shift events for those 7 total days. If you don't complete this task, you're subject to exile and a 7 day blacklist that's unappealable.\n\n" +
          "## __You will be put into the rank of Logistics Coordinator after passing your training. You will work at the frontlines along with the COMET task force and Reconnaissance unit.__\n\n" +
          "## Please accept if you agree to the following terms. Failure to do so within 12 hours will result in this ticket being closed.",
      };

      const components = [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: "\u2705 I Agree",
              custom_id: `fastpass_agree_${targetUser}`,
            },
          ],
        },
      ];

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `<@${targetUser}>`,
            embeds: [embed],
            components,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "training_finished") {
      if (!memberRoles.includes("1530325162560458752")) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const opts = body.data.options || [];
      const getOpt = (name: string) => opts.find((o: any) => o.name === name)?.value;

      const trainerRoblox = getOpt("trainer_roblox");
      const trainerDiscordId = getOpt("trainer_discord");
      const timeStarted = getOpt("time_started");
      const timeFinished = getOpt("time_finished");
      const attendedCount = getOpt("attended_count");
      const attendedNames = getOpt("attended_names");
      const passedCount = getOpt("passed_count");
      const passedNames = getOpt("passed_names");
      const notes = getOpt("notes");
      const startingScreenshotId = getOpt("starting_screenshot");
      const endingScreenshotId = getOpt("ending_screenshot");
      const proofAttachmentId = getOpt("proof");

      const resolvedAttachments = body.data.resolved?.attachments || {};
      const startingScreenshot = startingScreenshotId ? resolvedAttachments[startingScreenshotId] : undefined;
      const endingScreenshot = endingScreenshotId ? resolvedAttachments[endingScreenshotId] : undefined;
      const proofUrl = proofAttachmentId ? resolvedAttachments[proofAttachmentId]?.url : undefined;

      const TRAINING_PING_ROLE_ID = "1530325162560458752";
      const TRAINING_THREAD_ID = "1490200623541522622";

      const lines = [
        `[ROBLOX USERNAME] ${trainerRoblox}`,
        `[DISCORD USERNAME] <@${trainerDiscordId}>`,
        `[EVENT] Training Required Event`,
        `[TIME STARTED] ${timeStarted}`,
        `[TIME ENDED] ${timeFinished}`,
        `[ATTENDED] ${attendedCount}`,
        ``,
        `${attendedNames}`,
        ``,
        `[PASSED] ${passedCount}`,
        ``,
        `${passedNames}`,
        ``,
        `[NOTES] ${notes ? notes : "None"}`,
        `[PROOF] Below!${proofUrl ? ` Additional proof: ${proofUrl}` : ""}`,
        `[PING] <@&${TRAINING_PING_ROLE_ID}>`,
      ];

      const applicationId = body.application_id;
      const interactionToken = body.token;

      const images: { url: string; filename: string }[] = [];
      if (startingScreenshot) images.push({ url: startingScreenshot.url, filename: startingScreenshot.filename || "starting.png" });
      if (endingScreenshot) images.push({ url: endingScreenshot.url, filename: endingScreenshot.filename || "ending.png" });

      const task = (async () => {
        const postRes = await postMessageWithImageAttachments(
          BOT_TOKEN,
          TRAINING_THREAD_ID,
          {
            content: lines.join("\n"),
            allowed_mentions: { roles: [TRAINING_PING_ROLE_ID] },
          },
          images,
        );

        await editOriginalInteractionResponse(applicationId, interactionToken, {
          content: postRes.ok
            ? `Training report posted in <#${TRAINING_THREAD_ID}>.`
            : "I couldn't post to that thread — check my permissions there.",
        });

        if (postRes.ok && Number(passedCount) > 0) {
          await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: "Select who passed to give them their new roles:",
              flags: 64,
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 5, // USER_SELECT
                      custom_id: "training_passed_role_select",
                      placeholder: "Select who passed",
                      min_values: 1,
                      max_values: 25,
                    },
                  ],
                },
              ],
            }),
          });
        }
      })();

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

    if (commandName === "lock" || commandName === "unlock") {
      const LOCK_ALLOWED_ROLE_ID = "1530325162560458752";

      if (!memberRoles.includes(LOCK_ALLOWED_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const channelId = body.channel_id;
      const EVERYONE_ROLE_ID = GUILD_ID; // @everyone role ID is always the guild ID

      try {
        if (commandName === "lock") {
          await setChannelSendPermission(channelId, EVERYONE_ROLE_ID, "deny");
          await setChannelSendPermission(channelId, LOCK_ALLOWED_ROLE_ID, "allow");
        } else {
          await setChannelSendPermission(channelId, EVERYONE_ROLE_ID, "neutral");
          await setChannelSendPermission(channelId, LOCK_ALLOWED_ROLE_ID, "neutral");
        }
      } catch (err) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: `Something went wrong updating this channel's permissions:\n\`\`\`${String(err).slice(0, 1800)}\`\`\``, flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: commandName === "lock" ? "\uD83D\uDD12 Channel locked." : "\uD83D\uDD13 Channel unlocked.",
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "tc") {
      const TC_ALLOWED_ROLE_ID = "1517739789816828024";

      if (!memberRoles.includes(TC_ALLOWED_ROLE_ID)) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "You don't have permission to use this command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content:
              "**A General Staff inside of CSO activated a Topic Change failure to change topic will result in moderation.**",
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "blacklist") {
      const sub = body.data.options?.[0];
      const subName = sub?.name;
      const subOpts = sub?.options ?? [];
      const getSub = (name: string) => subOpts.find((o: any) => o.name === name)?.value;

      if (subName === "issue") {
        if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
          return new Response(
            JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        const targetUserId: string = getSub("member");
        const reason: string = getSub("reason");
        const applicationId = body.application_id;
        const interactionToken = body.token;

        const task = (async () => {
          // If they're currently a member, strip their roles now (keeping only
          // the same investigation-safe list) and apply the blacklist role.
          const memberRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`);
          if (memberRes.ok) {
            const targetMemberData = await memberRes.json();
            const targetRoles: string[] = targetMemberData.roles || [];
            const keptRoles = targetRoles.filter((r) => INVESTIGATION_KEEP_ROLE_IDS.includes(r));
            const newRoles = Array.from(new Set([...keptRoles, BLACKLIST_ROLE_ID]));
            await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`, {
              method: "PATCH",
              body: JSON.stringify({ roles: newRoles }),
            });
          }
          // If they've already left, this same case row is what the bot's
          // gateway listener checks on rejoin to re-apply the blacklist role.

          const { data: inserted } = await supabase
            .from("cases")
            .insert({
              guild_id: GUILD_ID,
              user_id: targetUserId,
              moderator_id: discordUserId,
              reason,
              status: "active",
              punishment_type: "Blacklist",
              appealable: false,
            })
            .select()
            .single();

          await discordApi(`/channels/${BLACKLIST_LOG_CHANNEL_ID}/messages`, {
            method: "POST",
            body: JSON.stringify({
              content:
                `||<@${targetUserId}>||\n**Case #${inserted?.id ?? "?"} \u2013 <@${targetUserId}> has been blacklisted.**\n` +
                `**Reason:** ${reason}\n**Blacklisted By:** <@${discordUserId}>`,
            }),
          });

          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: `<@${targetUserId}> has been blacklisted.${inserted ? ` Case #${inserted.id} logged.` : ""}`,
          });
        })();

        EdgeRuntime.waitUntil(task);
        return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subName === "appeal") {
        if (!memberRoles.includes(BLACKLIST_ROLE_ID)) {
          return new Response(
            JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        const reason: string = getSub("reason");

        const { data: caseRow } = await supabase
          .from("cases")
          .select("*")
          .eq("user_id", discordUserId)
          .eq("guild_id", GUILD_ID)
          .eq("punishment_type", "Blacklist")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!caseRow) {
          return new Response(
            JSON.stringify({ type: 4, data: { content: "You don't have an active blacklist to appeal.", flags: 64 } }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (caseRow.appeal_status === "pending") {
          return new Response(
            JSON.stringify({ type: 4, data: { content: "You already have a pending blacklist appeal.", flags: 64 } }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        await supabase.from("cases").update({ appeal_status: "pending", appeal_reason: reason }).eq("id", caseRow.id);

        const memberUsername = body.member?.user?.username ?? "member";
        const channelId = await createAppealTicketChannel(discordApi, GUILD_ID, discordUserId!, memberUsername, caseRow.id);
        if (channelId) {
          await supabase.from("cases").update({ ticket_channel_id: channelId }).eq("id", caseRow.id);
        }

        const appealEmbed: any = {
          title: `\uD83D\uDCCB Blacklist Appeal \u2014 Case #${caseRow.id}`,
          color: 0xe67e22,
          thumbnail: { url: CSO_LOGO_URL },
          fields: [
            { name: "\uD83D\uDC64 Member", value: `<@${discordUserId}>`, inline: false },
            { name: "\u2696\uFE0F Blacklist Reason", value: caseRow.reason, inline: false },
            { name: "\uD83D\uDCDD Appeal Reason", value: reason, inline: false },
          ],
          footer: { text: caseFooterShort(caseRow.id) },
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
                    { type: 2, style: 3, label: "Approve", custom_id: `appealreview_approve:${caseRow.id}` },
                    { type: 2, style: 4, label: "Deny", custom_id: `appealreview_deny:${caseRow.id}` },
                  ],
                },
              ],
            }),
          });

          return new Response(
            JSON.stringify({ type: 4, data: { content: `Your blacklist appeal ticket has been created: <#${channelId}>`, flags: 64 } }),
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

      return new Response("Unknown subcommand", { status: 400 });
    }

    if (commandName === "force_end_shift") {
      if (!memberRoles.includes(MOD_ACTION_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const targetUserId: string = body.data.options?.find((o: any) => o.name === "member")?.value;
      const result = await endShiftForDiscordUser(supabase, targetUserId, BOT_TOKEN, GUILD_ID);

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: result.error
              ? `Couldn't force-end that shift: ${result.error}`
              : `Force-ended <@${targetUserId}>'s shift.`,
            flags: 64,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

if (commandName === "claim") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("channel_id", body.channel_id)
        .eq("status", "open")
        .maybeSingle();
      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This isn't an open ticket channel.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      await supabase.from("tickets").update({ claimed_by: discordUserId }).eq("id", ticket.id);
      return new Response(
        JSON.stringify({ type: 4, data: { content: `<@${discordUserId}> has claimed this ticket.` } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "unclaim") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("channel_id", body.channel_id)
        .eq("status", "open")
        .maybeSingle();
      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This isn't an open ticket channel.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      await supabase.from("tickets").update({ claimed_by: null }).eq("id", ticket.id);
      return new Response(
        JSON.stringify({ type: 4, data: { content: `<@${discordUserId}> has unclaimed this ticket.` } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "close") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const reasonOpt: string | undefined = body.data.options?.find((o: any) => o.name === "reason")?.value;

      const task = (async () => {
        const result = await closeTicket(discordApi, supabase, BOT_TOKEN, body.channel_id, discordUserId!, reasonOpt);
        if (!result.ok) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: result.error ?? "Couldn't close this ticket.",
          });
        }
      })();

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

    if (commandName === "rename") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id")
        .eq("channel_id", body.channel_id)
        .eq("status", "open")
        .maybeSingle();
      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This isn't an open ticket channel.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const newName: string = body.data.options?.find((o: any) => o.name === "name")?.value;
      const safeName = newName.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90) || "ticket";
      const renameRes = await discordApi(`/channels/${body.channel_id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: safeName }),
      });
      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: renameRes.ok ? `Channel renamed to \`${safeName}\`.` : "Couldn't rename this channel — check my permissions." },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "add") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id")
        .eq("channel_id", body.channel_id)
        .eq("status", "open")
        .maybeSingle();
      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This isn't an open ticket channel.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const addUserId: string = body.data.options?.find((o: any) => o.name === "member")?.value;
      const VIEW_CHANNEL = 1024n;
      const SEND_MESSAGES = 2048n;
      const addRes = await discordApi(`/channels/${body.channel_id}/permissions/${addUserId}`, {
        method: "PUT",
        body: JSON.stringify({ type: 1, allow: (VIEW_CHANNEL | SEND_MESSAGES).toString() }),
      });
      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: addRes.ok ? `<@${addUserId}> has been added to this ticket.` : "Couldn't add that member — check my permissions." },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "remove") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id")
        .eq("channel_id", body.channel_id)
        .eq("status", "open")
        .maybeSingle();
      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This isn't an open ticket channel.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const removeUserId: string = body.data.options?.find((o: any) => o.name === "member")?.value;
      const removeRes = await discordApi(`/channels/${body.channel_id}/permissions/${removeUserId}`, {
        method: "DELETE",
      });
      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: removeRes.ok ? `<@${removeUserId}> has been removed from this ticket.` : "Couldn't remove that member — check my permissions." },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (commandName === "transfer") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id")
        .eq("channel_id", body.channel_id)
        .eq("status", "open")
        .maybeSingle();
      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This isn't an open ticket channel.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const transferToId: string = body.data.options?.find((o: any) => o.name === "member")?.value;
      await supabase.from("tickets").update({ claimed_by: transferToId }).eq("id", ticket.id);
      return new Response(
        JSON.stringify({ type: 4, data: { content: `This ticket has been transferred to <@${transferToId}>.` } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
if (commandName === "close_request") {
      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You need the Moderate Members permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("channel_id", body.channel_id)
        .eq("status", "open")
        .maybeSingle();

      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This isn't an open ticket channel.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const reasonOpt: string | undefined = body.data.options?.find((o: any) => o.name === "reason")?.value;
      await supabase.from("tickets").update({ pending_close_reason: reasonOpt ?? null }).eq("id", ticket.id);

      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: `<@${ticket.opener_id}>, staff would like to close this ticket. Do you confirm?`,
            components: [
              {
                type: 1,
                components: [
                  { type: 2, style: 3, label: "Confirm Close", custom_id: `close_request_confirm:${ticket.id}` },
                  { type: 2, style: 2, label: "Cancel", custom_id: `close_request_cancel:${ticket.id}` },
                ],
              },
            ],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
if (commandName === "ticket_panel") {
      const TICKET_PANEL_ALLOWED_ROLE_ID = "1462490090914709548";
      if (!memberRoles.includes(TICKET_PANEL_ALLOWED_ROLE_ID)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to use this command.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const panelEmbed = {
        title: "Comet Strategic Operations Support Panel",
        color: 0xffffff,
        thumbnail: { url: CSO_LOGO_URL },
        description:
          "Welcome to the Comet Strategic Operations Support Channel!\n\n" +
          "Here, you're allowed to pick from the three support channels we provide to you! You may choose your support based of the description of each ticket. Please consider the following:\n\n" +
          "**CSO Management Support:**\n" +
          "\u2022 Important Questions (Liveries, Discord, Server)\n" +
          "\u2022 Serious Requests\n" +
          "\u2022 High Ranking Reports\n\n" +
          "**CSO Report Ticket:**\n" +
          "\u2022 Reporting a CSO member\n\n" +
          "**CSO Inquiry Support:**\n" +
          "\u2022 Questions regarding the Department\n" +
          "\u2022 Questions regarding ranks\n" +
          "\u2022 Help regarding Channels, Roles, or Application Access\n\n" +
          "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n" +
          "We thank you for following our Support Channel Guidelines and rules. Please don't hesitate to contact us when need!",
      };

      const panelComponents = [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: "CSO Management", custom_id: "ticket_open_management" },
            { type: 2, style: 4, label: "Report Ticket", custom_id: "ticket_open_report" },
            { type: 2, style: 2, label: "Inquiry Support", custom_id: "ticket_open_inquiry" },
          ],
        },
      ];

      const TICKET_PANEL_CHANNEL_ID = "1462488704579797126";
      const panelPostRes = await discordApi(`/channels/${TICKET_PANEL_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify({ embeds: [panelEmbed], components: panelComponents }),
      });

      return new Response(
        JSON.stringify({
          type: 4,
          data: panelPostRes.ok
            ? { content: `Panel posted in <#${TICKET_PANEL_CHANNEL_ID}>.`, flags: 64 }
            : { content: "I couldn't post to that channel — check my permissions there.", flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("Unknown command", { status: 400 });
  }

  // ---------- Button clicks / select menus ----------
  if (body.type === 3) {
    const customId: string = body.data.custom_id;

    // --- Ticket system: open a new ticket ---
if (customId.startsWith("ticket_open_")) {
  const category = customId.replace("ticket_open_", "");
  const cfg = TICKET_CATEGORIES[category];
  if (!cfg) {
    return new Response(
      JSON.stringify({ type: 4, data: { content: "Unknown ticket category.", flags: 64 } }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const modalComponents =
    category === "report"
      ? [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "report_target",
                style: 1,
                label: "Who are you reporting?",
                placeholder: "Username or @mention",
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
                custom_id: "reason",
                style: 2,
                label: "Why are you reporting them?",
                placeholder: "Describe what happened",
                required: true,
                max_length: 1000,
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "has_proof",
                style: 1,
                label: "Do you have proof? (Yes/No)",
                placeholder: "Yes or No",
                required: true,
                max_length: 3,
              },
            ],
          },
        ]
      : [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "reason",
                style: 2,
                label: "Why are you opening this ticket?",
                required: true,
                max_length: 1000,
              },
            ],
          },
        ];

  return new Response(
    JSON.stringify({
      type: 9,
      data: {
        custom_id: `ticket_open_modal:${category}`,
        title: `Open ${cfg.label} Ticket`,
        components: modalComponents,
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
    if (customId.startsWith("close_request_confirm:") || customId.startsWith("close_request_cancel:")) {
      const ticketId = customId.split(":")[1];
      const confirmed = customId.startsWith("close_request_confirm:");

      const { data: ticket } = await supabase.from("tickets").select("*").eq("id", ticketId).maybeSingle();
      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This ticket no longer exists.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const isOpener = discordUserId === ticket.opener_id;
      const isStaff = hasModeratePermission(body.member?.permissions);
      if (!isOpener && !isStaff) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "Only the ticket opener or staff can respond to this.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (!confirmed) {
        return new Response(
          JSON.stringify({ type: 7, data: { content: "Close request cancelled.", components: [] } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const applicationId = body.application_id;
      const interactionToken = body.token;

      const task = (async () => {
        const result = await closeTicket(
          discordApi, supabase, BOT_TOKEN, ticket.channel_id, discordUserId!, ticket.pending_close_reason ?? undefined,
        );
        if (!result.ok) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: result.error ?? "Something went wrong closing this ticket.",
          });
        }
      })();

      // @ts-ignore - EdgeRuntime is provided by the Supabase Edge Functions runtime
      if (typeof EdgeRuntime !== "undefined") {
        // @ts-ignore
        EdgeRuntime.waitUntil(task);
      } else {
        await task;
      }

      return new Response(JSON.stringify({ type: 6 }), { headers: { "Content-Type": "application/json" } });
    }
// --- Ticket system: claim ---
    if (customId === "ticket_claim") {
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("channel_id", body.channel_id)
        .eq("status", "open")
        .maybeSingle();

      if (!ticket) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "This isn't an open ticket channel.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const cfg = TICKET_CATEGORIES[ticket.category];
      if (!cfg || !cfg.roleIds.some((r) => memberRoles.includes(r))) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to claim this ticket.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      await supabase.from("tickets").update({ claimed_by: discordUserId }).eq("id", ticket.id);

      const existingEmbed = body.message?.embeds?.[0] ?? {};
      const updatedEmbed = { ...existingEmbed, footer: { text: `Claimed by ${reviewerName}` } };

      const existingComponents = body.message?.components ?? [];
      const updatedComponents = existingComponents.map((row: any) => ({
        ...row,
        components: row.components.map((c: any) =>
          c.custom_id === "ticket_claim" ? { ...c, disabled: true } : c,
        ),
      }));

      return new Response(
        JSON.stringify({
          type: 7,
          data: { embeds: [updatedEmbed], components: updatedComponents },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

   // --- Ticket system: edit close reason ---
    if (customId.startsWith("ticket_edit_reason:")) {
      const ticketId = customId.split(":")[1];

      if (!hasModeratePermission(body.member?.permissions)) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to edit this.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          type: 9,
          data: {
            custom_id: `ticket_edit_reason_modal:${ticketId}`,
            title: "Edit Close Reason",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "reason",
                    style: 2,
                    label: "New reason",
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
 // --- Ticket system: close (no reason) ---
    if (customId === "ticket_close") {
      const applicationId = body.application_id;
      const interactionToken = body.token;
      const channelId = body.channel_id;
      const closedBy = discordUserId!;

      const task = (async () => {
        const result = await closeTicket(discordApi, supabase, BOT_TOKEN, channelId, closedBy);
        if (!result.ok) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: result.error ?? "Something went wrong closing this ticket.",
          });
        }
      })();

      EdgeRuntime.waitUntil(task);
      return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Ticket system: close with reason (opens a modal) ---
    if (customId === "ticket_close_reason") {
      return new Response(
        JSON.stringify({
          type: 9,
          data: {
            custom_id: `ticket_close_reason_modal:${body.channel_id}`,
            title: "Close Ticket",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "reason",
                    style: 2,
                    label: "Reason for closing",
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

    // --- Training finished: apply roles to who passed ---
    if (customId === "training_passed_role_select") {
      const selectedUserIds: string[] = body.data.values || [];
      const resolvedMembers = body.data.resolved?.members || {};

      const PASSED_ROLES_TO_ADD = [
        "1462492552396541972",
        "1504249548493820025",
        "1467667651433070655",
        "1462500854253883455",
      ];
      const PASSED_ROLE_TO_REMOVE = "1467421508803629129";

      for (const uid of selectedUserIds) {
        const currentRoles: string[] = resolvedMembers[uid]?.roles || [];
        const newRoles = Array.from(
          new Set(currentRoles.filter((r) => r !== PASSED_ROLE_TO_REMOVE).concat(PASSED_ROLES_TO_ADD)),
        );
        try {
          await discordApi(`/guilds/${GUILD_ID}/members/${uid}`, {
            method: "PATCH",
            body: JSON.stringify({ roles: newRoles }),
          });
        } catch {
          // best-effort
        }
      }

      return new Response(
        JSON.stringify({
          type: 7, // UPDATE_MESSAGE
          data: {
            content: `Updated roles for: ${selectedUserIds.map((id) => `<@${id}>`).join(", ") || "(no one selected)"}`,
            components: [],
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Fastpass: accept button ---
    if (customId.startsWith("fastpass_agree_")) {
      const targetId = customId.replace("fastpass_agree_", "");
      const clickerId = body.member?.user?.id;

      if (clickerId !== targetId) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "This isn't your fast pass ticket to accept.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const currentNick =
        body.member.nick || body.member.user.global_name || body.member.user.username;
      const newNick = `[TR] ${currentNick}`.slice(0, 32);

      const FASTPASS_ROLES_TO_REMOVE = [
        "1462501077860483072",
        "1467674380023894111",
        "1490150469778280578",
      ];
      const FASTPASS_ROLES_TO_ADD = ["1467421508803629129", "1467667392669810783"];

      const currentRoles: string[] = body.member.roles || [];
      const newRoles = Array.from(
        new Set(
          currentRoles
            .filter((r) => !FASTPASS_ROLES_TO_REMOVE.includes(r))
            .concat(FASTPASS_ROLES_TO_ADD),
        ),
      );

      try {
        await discordApi(`/guilds/${GUILD_ID}/members/${targetId}`, {
          method: "PATCH",
          body: JSON.stringify({ nick: newNick, roles: newRoles }),
        });
      } catch {
        // best-effort
      }

      const updatedEmbed = {
        ...body.message.embeds[0],
        footer: { text: "\u2705 Terms accepted" },
      };

      return new Response(
        JSON.stringify({
          type: 7,
          data: { embeds: [updatedEmbed], components: [] },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

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

      return new Response(
        JSON.stringify({
          type: 9,
          data: {
            custom_id: `${accept ? "app_accept_modal" : "app_deny_modal"}:${submissionId}`,
            title: accept ? "Accept Application" : "Deny Application",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "reason",
                    style: 2,
                    label: "Notes / reason",
                    placeholder: accept
                      ? "Overall you seem like a promising candidate! Welcome..."
                      : "Explain why this application is being denied...",
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

    // --- Role backup: Restore Roles button (from CSO Management 2.0's leave log) ---
    if (customId.startsWith("restore_roles_")) {
      const targetUserId = customId.replace("restore_roles_", "");

      const MANAGE_ROLES_BIT = 1n << 28n;
      const perms = BigInt(body.member?.permissions ?? "0");
      if ((perms & MANAGE_ROLES_BIT) === 0n && (perms & PERMISSION_ADMINISTRATOR) === 0n) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to restore roles.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const { data: record } = await supabase
        .from("role_backups")
        .select("*")
        .eq("guild_id", GUILD_ID)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (!record) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "No saved roles found for that user.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const memberRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`);
      if (!memberRes.ok) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "That user is not currently in the server, so their roles can't be restored yet. They need to rejoin first.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      const memberData = await memberRes.json();

      const rolesRes = await discordApi(`/guilds/${GUILD_ID}/roles`);
      const rolesList = rolesRes.ok ? await rolesRes.json() : [];
      const rolePositionById: Record<string, number> = {};
      for (const r of rolesList) rolePositionById[r.id] = r.position;

      const selfRes = await discordApi(`/users/@me`);
const selfData = selfRes.ok ? await selfRes.json() : null;
const meRes = selfData ? await discordApi(`/guilds/${GUILD_ID}/members/${selfData.id}`) : null;
const meData = meRes && meRes.ok ? await meRes.json() : null;
const botTopPos = topRolePosition(meData?.roles ?? [], rolePositionById);

      const savedRoleIds: string[] = record.roles ?? [];
      const assignable = savedRoleIds.filter(
        (id) => rolePositionById[id] !== undefined && rolePositionById[id] < botTopPos,
      );
      const skipped = savedRoleIds.length - assignable.length;

      const currentRoles: string[] = memberData.roles ?? [];
      const newRoles = Array.from(new Set([...currentRoles, ...assignable]));

      const updateRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`, {
        method: "PATCH",
        body: JSON.stringify({ roles: newRoles }),
      });

      if (!updateRes.ok) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "Something went wrong restoring roles.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      let msg = `Restored ${assignable.length} role(s) to ${record.username ?? "that member"}.`;
      if (skipped > 0) msg += ` (${skipped} role(s) skipped \u2014 deleted or above the bot's own role.)`;

      return new Response(
        JSON.stringify({ type: 4, data: { content: msg, flags: 64 } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Role backup: per-role undo button (from the live role change log) ---
    if (customId.startsWith("roleundo_")) {
      const [, action, targetUserId, roleId] = customId.split("_");

      const MANAGE_ROLES_BIT = 1n << 28n;
      const perms = BigInt(body.member?.permissions ?? "0");
      if ((perms & MANAGE_ROLES_BIT) === 0n && (perms & PERMISSION_ADMINISTRATOR) === 0n) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "You don't have permission to do that.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const memberRes = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}`);
      if (!memberRes.ok) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "That user is no longer in the server.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const rolesRes = await discordApi(`/guilds/${GUILD_ID}/roles`);
      const rolesList = rolesRes.ok ? await rolesRes.json() : [];
      const roleInfo = rolesList.find((r: any) => r.id === roleId);
      if (!roleInfo) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "That role no longer exists.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const rolePositionById: Record<string, number> = {};
      for (const r of rolesList) rolePositionById[r.id] = r.position;
     const selfRes = await discordApi(`/users/@me`);
const selfData = selfRes.ok ? await selfRes.json() : null;
const meRes = selfData ? await discordApi(`/guilds/${GUILD_ID}/members/${selfData.id}`) : null;
const meData = meRes && meRes.ok ? await meRes.json() : null;
const botTopPos = topRolePosition(meData?.roles ?? [], rolePositionById);

      if (roleInfo.position >= botTopPos) {
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "I can't manage that role \u2014 it's positioned above my own highest role.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const method = action === "restore" ? "PUT" : "DELETE";
      const res = await discordApi(`/guilds/${GUILD_ID}/members/${targetUserId}/roles/${roleId}`, { method });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ type: 4, data: { content: "Something went wrong \u2014 check my role permissions.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const verb = action === "restore" ? "Restored" : "Revoked";
      const prep = action === "restore" ? "to" : "from";
      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: `${verb} **${roleInfo.name}** ${prep} <@${targetUserId}>.`, flags: 64 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --- LOA approve/deny flow ---
    if (customId.startsWith("loa_approve:") || customId.startsWith("loa_deny:")) {
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
        // ...unchanged, existing modal-open code goes here
      }

      if (action === "loa_approve") {
        // ...unchanged, existing modal-open code goes here
      }
    }

    return new Response("Unknown action", { status: 400 });
  }

  // ---------- Modal submissions ----------
  if (body.type === 5) {
    const customId: string = body.data.custom_id;

    // --- Ticket system: open (modal submit) ---
    if (customId.startsWith("ticket_open_modal:")) {
  const category = customId.split(":")[1];
  const cfg = TICKET_CATEGORIES[category];
  if (!cfg) {
    return new Response(
      JSON.stringify({ type: 4, data: { content: "Unknown ticket category.", flags: 64 } }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const fields = body.data.components.flatMap((row: any) => row.components);
  const reason = fields.find((f: any) => f.custom_id === "reason")?.value ?? "";
  const reportTarget = fields.find((f: any) => f.custom_id === "report_target")?.value ?? "";
  const hasProof = fields.find((f: any) => f.custom_id === "has_proof")?.value ?? "";

  const applicationId = body.application_id;
  const interactionToken = body.token;
  const openerId = discordUserId!;
  const openerUsername = body.member?.user?.username ?? "member";

  const task = (async () => {
    const { data: existing } = await supabase
      .from("tickets")
      .select("channel_id")
      .eq("opener_id", openerId)
      .eq("category", category)
      .eq("status", "open")
      .maybeSingle();

    if (existing) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: `You already have an open ${cfg.label} ticket: <#${existing.channel_id}>`,
      });
      return;
    }

    const MAX_OPEN_TICKETS_PER_USER = 5;
    const { count: openTicketCount } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("opener_id", openerId)
      .eq("status", "open");

    if ((openTicketCount ?? 0) >= MAX_OPEN_TICKETS_PER_USER) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: `You already have ${openTicketCount} open tickets, which is the maximum of ${MAX_OPEN_TICKETS_PER_USER}. Please close an existing ticket before opening a new one.`,
      });
      return;
    }

    const VIEW_CHANNEL = 1024n;
    const SEND_MESSAGES = 2048n;
    const permissionOverwrites = [
      { id: GUILD_ID, type: 0, deny: VIEW_CHANNEL.toString() },
      { id: openerId, type: 1, allow: (VIEW_CHANNEL | SEND_MESSAGES).toString() },
      ...cfg.roleIds.map((r) => ({ id: r, type: 0, allow: (VIEW_CHANNEL | SEND_MESSAGES).toString() })),
      { id: TICKET_PING_EXTRA_ROLE_ID, type: 0, allow: (VIEW_CHANNEL | SEND_MESSAGES).toString() },
    ];

   const { data: ticketRow, error: ticketInsertErr } = await supabase
      .from("tickets")
      .insert({
        guild_id: GUILD_ID,
        category,
        opener_id: openerId,
        status: "open",
      })
      .select()
      .single();

    if (ticketInsertErr || !ticketRow) {
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: "Something went wrong creating your ticket. Please contact staff directly.",
      });
      return;
    }

    const categoryChannelId = await findOrCreateTicketCategory(
      discordApi, GUILD_ID, cfg.categoryName, [...cfg.roleIds, TICKET_PING_EXTRA_ROLE_ID],
    );

    const createRes = await discordApi(`/guilds/${GUILD_ID}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name: `${openerUsername}-${ticketRow.id}`.slice(0, 90),
        type: 0,
        parent_id: categoryChannelId ?? undefined,
        permission_overwrites: permissionOverwrites,
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      console.error("Ticket channel creation failed:", createRes.status, errBody);
      await supabase.from("tickets").delete().eq("id", ticketRow.id);
      await editOriginalInteractionResponse(applicationId, interactionToken, {
        content: "Something went wrong creating your ticket channel. Please contact staff directly.",
      });
      return;
    }

    const newChannel = await createRes.json();

    await supabase.from("tickets").update({ channel_id: newChannel.id }).eq("id", ticketRow.id);

   // Ping the category's staff roles plus the standing ping role, via
    // hidden/spoilered small text, same pattern as the previous ticket bot used.
    const pingRoleIds = [...cfg.roleIds, TICKET_PING_EXTRA_ROLE_ID];
    await discordApi(`/channels/${newChannel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: `-# ${pingRoleIds.map((r) => `||<@&${r}>||`).join("")}`,
        allowed_mentions: { roles: pingRoleIds },
      }),
    });

    const embedFields =
      category === "report"
        ? [
            { name: "Reporting", value: reportTarget || "N/A" },
            { name: "Reason", value: reason },
            { name: "Proof Provided", value: hasProof || "N/A" },
          ]
        : [{ name: "Reason", value: reason }];

    const welcomeEmbed = {
      color: cfg.color,
      description:
        `${cfg.welcomeIntro} While waiting for their assistance, please state your question below.\n\n` +
        "- Please do NOT ping staff roles or members while waiting.\n" +
        "- If you don't respond to a ticket in 12 hours, your ticket will be closed.\n" +
        "- If there is no response after 12 hours, you may ping the Grand Commander, or Assistang Grand.\n\n" +
        `Once again, we thank you for contacting ${cfg.label}!`,
      fields: embedFields,
    };

    const ticketComponents = [
      {
        type: 1,
        components: [
          { type: 2, style: 4, label: "Close", emoji: { name: "\uD83D\uDD12" }, custom_id: "ticket_close" },
          { type: 2, style: 4, label: "Close With Reason", emoji: { name: "\uD83D\uDD12" }, custom_id: "ticket_close_reason" },
          { type: 2, style: 3, label: "Claim", emoji: { name: "\uD83D\uDC8E" }, custom_id: "ticket_claim" },
        ],
      },
    ];

    await discordApi(`/channels/${newChannel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ embeds: [welcomeEmbed], components: ticketComponents }),
    });

    await editOriginalInteractionResponse(applicationId, interactionToken, {
      content: `Your ticket has been created: <#${newChannel.id}>`,
    });
  })();

  EdgeRuntime.waitUntil(task);
  return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
    headers: { "Content-Type": "application/json" },
  });
}

    // --- Ticket system: close with reason (modal submit) ---
    if (customId.startsWith("ticket_close_reason_modal:")) {
      const channelId = customId.split(":")[1];
      const fields = body.data.components.flatMap((row: any) => row.components);
      const reason = fields.find((f: any) => f.custom_id === "reason")?.value ?? "";

      const applicationId = body.application_id;
      const interactionToken = body.token;
      const closedBy = discordUserId!;

      const task = (async () => {
        const result = await closeTicket(discordApi, supabase, BOT_TOKEN, channelId, closedBy, reason);
        if (!result.ok) {
          await editOriginalInteractionResponse(applicationId, interactionToken, {
            content: result.error ?? "Something went wrong closing this ticket.",
          });
        }
      })();

      EdgeRuntime.waitUntil(task);
      return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }
   // --- Ticket system: edit close reason (modal submit) ---
    if (customId.startsWith("ticket_edit_reason_modal:")) {
      const ticketId = customId.split(":")[1];
      const newReason = getComponentValue(body.data.components ?? [], "reason");

      await supabase.from("tickets").update({ close_reason: newReason }).eq("id", ticketId);

      const existingEmbed = body.message?.embeds?.[0] ?? {};
      const updatedFields = (existingEmbed.fields ?? []).map((f: any) =>
        f.name?.includes("Reason") ? { ...f, value: newReason } : f,
      );

      return new Response(
        JSON.stringify({
          type: 7,
          data: { embeds: [{ ...existingEmbed, fields: updatedFields }] },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
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

    // --- Application accept/deny modal (reason + full Q&A reproduced in log + DM) ---
    if (customId.startsWith("app_accept_modal:") || customId.startsWith("app_deny_modal:")) {
      const accept = customId.startsWith("app_accept_modal:");
      const submissionId = customId.split(":")[1];
      const reason = getComponentValue(body.data.components ?? [], "reason");

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
          const memberRes = await discordApi(
            `/guilds/${GUILD_ID}/members/${submissionRow.discord_user_id}`,
            { method: "GET" },
          );
          const memberData = memberRes.ok ? await memberRes.json() : null;
          const currentName =
            memberData?.nick?.trim() ||
            memberData?.user?.global_name?.trim() ||
            memberData?.user?.username?.trim() ||
            submissionRow.discord_username?.trim() ||
            "Member";
          const newNickname = `${APPLICATION_ACCEPT_NICKNAME_PREFIX} ${currentName}`.slice(0, 32);
          await discordApi(
            `/guilds/${GUILD_ID}/members/${submissionRow.discord_user_id}`,
            { method: "PATCH", body: JSON.stringify({ nick: newNickname }) },
          );
        } catch {
          // best-effort — bot may lack permission to nickname this member
          // (e.g. they outrank the bot, or they're the server owner)
        }
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

      // Pull this submission's actual questions/answers so the log + DM reproduce
      // the real application instead of a generic summary.
      const { data: answerRows } = await supabase
        .from("application_answers")
        .select("*")
        .eq("submission_id", submissionId)
        .order("id", { ascending: true });

      const qaFields = (answerRows ?? []).map((a: any) => ({
        name: (a.question_text ?? "Question").slice(0, 256),
        value: (a.answer_text?.trim() || "*No answer provided*").slice(0, 1024),
        inline: false,
      }));

      const decisionContent = accept
        ? `\u2705 <@${submissionRow.discord_user_id}>'s submission has been accepted successfully by <@${discordUserId}> with reason:`
        : `\u274C <@${submissionRow.discord_user_id}>'s submission has been denied by <@${discordUserId}> with reason:`;

      const notesEmbed = { description: `**Notes:** ${reason}` };

      const applicationEmbed = {
        title: `${submissionRow.discord_username}'s 'CSO Application' Application Submitted`,
        color: accept ? 0x22c55e : 0xed4245,
        fields: qaFields,
        footer: { text: `Submission ID: ${submissionRow.id}` },
      };

      const resultPayload = { content: decisionContent, embeds: [notesEmbed, applicationEmbed] };

      await discordApi(`/channels/${APPLICATION_LOG_CHANNEL_ID}/messages`, {
        method: "POST",
        body: JSON.stringify(resultPayload),
      });

      try {
        await sendDM(submissionRow.discord_user_id, resultPayload);
      } catch {
        // best-effort
      }

      const disabledComponents = (body.message?.components ?? []).map((row: any) => ({
        ...row,
        components: row.components.map((c: any) => ({ ...c, disabled: true })),
      }));

      return new Response(
        JSON.stringify({ type: 7, data: { components: disabledComponents } }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

   // --- LOA approve/deny modals ---
    if (customId.startsWith("loa_deny_modal:") || customId.startsWith("loa_approve_modal:")) {
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

    return new Response("Unknown modal action", { status: 400 });
  }

  return new Response("Unhandled interaction type", { status: 400 });
});;