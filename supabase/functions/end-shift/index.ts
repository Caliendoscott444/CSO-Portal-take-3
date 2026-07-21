import { createClient } from 'npm:@supabase/supabase-js@2';
import { removeRole, corsHeaders } from '../_shared/discord.ts';

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
      .select('discord_id')
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
    const minutesWorked = Math.max(
      0,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
    );
    const multiplier = shift.shift_types?.multiplier ?? 1;
    const minutesCredited = Math.round(minutesWorked * multiplier);

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
