import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    const CHANNEL_ID = Deno.env.get("SUGGESTIONS_CHANNEL_ID");

    if (!BOT_TOKEN || !CHANNEL_ID) {
      return new Response(
        JSON.stringify({ error: "Missing DISCORD_BOT_TOKEN or SUGGESTIONS_CHANNEL_ID" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { discordUser, robloxUser, message, orgAbbr } = await req.json();

    if (!message || !message.trim()) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const embed = {
      author: {
        name: `${orgAbbr} Suggestions`,
        icon_url: "https://cso-corporations.vercel.app/CSO_CORPORATION_LOGO_1-2.png",
      },
      title: "📋 New Suggestion Submitted",
      description: message.trim(),
      color: 0xf5b942,
      thumbnail: {
        url: "https://cso-corporations.vercel.app/CSO_CORPORATION_LOGO_1-2.png",
      },
      fields: [
        { name: "Discord User", value: discordUser?.trim() || "Not provided", inline: true },
        { name: "Roblox User", value: robloxUser?.trim() || "Not provided", inline: true },
      ],
      footer: { text: `${orgAbbr} Corporation • cso-corporations.vercel.app` },
      timestamp: new Date().toISOString(),
    };

    // 1. Send the embed via the bot
    const sendRes = await fetch(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ embeds: [embed] }),
      }
    );

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Discord send failed: ${sendRes.status} ${errText}`);
    }

    const sentMessage = await sendRes.json();
    const messageId = sentMessage.id;

    // 2. React with ✅ and ❌
    const reactions = ["✅", "❌"];
    for (const emoji of reactions) {
      const reactRes = await fetch(
        `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages/${messageId}/reactions/${encodeURIComponent(
          emoji
        )}/@me`,
        { method: "PUT", headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      if (!reactRes.ok) {
        console.error(`Reaction ${emoji} failed: ${reactRes.status} ${await reactRes.text()}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    return new Response(JSON.stringify({ success: true, messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});