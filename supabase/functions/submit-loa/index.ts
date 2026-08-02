import "jsr:@supabase/functions-js/edge-runtime.d.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const WEBHOOK_URL = Deno.env.get("LOA_WEBHOOK_URL");

    if (!WEBHOOK_URL) {
      return new Response(
        JSON.stringify({ error: "Missing LOA_WEBHOOK_URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { discordUsername, startDate, endDate, reason, orgAbbr, commanderDiscordId, commanderName, loaId } = await req.json();

    const embed = {
      title: "📋 New LOA Request Submitted",
      color: 0xf59e0b,
      fields: [
        { name: "Member", value: discordUsername || "Unknown", inline: true },
        { name: "Org", value: orgAbbr || "CSO", inline: true },
        { name: "Start Date", value: startDate || "N/A", inline: true },
        { name: "End Date", value: endDate || "N/A", inline: true },
        { name: "Reason", value: reason || "No reason provided", inline: false },
      ],
      timestamp: new Date().toISOString(),
    };

    const pingContent = commanderDiscordId
      ? `<@${commanderDiscordId}>`
      : commanderName
        ? `Commander: ${commanderName}`
        : "";

    const components = loaId
      ? [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: "Approve",
                custom_id: `loa_approve:${loaId}`,
              },
              {
                type: 2,
                style: 4,
                label: "Deny",
                custom_id: `loa_deny:${loaId}`,
              },
            ],
          },
        ]
      : [];

    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    const CHANNEL_ID = Deno.env.get("LOA_CHANNEL_ID");

    if (!BOT_TOKEN || !CHANNEL_ID) {
      return new Response(
        JSON.stringify({ error: "Missing DISCORD_BOT_TOKEN or LOA_CHANNEL_ID" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: pingContent, embeds: [embed], components }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ error: "Discord webhook error", detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultBody = await res.json();
    return new Response(JSON.stringify({ success: true, discordResponse: resultBody }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});