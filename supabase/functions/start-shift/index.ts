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
      if (!roles.includes(shiftType.required_role_id)) {
        return json({ error: 'Missing the required Discord role for this shift.' }, 403);
      }
    }

    const now = new Date();
    const weekKey = isoWeekKey(now);

    const { data: shift, error: insertErr } = await supabase
      .from('shifts')
      .insert({
        user_id: userId,
        shift_type_id: shiftType.id,
        status: 'active',
        week_key: weekKey,
        started_at: now.toISOString(),
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
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
