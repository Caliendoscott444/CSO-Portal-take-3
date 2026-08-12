// Supabase Edge Function: get-transcript
// Serves a closed ticket's transcript HTML, but only to:
//   - the Discord user who opened the ticket (matched via profiles.discord_id), or
//   - a portal user with access_level 'staff' or 'command'
//
// Called from the frontend with the caller's Supabase auth JWT (verify_jwt is ON
// for this function — do NOT deploy with --no-verify-jwt).
//
// Request: GET /get-transcript?id=<ticket_id>
// Response: 200 text/html transcript, or 403/404 JSON error

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const ticketId = url.searchParams.get("id");
  if (!ticketId) {
    return new Response(JSON.stringify({ error: "Missing ticket id" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");

  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profile } = await admin
    .from("profiles")
    .select("discord_id, access_level")
    .eq("id", userData.user.id)
    .single();

  const { data: ticket } = await admin
    .from("tickets")
    .select("id, opener_id, transcript_path")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket || !ticket.transcript_path) {
    return new Response(JSON.stringify({ error: "Transcript not found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const isStaff = profile?.access_level === "staff" || profile?.access_level === "command";
  const isOpener = profile?.discord_id && profile.discord_id === ticket.opener_id;

  if (!isStaff && !isOpener) {
    return new Response(JSON.stringify({ error: "You don't have access to this transcript." }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: fileData, error: fileErr } = await admin.storage
    .from("ticket-transcripts")
    .download(ticket.transcript_path);

  if (fileErr || !fileData) {
    return new Response(JSON.stringify({ error: "Could not load transcript file." }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const html = await fileData.text();
  return new Response(html, {
    headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
  });
});