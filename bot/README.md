# CSO Portal — DM Application Listener

Small always-on Node.js process. Its only job: when someone DMs the bot a
plain text message, forward it to the `process-dm-application` Supabase
edge function, which does the actual work and replies for you.

Nothing else about your bot needs to move here — slash commands, buttons,
dropdowns, and modals all keep running through your existing
`discord-interactions` Supabase edge function exactly as before.

## 1. Enable the Message Content intent (one-time, Discord side)

1. Go to https://discord.com/developers/applications
2. Select your CSO bot application → **Bot** (left sidebar)
3. Under **Privileged Gateway Intents**, toggle **MESSAGE CONTENT INTENT** on
4. Save changes

Without this, the bot receives DM messages but `message.content` will
always be empty.

## 2. Deploy the process-dm-application edge function + set its secret

From your project folder:

```powershell
supabase functions deploy process-dm-application --no-verify-jwt
```

Then set a shared secret (generate any random string — this just proves
requests to that function are really coming from your bot process, not a
random person on the internet):

```powershell
supabase secrets set DM_BOT_SHARED_SECRET=your-random-string-here
```

Make sure `APPLICATIONS_CHANNEL_ID`, `DISCORD_BOT_TOKEN`, `SUPABASE_URL`,
and `SUPABASE_SERVICE_ROLE_KEY` are already set on your Supabase project
(they should be, since `discord-interactions` and `review-application`
already use them).

## 3. Deploy this bot process to Railway

1. Go to https://railway.app and sign in (GitHub login is easiest)
2. **New Project** → **Deploy from GitHub repo** (push this `bot/` folder
   to its own small GitHub repo first, or use **Empty Project** → drag in
   the `bot` folder / connect Railway's CLI — either works)
3. Once the project is created, go to **Variables** and add:
   - `DISCORD_BOT_TOKEN` — same token as your Supabase secrets
   - `PROCESS_DM_APPLICATION_URL` — `https://hrsktwnbzudbwetwehqa.supabase.co/functions/v1/process-dm-application`
   - `DM_BOT_SHARED_SECRET` — the exact same random string you set in step 2
4. Railway auto-detects Node from `package.json` and runs `npm start`.
   No Dockerfile needed.
5. Check the **Deployments** tab logs — you should see
   `DM application listener online as <YourBot#1234>`

That's it — this process has no HTTP server and doesn't need a public URL
or a domain; it just holds a websocket connection to Discord.

## Local testing (optional, before deploying)

```powershell
cd bot
npm install
$env:DISCORD_BOT_TOKEN="your-bot-token"
$env:PROCESS_DM_APPLICATION_URL="https://hrsktwnbzudbwetwehqa.supabase.co/functions/v1/process-dm-application"
$env:DM_BOT_SHARED_SECRET="your-random-string-here"
npm start
```

Then DM your bot on Discord to test.
