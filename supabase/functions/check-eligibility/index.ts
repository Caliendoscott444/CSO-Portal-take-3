// Checks whether the calling user's Discord roles satisfy a shift type's
// required_role_id, and whether they already have an active shift.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getMemberRoles, corsHeaders } from '../_shared/discord.ts';

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
    if (userErr || !userData.user) {
      return json({ error: 'Not authenticated' }, 401);
    }

    const { shift_type_key } = await req.json();

    const { data: profile } = await supabase
      .from('profiles')
      .select('discord_id')
      .eq('id', userData.user.id)
      .single();

    const { data: shiftType } = await supabase
      .from('shift_types')
      .select('*')
      .eq('key', shift_type_key)
      .single();

    if (!shiftType) return json({ error: 'Unknown shift type' }, 404);

    const { data: activeShift } = await supabase
      .from('shifts')
      .select('id')
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (activeShift) {
      return json({ eligible: false, reason: 'You already have an active shift.' });
    }

    if (!shiftType.required_role_id) {
      return json({ eligible: true });
    }

    if (!profile?.discord_id) {
      return json({ eligible: false, reason: 'No linked Discord account.' });
    }

    const roles = await getMemberRoles(profile.discord_id);
    const eligible = roles.includes(shiftType.required_role_id);

    console.log('DEBUG', {
  shift_type_key,
  discord_id: profile?.discord_id,
  required_role_id: shiftType.required_role_id,
  roles_from_discord: roles,
  guild_id_in_use: Deno.env.get('DISCORD_GUILD_ID'),
});

return json({
  eligible,
  reason: eligible ? undefined : 'Missing the required Discord role for this shift.',
});
    return json({
      eligible,
      reason: eligible ? undefined : 'Missing the required Discord role for this shift.',
    });
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
