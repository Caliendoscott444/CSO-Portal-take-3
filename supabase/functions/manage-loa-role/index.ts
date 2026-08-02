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
    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID");
    const ROLE_ID = Deno.env.get("LOA_ROLE_ID");

    if (!BOT_TOKEN || !GUILD_ID || !ROLE_ID) {
      return new Response(
        JSON.stringify({ error: "Missing DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, or LOA_ROLE_ID" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { discordUserId, action } = await req.json();

    if (!discordUserId || (action !== "add" && action !== "remove")) {
      return new Response(
        JSON.stringify({ error: "Missing discordUserId or invalid action (must be 'add' or 'remove')" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const method = action === "add" ? "PUT" : "DELETE";

    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${ROLE_ID}`,
      {
        method,
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ error: "Discord API error", detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
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