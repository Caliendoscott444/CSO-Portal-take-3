import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// IMPORTANT: Discord's bulk command registration REPLACES the entire guild command list
// with whatever is in this file's `commands` array. This file must always include every
// guild-scoped slash command your bot has (shift, feedback, apply, loa, reaction_role,
// amendment, revoke, edit_punishment, appeal, close_appeal_ticket, end_investigation,
// view_cases, warn, kick, ban, unban, timeout, cases, edit_case, remove_case,
// chain_of_command, punish, suggestions, personnel_suggestions, report, management_ticket,
// inquiry_ticket, close_ticket, and any future ones) —
// never run a registration script that only lists a subset, or it will silently delete
// the commands that were left out.

Deno.serve(async (_req) => {
  try {
    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
    const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID")!;

    const appRes = await fetch("https://discord.com/api/v10/oauth2/applications/@me", {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!appRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch application", detail: await appRes.text() }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const app = await appRes.json();
    const appId = app.id;

    const commands = [
      {
        name: "shift",
        description: "Manage or view shift information",
        options: [
          { type: 1, name: "manage", description: "View your shift status and start or end a shift" },
          { type: 1, name: "leaderboard", description: "View the shift leaderboard for the current wave" },
        ],
      },
      {
        name: "feedback",
        description: "Leave feedback for a staff member",
        options: [
          { type: 6, name: "staff", description: "Which staff member is this feedback about?", required: true },
        ],
      },
      {
        name: "apply",
        description: "Start a CSO application",
      },
      {
        name: "loa",
        description: "Submit a Leave of Absence request",
        options: [
          { type: 3, name: "start_date", description: "Start date (YYYY-MM-DD)", required: true },
          { type: 3, name: "end_date", description: "End date (YYYY-MM-DD)", required: true },
          { type: 6, name: "commander", description: "Which commander is this request for?", required: true },
          { type: 3, name: "reason", description: "Why are you requesting leave?", required: true },
        ],
      },
      {
        name: "reaction_role",
        description: "Post a reaction-role menu (restricted role only)",
        options: [
          { type: 3, name: "title", description: "Embed title", required: true },
          { type: 8, name: "role1", description: "Role 1", required: true },
          { type: 3, name: "label1", description: "Label for role 1", required: true },
          { type: 3, name: "emoji1", description: "Emoji for role 1 (optional)", required: false },
          { type: 8, name: "role2", description: "Role 2 (optional)", required: false },
          { type: 3, name: "label2", description: "Label for role 2", required: false },
          { type: 3, name: "emoji2", description: "Emoji for role 2 (optional)", required: false },
          { type: 8, name: "role3", description: "Role 3 (optional)", required: false },
          { type: 3, name: "label3", description: "Label for role 3", required: false },
          { type: 3, name: "emoji3", description: "Emoji for role 3 (optional)", required: false },
          { type: 8, name: "role4", description: "Role 4 (optional)", required: false },
          { type: 3, name: "label4", description: "Label for role 4", required: false },
          { type: 3, name: "emoji4", description: "Emoji for role 4 (optional)", required: false },
          { type: 8, name: "role5", description: "Role 5 (optional)", required: false },
          { type: 3, name: "label5", description: "Label for role 5", required: false },
          { type: 3, name: "emoji5", description: "Emoji for role 5 (optional)", required: false },
        ],
      },
      {
        name: "amendment",
        description: "DM yourself the full text of all 27 Amendments to the U.S. Constitution",
      },
      {
        name: "revoke",
        description: "Forcefully revoke an active punishment",
        options: [
          { type: 4, name: "case_id", description: "The case ID to revoke", required: true },
          { type: 3, name: "reason", description: "Why this case is being revoked", required: false },
        ],
      },
      {
        name: "edit_punishment",
        description: "Edit an existing moderation case (record only \u2014 doesn't change roles/timeout)",
        options: [
          { type: 4, name: "case_id", description: "The case ID to edit", required: true },
          { type: 3, name: "reason", description: "New reason", required: false },
          {
            type: 3,
            name: "punishment_type",
            description: "New punishment type",
            required: false,
            choices: [
              { name: "Warning", value: "Warning" },
              { name: "Fire Warning", value: "Fire Warning" },
              { name: "Infraction", value: "Infraction" },
              { name: "Strike", value: "Strike" },
              { name: "Under Investigation", value: "Under Investigation" },
              { name: "Suspension", value: "Suspension" },
              { name: "Termination", value: "Termination" },
              { name: "Demotion", value: "Demotion" },
            ],
          },
          {
            type: 4,
            name: "duration_minutes",
            description: "New timeout length in minutes (only used for Suspension)",
            required: false,
            min_value: 1,
            max_value: 40320,
          },
          { type: 5, name: "appealable", description: "New appealable value", required: false },
          { type: 3, name: "start_date", description: "New suspension start date YYYY-MM-DD", required: false },
          { type: 3, name: "end_date", description: "New suspension end date YYYY-MM-DD", required: false },
        ],
      },
      {
        name: "appeal",
        description: "Appeal a moderation case against you",
        options: [
          { type: 4, name: "case_id", description: "The case ID you want to appeal", required: true },
          { type: 3, name: "reason", description: "Why you believe this should be reversed", required: true },
        ],
      },
      {
        name: "close_appeal_ticket",
        description: "Close the current appeal ticket and log it",
      },
      {
        name: "report",
        description: "Report a member to staff",
        options: [
          { type: 6, name: "member", description: "Who are you reporting?", required: true },
          { type: 3, name: "reason", description: "Why are you reporting them?", required: true },
          {
            type: 3,
            name: "proof",
            description: "Do you have proof?",
            required: true,
            choices: [
              { name: "Yes", value: "yes" },
              { name: "No", value: "no" },
            ],
          },
        ],
      },
      {
        name: "management_ticket",
        description: "Open a management ticket",
        options: [
          { type: 3, name: "reason", description: "Why are you opening this ticket?", required: true },
        ],
      },
      {
        name: "inquiry_ticket",
        description: "Open an inquiry / support ticket",
        options: [
          { type: 3, name: "reason", description: "Why are you opening this ticket?", required: true },
        ],
      },
      {
        name: "close_ticket",
        description: "Close the current report, management, or inquiry ticket and log it",
      },
      {
        name: "end_investigation",
        description: "End an active investigation and resolve the member's punishment",
        options: [
          { type: 6, name: "member", description: "The member whose investigation should be ended", required: true },
          {
            type: 3,
            name: "punishment",
            description: "What punishment will this member receive as a result of the investigation?",
            required: true,
            choices: [
              { name: "None", value: "None" },
              { name: "Suspension", value: "Suspension" },
              { name: "Termination", value: "Termination" },
            ],
          },
        ],
      },
      {
        name: "view_cases",
        description: "View a member's moderation cases (restricted role only)",
        options: [
          { type: 6, name: "member", description: "Whose cases do you want to view?", required: true },
        ],
      },
      {
        name: "warn",
        description: "Warn a member and DM them",
        options: [
          { type: 6, name: "member", description: "The member to warn", required: true },
          { type: 3, name: "reason", description: "Why this member is being warned", required: true },
        ],
      },
      {
        name: "kick",
        description: "Kick a member from the server",
        options: [
          { type: 6, name: "member", description: "The member to kick", required: true },
          { type: 3, name: "reason", description: "Why this member is being kicked", required: true },
        ],
      },
      {
        name: "ban",
        description: "Ban a member from the server",
        options: [
          { type: 6, name: "member", description: "The member to ban", required: true },
          { type: 3, name: "reason", description: "Why this member is being banned", required: true },
          {
            type: 4,
            name: "delete_message_days",
            description: "Days of their messages to delete (0-7, default 0)",
            required: false,
            min_value: 0,
            max_value: 7,
          },
        ],
      },
      {
        name: "unban",
        description: "Unban a member from the server",
        options: [
          { type: 6, name: "member", description: "The member to unban", required: true },
          { type: 3, name: "reason", description: "Why this member is being unbanned", required: false },
        ],
      },
      {
        name: "timeout",
        description: "Time out a member",
        options: [
          { type: 6, name: "member", description: "The member to time out", required: true },
          { type: 3, name: "reason", description: "Why this member is being timed out", required: true },
          {
            type: 4,
            name: "duration_minutes",
            description: "Timeout length in minutes",
            required: true,
            min_value: 1,
            max_value: 40320,
          },
        ],
      },
      {
        name: "cases",
        description: "View a member's warns, kicks, and bans (restricted role only)",
        options: [
          { type: 6, name: "member", description: "Whose cases do you want to view?", required: true },
        ],
      },
      {
        name: "edit_case",
        description: "Edit a warn/kick/ban/timeout case (record only \u2014 doesn't undo the action)",
        options: [
          { type: 4, name: "case_id", description: "The case ID to edit", required: true },
          { type: 3, name: "reason", description: "New reason", required: false },
          {
            type: 4,
            name: "duration_minutes",
            description: "New duration in minutes (only used for Timeout)",
            required: false,
            min_value: 1,
            max_value: 40320,
          },
        ],
      },
      {
        name: "remove_case",
        description: "Permanently delete a case record (doesn't undo any role/timeout/ban/kick)",
        options: [
          { type: 4, name: "case_id", description: "The case ID to remove", required: true },
        ],
      },
      {
        name: "chain_of_command",
        description: "Post the CSO chain of command",
      },
      {
        name: "punish",
        description: "Punish a member and log a moderation case",
        options: [
          { type: 6, name: "member", description: "The member to punish", required: true },
          {
            type: 3,
            name: "punishment_type",
            description: "The type of punishment to issue",
            required: true,
            choices: [
              { name: "Warning", value: "Warning" },
              { name: "Fire Warning", value: "Fire Warning" },
              { name: "Infraction", value: "Infraction" },
              { name: "Strike", value: "Strike" },
              { name: "Under Investigation", value: "Under Investigation" },
              { name: "Suspension", value: "Suspension" },
              { name: "Termination", value: "Termination" },
              { name: "Demotion", value: "Demotion" },
            ],
          },
          { type: 3, name: "reason", description: "Why this member is being punished", required: true },
          { type: 5, name: "appealable", description: "Whether the member is allowed to appeal this case", required: true },
          {
            type: 4,
            name: "duration_minutes",
            description: "Timeout length in minutes (only used for Suspension, default 60)",
            required: false,
            min_value: 1,
            max_value: 40320,
          },
          { type: 3, name: "start_date", description: "Suspension start date YYYY-MM-DD (only used for Suspension)", required: false },
          { type: 3, name: "end_date", description: "Suspension end date YYYY-MM-DD \u2014 role auto-removed after this date (only used for Suspension)", required: false },
          { type: 8, name: "demote_from_role", description: "Role to remove (only used for Demotion)", required: false },
          { type: 8, name: "demote_to_role", description: "Role to add (only used for Demotion)", required: false },
          { type: 11, name: "proof", description: "Optional proof (screenshot/image/file)", required: false },
          { type: 3, name: "text_proof", description: "Optional text proof/evidence", required: false },
        ],
      },
      {
        name: "suggestions",
        description: "Submit a suggestion",
      },
      {
        name: "personnel_suggestions",
        description: "Submit a personnel suggestion",
      },
      {
        name: "fastpass",
        description: "Send Comet Strategic Operations fast pass terms to a user",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "The user being fast passed",
            required: true,
          },
        ],
      },
      {
        name: "training_finished",
        description: "Log a completed training session",
        options: [
          { type: 3, name: "trainer_roblox", description: "Trainer's Roblox username", required: true },
          { type: 6, name: "trainer_discord", description: "The trainer (Discord user)", required: true },
          { type: 3, name: "time_started", description: "Exact time the training started", required: true },
          { type: 3, name: "time_finished", description: "Exact time the training finished", required: true },
          { type: 4, name: "attended_count", description: "How many people attended", required: true },
          { type: 3, name: "attended_names", description: "Names of everyone who attended", required: true },
          { type: 4, name: "passed_count", description: "How many people passed", required: true },
          { type: 3, name: "passed_names", description: "Names of everyone who passed", required: true },
          { type: 11, name: "starting_screenshot", description: "Screenshot from the start of the training", required: true },
          { type: 11, name: "ending_screenshot", description: "Screenshot from the end of the training", required: true },
          { type: 3, name: "notes", description: "Any additional notes", required: false },
          { type: 11, name: "proof", description: "Any additional proof (screenshot/image/file)", required: false },
        ],
      },
    ];

    const registerRes = await fetch(
      `https://discord.com/api/v10/applications/${appId}/guilds/${GUILD_ID}/commands`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commands),
      },
    );

    const registerBody = await registerRes.json();

    return new Response(
      JSON.stringify({ success: registerRes.ok, applicationId: appId, registered: registerBody }),
      { status: registerRes.ok ? 200 : 500, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});