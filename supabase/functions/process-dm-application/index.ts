// Supabase Edge Function: process-dm-application
//
// Called by the always-on DM bot process (see /bot) whenever a user sends a
// plain-text message in their DMs with the CSO bot. Advances that user's
// in-progress application by one question (saving their answer, sending the
// next question, or finalizing the submission), or tells the caller to
// ignore the message if they don't have an application awaiting a text
// answer right now.
//
// This function exists separately from discord-interactions because plain
// DM text messages arrive over Discord's Gateway (websocket), not the
// Interactions HTTP webhook that discord-interactions handles — so a
// separate always-on process has to receive them and hand them off here.
//
// Required secrets (set with `supabase secrets set`):
//   DISCORD_BOT_TOKEN        - same bot token as discord-interactions
//   APPLICATIONS_CHANNEL_ID  - channel finished applications are posted to
//   DM_BOT_SHARED_SECRET     - shared secret the bot process must send in
//                              the x-bot-secret header (prevents randoms
//                              from hitting this endpoint directly)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - standard Supabase function env

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildQuestionMessage,
  discordApiFactory,
  finalizeApplication,
  loadOrderedQuestions,
  sendDMPayload,
} from "../_shared/application-flow.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const SHARED_SECRET = Deno.env.get("DM_BOT_SHARED_SECRET")!;
  if (req.headers.get("x-bot-secret") !== SHARED_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
  const APPLICATIONS_CHANNEL_ID = Deno.env.get("APPLICATIONS_CHANNEL_ID")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const discordApi = discordApiFactory(BOT_TOKEN);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { discordUserId, content } = payload ?? {};
  if (!discordUserId || typeof content !== "string" || !content.trim()) {
    return new Response(JSON.stringify({ ignore: true }), { headers: { "Content-Type": "application/json" } });
  }

  const { data: pending } = await supabase
    .from("pending_applications")
    .select("*")
    .eq("discord_user_id", discordUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No application in progress for this user — nothing to do, this was
  // probably just a normal DM to the bot.
  if (!pending) {
    return new Response(JSON.stringify({ ignore: true }), { headers: { "Content-Type": "application/json" } });
  }

  const questions = await loadOrderedQuestions(supabase, pending.template_id);
  const currentQuestion = questions[pending.current_step];

  if (!currentQuestion) {
    // Stale/corrupt pending row (e.g. questions were deleted mid-application) — clean it up.
    await supabase.from("pending_applications").delete().eq("id", pending.id);
    return new Response(JSON.stringify({ ignore: true }), { headers: { "Content-Type": "application/json" } });
  }

  if (currentQuestion.question_type === "multiple_choice") {
    // This question expects a dropdown selection, not free text.
    await sendDMPayload(BOT_TOKEN, discordUserId, {
      content: "Please answer that question using the dropdown menu above rather than a text message.",
    });
    return new Response(JSON.stringify({ ignore: true }), { headers: { "Content-Type": "application/json" } });
  }

  const maxLen = currentQuestion.question_type === "paragraph" ? 1000 : 300;
  const answers: Record<string, string> = { ...(pending.answers ?? {}) };
  answers[currentQuestion.id] = content.trim().slice(0, maxLen);

  const nextIndex = pending.current_step + 1;

  if (nextIndex < questions.length) {
    await supabase.from("pending_applications").update({ answers, current_step: nextIndex }).eq("id", pending.id);
    const nextMessage = buildQuestionMessage(pending.id, questions[nextIndex], nextIndex, questions.length);
    await sendDMPayload(BOT_TOKEN, discordUserId, nextMessage);
    return new Response(JSON.stringify({ ok: true, advanced: true }), { headers: { "Content-Type": "application/json" } });
  }

  const result = await finalizeApplication(supabase, discordApi, APPLICATIONS_CHANNEL_ID, { ...pending, answers }, answers);

  if (result.error) {
    await sendDMPayload(BOT_TOKEN, discordUserId, {
      content: "Something went wrong saving your application. Please try again with /apply.",
    });
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await sendDMPayload(BOT_TOKEN, discordUserId, {
    embeds: [
      {
        title: "Application Submitted",
        description: "Thanks! Your application has been submitted. You'll be notified here once it's reviewed.",
        color: 0x22c55e,
      },
    ],
  });

  return new Response(JSON.stringify({ ok: true, completed: true }), { headers: { "Content-Type": "application/json" } });
});
