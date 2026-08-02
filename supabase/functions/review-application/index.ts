// Supabase Edge Function: review-application
// Called from the CSO Portal admin panel when a reviewer accepts or denies
// an application. Updates the submission row and posts a confirmation
// message (with the reviewer's note) to the applications Discord channel
// and DMs the applicant.
//
// Required secrets (same project as discord-interactions):
//   DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, APPLICATIONS_CHANNEL_ID,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendDM } from "../_shared/discord.ts";

const CSO_LOGO_URL = "https://cso-corporations.vercel.app/CSO_CORPORATION_LOGO_1-2.png";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
  const APPLICATIONS_CHANNEL_ID = Deno.env.get("APPLICATIONS_CHANNEL_ID")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { submissionId, action, note, reviewerDiscordId, reviewerName } = payload ?? {};

  if (!submissionId || (action !== "approve" && action !== "deny")) {
    return new Response(
      JSON.stringify({ error: "submissionId and action ('approve' | 'deny') are required" }),
      { status: 400 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: submission, error: fetchErr } = await supabase
    .from("application_submissions")
    .select("*, application_templates(name)")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchErr || !submission) {
    return new Response(JSON.stringify({ error: "Submission not found" }), { status: 404 });
  }

  if (submission.status !== "pending") {
    return new Response(
      JSON.stringify({ error: `This application was already ${submission.status}.` }),
      { status: 409 },
    );
  }

  const newStatus = action === "approve" ? "approved" : "denied";

  const { error: updateErr } = await supabase
    .from("application_submissions")
    .update({
      status: newStatus,
      reviewed_by_discord_id: reviewerDiscordId ?? null,
      reviewed_by_name: reviewerName ?? null,
      review_note: note ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  const templateName = submission.application_templates?.name ?? "Application";
  const verb = action === "approve" ? "accepted" : "denied";
  const reviewerTag = reviewerDiscordId ? `<@${reviewerDiscordId}>` : (reviewerName ?? "a reviewer");

  const noteLine = note
    ? `\n\nNotes: ${note}`
    : "";

  const summaryEmbed = {
    title: `${submission.discord_username ?? "Applicant"}'s '${templateName}' submission has been ${verb} successfully`,
    description: `Reviewed by ${reviewerTag}.${noteLine}`,
    color: action === "approve" ? 0x22c55e : 0xed4245,
    thumbnail: { url: CSO_LOGO_URL },
    timestamp: new Date().toISOString(),
  };

  if (APPLICATIONS_CHANNEL_ID) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${APPLICATIONS_CHANNEL_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [summaryEmbed] }),
      });
    } catch {
      // best-effort
    }
  }

  try {
    await sendDM(submission.discord_user_id, {
      embeds: [
        {
          title: action === "approve" ? "Your CSO application was approved" : "Your CSO application was denied",
          description: note ? `Notes from the reviewer:\n${note}` : undefined,
          color: action === "approve" ? 0x22c55e : 0xed4245,
          thumbnail: { url: CSO_LOGO_URL },
        },
      ],
    });
  } catch {
    // best-effort — DMs can be closed
  }

  return new Response(JSON.stringify({ success: true, status: newStatus }), {
    headers: { "Content-Type": "application/json" },
  });
});
