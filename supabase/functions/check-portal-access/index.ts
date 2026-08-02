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
      return json({ eligible: false, error: 'Not authenticated' }, 401);
    }

    const requiredRoleId = Deno.env.get('PORTAL_REQUIRED_ROLE_ID');
    if (!requiredRoleId) {
      return json({ eligible: false, reason: 'Portal access role is not configured.' }, 500);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('discord_id')
      .eq('id', userData.user.id)
      .single();

    if (!profile?.discord_id) {
      return json({ eligible: false, reason: 'No linked Discord account.' });
    }

    const roles = await getMemberRoles(profile.discord_id);
    const eligible = roles.includes(requiredRoleId);

    return json({
      eligible,
      reason: eligible
        ? undefined
        : 'You do not have the required Discord role to access the portal.',
    });
  } catch (err) {
    return json({ eligible: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
