import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// IMPORTANT: Discord's bulk command registration REPLACES the entire guild command list
// with whatever is in this file's `commands` array. This file must always include every
// guild-scoped slash command your bot has (shift, feedback, reaction_role, punish, and any
// future ones) — never run a registration script that only lists a subset, or it will
// silently delete the commands that were left out.

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
          { type: 11, name: "proof", description: "Optional proof (screenshot/image/file)", required: false },
          { type: 3, name: "text_proof", description: "Optional text proof/evidence", required: false },
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
