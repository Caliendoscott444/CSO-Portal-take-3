import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
    const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID")!;
    const LOA_ROLE_ID = Deno.env.get("LOA_ROLE_ID")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const today = new Date().toISOString().slice(0, 10);

    const { data: expired, error } = await supabase
      .from("loa_requests")
      .select("id, user_id, end_date")
      .eq("status", "approved")
      .lt("end_date", today);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results: { loaId: string; userId: string; ok: boolean }[] = [];

    for (const loa of expired ?? []) {
      await supabase.from("loa_requests").update({ status: "completed" }).eq("id", loa.id);
      await supabase.from("profiles").update({ loa_status: "clear" }).eq("id", loa.user_id);

      const { data: member } = await supabase
        .from("profiles")
        .select("discord_id, discord_username")
        .eq("id", loa.user_id)
        .single();

      if (member?.discord_id) {
        try {
          await fetch(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${member.discord_id}/roles/${LOA_ROLE_ID}`,
            { method: "DELETE", headers: { Authorization: `Bot ${BOT_TOKEN}` } },
          );
        } catch {
          // best-effort
        }

        try {
          await fetch(`${SUPABASE_URL}/functions/v1/end-loa-notify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              discordId: member.discord_id,
              discordUsername: member.discord_username,
            }),
          });
        } catch {
          // best-effort
        }
      }

      results.push({ loaId: loa.id, userId: loa.user_id, ok: true });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});