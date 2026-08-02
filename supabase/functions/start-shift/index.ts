import { createClient } from 'npm:@supabase/supabase-js@2';
import { getMemberRoles, addRole, corsHeaders } from '../_shared/discord.ts';

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

    const { shift_type_key } = await req.json();

    const { data: profile } = await supabase
      .from('profiles')
      .select('discord_id')
      .eq('id', userId)
      .single();

    const { data: shiftType } = await supabase
      .from('shift_types')
      .select('*')
      .eq('key', shift_type_key)
      .single();
    if (!shiftType) return json({ error: 'Unknown shift type' }, 404);

    const { data: existing } = await supabase
      .from('shifts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (existing) return json({ error: 'You already have an active shift.' }, 409);

          if (shiftType.required_role_id) {
  if (!profile?.discord_id) return json({ error: 'No linked Discord account.' }, 403);
  const roles = await getMemberRoles(profile.discord_id);
  console.log('DEBUG', {
    discord_id: profile.discord_id,
    required_role_id: shiftType.required_role_id,
    roles_from_discord: roles,
    guild_id_in_use: Deno.env.get('DISCORD_GUILD_ID'),
  });
  if (!roles.includes(shiftType.required_role_id)) {
    return json({ error: 'Missing the required Discord role for this shift.' }, 403);
  }
}

    const now = new Date();
    const weekKey = isoWeekKey(now);

    const { data: currentWave } = await supabase
      .from('shift_waves')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();

    const { data: shift, error: insertErr } = await supabase
      .from('shifts')
      .insert({
        user_id: userId,
        shift_type_id: shiftType.id,
        status: 'active',
        week_key: weekKey,
        started_at: now.toISOString(),
        wave_id: currentWave?.id ?? null,
      })
      .select()
      .single();
    if (insertErr) return json({ error: insertErr.message }, 500);

    if (shiftType.active_role_id && profile?.discord_id) {
      await addRole(profile.discord_id, shiftType.active_role_id);
    }

    await supabase
      .from('profiles')
      .update({ current_assignment: shiftType.label })
      .eq('id', userId);

    return json({ shift });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function isoWeekKey(d: Date): string {
  // NOTE: renamed in spirit only — this now returns the fixed 14-day
  // period key, matching src/lib/period.ts's getPeriodKey() and the
  // weekly_credit_v SQL view exactly. Do not change this without also
  // updating both of those.
  const ANCHOR_UTC = Date.UTC(2024, 0, 1); // Mon 2024-01-01
  const PERIOD_DAYS = 14;
  const DAY_MS = 86400000;

  const dayUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const daysSinceAnchor = Math.floor((dayUTC - ANCHOR_UTC) / DAY_MS);
  const periodIndex = Math.floor(daysSinceAnchor / PERIOD_DAYS);
  const start = new Date(ANCHOR_UTC + periodIndex * PERIOD_DAYS * DAY_MS);

  const yyyy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(start.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
