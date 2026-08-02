// CSO Portal — DM Application Listener
//
// This is the ONLY part of the CSO Portal bot that needs to run as an
// always-on process instead of a Supabase Edge Function. Its one job:
// listen for plain-text messages sent to the bot in DMs, and forward them
// to the `process-dm-application` Supabase edge function, which does all
// the actual database work and sends the next question back to the user.
//
// Everything else (slash commands, buttons, dropdowns, modals — including
// the dropdown answers and Cancel button in this same application flow)
// continues to run through the existing discord-interactions edge function,
// since Discord delivers those over its Interactions webhook regardless of
// whether they happened in a server channel or a DM.
//
// Required environment variables:
//   DISCORD_BOT_TOKEN         - same bot token used by discord-interactions
//   PROCESS_DM_APPLICATION_URL - full URL of the process-dm-application
//                                 edge function, e.g.
//                                 https://hrsktwnbzudbwetwehqa.supabase.co/functions/v1/process-dm-application
//   DM_BOT_SHARED_SECRET       - must match the secret set on that function

import { Client, GatewayIntentBits, Partials } from "discord.js";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PROCESS_URL = process.env.PROCESS_DM_APPLICATION_URL;
const SHARED_SECRET = process.env.DM_BOT_SHARED_SECRET;

if (!BOT_TOKEN || !PROCESS_URL || !SHARED_SECRET) {
  console.error(
    "Missing required env vars. Need DISCORD_BOT_TOKEN, PROCESS_DM_APPLICATION_URL, DM_BOT_SHARED_SECRET.",
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once("clientReady", () => {
  console.log(`DM application listener online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.type !== 1 /* DM */) return; // ChannelType.DM === 1

    const res = await fetch(PROCESS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": SHARED_SECRET,
      },
      body: JSON.stringify({
        discordUserId: message.author.id,
        content: message.content,
      }),
    });

    if (!res.ok) {
      console.error("process-dm-application returned", res.status, await res.text());
    }
  } catch (err) {
    console.error("Error handling DM message:", err);
  }
});

client.login(BOT_TOKEN);
