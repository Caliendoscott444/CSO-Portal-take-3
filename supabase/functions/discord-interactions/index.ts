// Supabase Edge Function: discord-interactions
// Handles Discord's HTTP Interactions for two slash commands:
//   /feedback      -> opens a modal (rating 1-5 + notes), posts a styled embed on submit
//   /reactionrole  -> posts an embed with a dropdown; picking an option toggles a role
//
// Required secrets (set with `supabase secrets set`):
//   DISCORD_PUBLIC_KEY   - from Discord Developer Portal -> your app -> General Information
//   DISCORD_BOT_TOKEN    - from Discord Developer Portal -> your app -> Bot -> Token
//   DISCORD_APPLICATION_ID - from Discord Developer Portal -> your app -> General Information

import nacl from 'npm:tweetnacl@1.0.3';

const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!;
const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!;
const CSO_LOGO_URL = 'https://cso-corporations.vercel.app/CSO_CORPORATION_LOGO_1-2.png';
const FEEDBACK_CHANNEL_ID = '1528721816472916118';
const REACTIONROLE_ALLOWED_ROLE_ID = '1530325162560458752';

const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3, MODAL_SUBMIT: 5 };
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  MODAL: 9,
};

function hexToUint8(hex: string) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

async function verifySignature(req: Request, body: string) {
  const signature = req.headers.get('X-Signature-Ed25519');
  const timestamp = req.headers.get('X-Signature-Timestamp');
  if (!signature || !timestamp) return false;
  return nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + body),
    hexToUint8(signature),
    hexToUint8(DISCORD_PUBLIC_KEY)
  );
}

function starBar(rating: number) {
  const filled = '\u2605'.repeat(rating);
  const empty = '\u2606'.repeat(5 - rating);
  return filled + empty;
}

function ratingColor(rating: number) {
  if (rating >= 4) return 0x3ba55d; // green
  if (rating === 3) return 0xf5b942; // amber
  return 0xed4245; // red
}

async function discordApi(path: string, init: RequestInit = {}) {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  const body = await req.text();
  const valid = await verifySignature(req, body);
  if (!valid) return new Response('Invalid request signature', { status: 401 });

  const interaction = JSON.parse(body);

  // 1. Discord's handshake check
  if (interaction.type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG });
  }

  // 2. Slash command invoked
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const commandName = interaction.data.name;

    if (commandName === 'feedback') {
      const staffOption = interaction.data.options?.find((o: any) => o.name === 'staff');
      const staffUserId = staffOption?.value ?? '';

      return Response.json({
        type: InteractionResponseType.MODAL,
        data: {
          custom_id: `feedback_modal:${staffUserId}`,
          title: 'Staff Feedback',
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: 'rating',
                  label: 'Rating (1-5)',
                  style: 1,
                  min_length: 1,
                  max_length: 1,
                  placeholder: 'e.g. 5',
                  required: true,
                },
              ],
            },
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: 'notes',
                  label: 'Notes',
                  style: 2,
                  placeholder: 'Share your feedback...',
                  required: true,
                  max_length: 1000,
                },
              ],
            },
          ],
        },
      });
    }

    if (commandName === 'reaction_role') {
      const memberRoles: string[] = interaction.member?.roles ?? [];
      if (!memberRoles.includes(REACTIONROLE_ALLOWED_ROLE_ID)) {
        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "You don't have permission to use this command.", flags: 64 },
        });
      }

      const opts = interaction.data.options ?? [];
      const get = (name: string) => opts.find((o: any) => o.name === name)?.value;

      const title = get('title') ?? 'Reaction Roles';
      const description = get('description') ?? 'Select an option below to receive a role.';

      const selectOptions: { label: string; value: string; emoji?: { name: string } }[] = [];
      for (let i = 1; i <= 5; i++) {
        const roleId = get(`role${i}`);
        const label = get(`label${i}`);
        const emoji = get(`emoji${i}`);
        if (roleId && label) {
          selectOptions.push({
            label,
            value: roleId,
            ...(emoji ? { emoji: { name: emoji } } : {}),
          });
        }
      }

      if (selectOptions.length === 0) {
        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'You need at least role1 and label1 set.', flags: 64 },
        });
      }

      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title,
              description,
              color: 0xf5b942,
              thumbnail: { url: CSO_LOGO_URL },
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 3, // string select
                  custom_id: 'reactionrole_select',
                  placeholder: 'Make a selection',
                  options: selectOptions,
                },
              ],
            },
          ],
        },
      });
    }

    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Unknown command.', flags: 64 },
    });
  }

  // 3. Modal submitted (feedback form)
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    if (interaction.data.custom_id.startsWith('feedback_modal:')) {
      const staffUserId = interaction.data.custom_id.split(':')[1];
      const fields = interaction.data.components.flatMap((row: any) => row.components);
      const ratingRaw = fields.find((f: any) => f.custom_id === 'rating')?.value ?? '';
      const notes = fields.find((f: any) => f.custom_id === 'notes')?.value ?? '';

      const rating = parseInt(ratingRaw, 10);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Rating must be a number from 1 to 5. Please run /feedback again.', flags: 64 },
        });
      }

      const submitter = interaction.member?.user ?? interaction.user;

      await discordApi(`/channels/${FEEDBACK_CHANNEL_ID}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          embeds: [
            {
              author: { name: submitter?.username ?? 'Unknown' },
              title: 'Staff Feedback',
              color: ratingColor(rating),
              thumbnail: { url: CSO_LOGO_URL },
              fields: [
                {
                  name: 'Staff Member',
                  value: staffUserId ? `<@${staffUserId}>` : 'Not specified',
                },
                { name: 'Rating', value: starBar(rating) },
                { name: 'Review', value: notes },
              ],
              footer: { text: `Feedback ID: ${Date.now()}` },
            },
          ],
        }),
      });

      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Thanks — your feedback has been submitted!', flags: 64 },
      });
    }
  }

  // 4. Reaction role dropdown clicked
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    if (interaction.data.custom_id === 'reactionrole_select') {
      const roleId = interaction.data.values[0];
      const guildId = interaction.guild_id;
      const userId = interaction.member.user.id;
      const alreadyHasRole = (interaction.member.roles ?? []).includes(roleId);

      const method = alreadyHasRole ? 'DELETE' : 'PUT';
      const res = await discordApi(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method });

      const message = res.ok
        ? alreadyHasRole
          ? `Removed <@&${roleId}> from you.`
          : `Gave you <@&${roleId}>.`
        : `Something went wrong (${res.status}). Make sure the bot's role is above that role in Server Settings -> Roles.`;

      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: message, flags: 64 },
      });
    }
  }

  return new Response('Unhandled interaction', { status: 400 });
});
