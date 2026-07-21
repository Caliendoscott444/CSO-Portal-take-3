# CSO Member Portal — setup guide

This adds a real, working member portal on top of your existing public site:
Discord login, a live dashboard, a shift system that checks/assigns Discord
roles, and an LOA request flow. Everything is wired to a real database
(Supabase) and real Discord API calls — no mock data.

## 1. Create a Supabase project

1. Go to https://supabase.com, create a free project.
2. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. Copy `.env.example` to `.env` and paste them in:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

## 2. Run the database migration

1. Open **SQL Editor** in your Supabase dashboard.
2. Paste the contents of `supabase/migrations/0001_portal_init.sql` and run it.
   This creates all tables (profiles, shifts, shift_types, loa_requests,
   discipline_records, notifications), row-level security policies, and
   seeds the five shift types shown in the UI.

## 3. Set up Discord login

1. Go to https://discord.com/developers/applications → create (or reuse) an application.
2. Under **OAuth2 → General**, add this redirect URL:
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client Secret**.
4. In Supabase: **Authentication → Providers → Discord** → enable it, paste
   the Client ID/Secret, save.
5. In Supabase **Authentication → URL Configuration**, set your site's
   Site URL and add `http://localhost:5173/portal` (dev) and your deployed
   `.../portal` URL to Redirect URLs.

## 4. Create the Discord bot (for real role checks/assignment)

The portal calls the Discord REST API directly from Supabase Edge Functions
— you don't need to run a bot process 24/7, just a bot **token**.

1. In the same Discord application, go to **Bot** → create a bot → copy the token.
2. Invite the bot to your server with the **Manage Roles** permission
   (OAuth2 URL Generator → scopes: `bot`, permissions: Manage Roles).
   Make sure the bot's role sits **above** any role it needs to assign.
3. Get your server's ID (right-click your server icon → Copy Server ID,
   with Developer Mode on).
4. In `supabase/migrations/0001_portal_init.sql`'s `shift_types` table, fill in
   `required_role_id` / `active_role_id` for each shift with your real Discord
   role IDs (right-click a role → Copy Role ID), e.g.:
   ```sql
   update public.shift_types set required_role_id = '123...', active_role_id = '456...' where key = 'patrol';
   ```

## 5. Install the Supabase CLI and deploy the Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF

supabase secrets set DISCORD_BOT_TOKEN=your-bot-token DISCORD_GUILD_ID=your-server-id

supabase functions deploy check-eligibility
supabase functions deploy start-shift
supabase functions deploy end-shift
```

## 6. Run it

```bash
npm install
npm run dev
```

Visit `/login` to sign in with Discord, then `/portal` for the dashboard,
`/portal/shifts` to start/end a shift, and `/portal/loa` to submit leave
requests.

## What's real vs. a placeholder right now

**Fully wired to the database and Discord API:**
- Discord OAuth login/logout, profile auto-created on first sign-in
- Dashboard stats (weekly credited time, discipline, assignment, LOA)
- Start/End Shift, with real Discord role eligibility checks and role
  assignment/removal via the bot token
- Weekly credited-minutes tracking (per ISO week)
- LOA request submission + status list

**Left as "coming soon" placeholders** (linked from the dashboard, ready for
you to ask me to build out next): My Profile detail page, Notifications feed,
Live Roster, Subdivisions, Applications, Ranks, Pictures, and the Sergeant
Exam. The database tables for discipline/notifications already exist, so
those pages are mostly UI work once you want them.

**Staff-side tooling** (adding discipline records, approving/denying LOA,
posting notifications) isn't built as an admin UI yet — for now, do that
directly in the Supabase Table Editor. Say the word if you want an admin
panel for staff.
