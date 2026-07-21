// Shared helpers for calling the Discord REST API from Supabase Edge Functions.
// Requires two secrets set on the Supabase project:
//   DISCORD_BOT_TOKEN  - bot token, bot must be in your server with "Manage Roles"
//   DISCORD_GUILD_ID   - your Discord server (guild) id
//
// Set them with:
//   supabase secrets set DISCORD_BOT_TOKEN=xxxx DISCORD_GUILD_ID=xxxx

const DISCORD_API = 'https://discord.com/api/v10';

function botHeaders() {
  const token = Deno.env.get('DISCORD_BOT_TOKEN');
  if (!token) throw new Error('DISCORD_BOT_TOKEN secret is not set');
  return {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  };
}

function guildId() {
  const id = Deno.env.get('DISCORD_GUILD_ID');
  if (!id) throw new Error('DISCORD_GUILD_ID secret is not set');
  return id;
}

export async function getMemberRoles(discordUserId: string): Promise<string[]> {
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId()}/members/${discordUserId}`,
    { headers: botHeaders() },
  );
  if (res.status === 404) return []; // not in the server
  if (!res.ok) {
    throw new Error(`Discord API error (${res.status}): ${await res.text()}`);
  }
  const member = await res.json();
  return (member.roles ?? []) as string[];
}

export async function addRole(discordUserId: string, roleId: string) {
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId()}/members/${discordUserId}/roles/${roleId}`,
    { method: 'PUT', headers: botHeaders() },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to add role (${res.status}): ${await res.text()}`);
  }
}

export async function removeRole(discordUserId: string, roleId: string) {
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId()}/members/${discordUserId}/roles/${roleId}`,
    { method: 'DELETE', headers: botHeaders() },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to remove role (${res.status}): ${await res.text()}`);
  }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};
