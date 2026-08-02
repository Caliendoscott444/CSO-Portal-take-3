import { createClient } from 'npm:@supabase/supabase-js@2';
import { removeRole, sendDM, corsHeaders } from '../_shared/discord.ts';

function formatElapsed(minutes: number) {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
  return parts.join(' ');
}

function formatTimestamp(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401);
    const userId = userData.user.id;
    const { data: profile } = await supabase
      .from('profiles')
      .select('discord_id, callsign, discord_username')
      .eq('id', userId)
      .single();
    const { data: shift } = await supabase
      .from('shifts')
      .select('*, shift_types(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!shift) return json({ error: 'No active shift found.' }, 404);
    const startedAt = new Date(shift.started_at);
    const endedAt = new Date();
    // Keep full fractional-minute precision (down to the second) instead of
    // rounding to the nearest whole minute — the frontend re-derives h/m/s
    // display from this value, so rounding here destroys seconds precision.
    const minutesWorked = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 60000);
    const multiplier = shift.shift_types?.multiplier ?? 1;
    const minutesCredited = minutesWorked * multiplier;
    const { error: updateErr } = await supabase
      .from('shifts')
      .update({
        status: 'completed',
        ended_at: endedAt.toISOString(),
        minutes_worked: minutesWorked,
        minutes_credited: minutesCredited,
      })
      .eq('id', shift.id);
    if (updateErr) return json({ error: updateErr.message }, 500);
    if (shift.shift_types?.active_role_id && profile?.discord_id) {
      await removeRole(profile.discord_id, shift.shift_types.active_role_id);
    }
    await supabase
      .from('profiles')
      .update({ current_assignment: null })
      .eq('id', userId);

    // Best-effort DM shift report — never let a failed DM (e.g. user has
    // DMs off) block the actual shift-ending flow.
    if (profile?.discord_id) {
      try {
        const shiftTypeName =
          shift.shift_types?.name ?? shift.shift_types?.label ?? shift.shift_types?.key ?? 'Default';
        const nickname = [profile.callsign, profile.discord_username].filter(Boolean).join(' | ') || 'Unknown';

        const embed = {
          title: 'Shift Report',
          color: 0xf5b942,
          thumbnail: {
            url: 'https://cso-corporations.vercel.app/CSO_CORPORATION_LOGO_1-2.png',
          },
          description:
            `**Shift Information**\n` +
            `> **Shift Type:** ${shiftTypeName}\n` +
            `> **Shift Start:** ${formatTimestamp(startedAt)}\n` +
            `> **Shift End:** ${formatTimestamp(endedAt)}\n` +
            `> **Nickname:** \`${nickname}\`\n\n` +
            `**Elapsed Time**\n` +
            `> ${formatElapsed(minutesWorked)}`,
          timestamp: endedAt.toISOString(),
        };

        await sendDM(profile.discord_id, { embeds: [embed] });
      } catch (dmErr) {
        console.error('Shift report DM failed:', dmErr);
      }
    }

    return json({ minutesWorked, minutesCredited });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
