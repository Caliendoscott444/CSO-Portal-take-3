-- ============================================================================
-- MSHP Member Portal — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`) on your project.
-- ============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles: one row per member, keyed to auth.users
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  discord_id            text unique,
  discord_username      text,
  discord_avatar_url    text,
  callsign              text,
  access_level          text not null default 'member', -- member | fto | command | staff
  current_assignment    text,                             -- null = "Not confirmed"
  loa_status            text not null default 'clear',    -- clear | active
  loa_reason            text,
  warnings              integer not null default 0,
  strikes               integer not null default 0,
  is_active             boolean not null default true,    -- false once terminated/retired
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own row"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: roster is readable by any signed-in member"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "profiles: update own row (limited via app logic)"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row when a Discord OAuth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, discord_id, discord_username, discord_avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'provider_id',
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'user_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- shift_types: the options shown in "Start a Shift"
-- ----------------------------------------------------------------------------
create table if not exists public.shift_types (
  id                  uuid primary key default gen_random_uuid(),
  key                 text unique not null,       -- 'patrol' | 'subdivision' | 'k9' | 'storm' | 'admin'
  label               text not null,              -- "Patrol Shift"
  multiplier          numeric not null default 1, -- credited-minutes multiplier, e.g. 1x, 2x
  required_role_id    text,                       -- Discord role id needed to start this shift
  active_role_id      text,                       -- Discord role id granted while the shift is running
  description         text,
  sort_order          integer not null default 0,
  is_active           boolean not null default true
);

alter table public.shift_types enable row level security;

create policy "shift_types: readable by any signed-in member"
  on public.shift_types for select
  using (auth.role() = 'authenticated');

insert into public.shift_types (key, label, multiplier, description, sort_order) values
  ('patrol',      'Patrol Shift',            1, 'Starts a regular shift and assigns the active-shift role.', 1),
  ('subdivision', 'Subdivision Shift',       1, 'Starts a shift under an eligible subdivision assignment.', 2),
  ('k9',          'K9 Shift',                1, 'Starts a K9-unit shift. Requires K9 certification role.', 3),
  ('storm',       'STORM Shift',             1.5, 'Starts a STORM tactical unit shift.', 4),
  ('admin',       'Administrative Shift',    1, 'Starts an administrative / desk duty shift.', 5)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- shifts: shift history + the single currently-active shift per user
-- ----------------------------------------------------------------------------
create table if not exists public.shifts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  shift_type_id   uuid not null references public.shift_types(id),
  status          text not null default 'active', -- active | completed | cancelled
  week_key        text not null,                  -- ISO week, e.g. '2026-W30'
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  minutes_worked  numeric not null default 0,
  minutes_credited numeric not null default 0
);

alter table public.shifts enable row level security;

create policy "shifts: read own"
  on public.shifts for select
  using (auth.uid() = user_id);

-- Inserts/updates to shifts happen through the edge functions (service role),
-- not directly from the browser, so no insert/update policy is granted here.

create unique index if not exists one_active_shift_per_user
  on public.shifts (user_id)
  where (status = 'active');

-- ----------------------------------------------------------------------------
-- loa_requests
-- ----------------------------------------------------------------------------
create table if not exists public.loa_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  reason        text not null,
  status        text not null default 'pending', -- pending | approved | denied
  reviewed_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

alter table public.loa_requests enable row level security;

create policy "loa: read own"
  on public.loa_requests for select
  using (auth.uid() = user_id);

create policy "loa: insert own"
  on public.loa_requests for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- discipline_records (read-only from the app; written by staff via dashboard/SQL)
-- ----------------------------------------------------------------------------
create table if not exists public.discipline_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null, -- warning | strike | termination | note
  reason      text not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

alter table public.discipline_records enable row level security;

create policy "discipline: read own"
  on public.discipline_records for select
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade, -- null = broadcast to all
  title       text not null,
  body        text not null,
  type        text not null default 'update', -- update | loa | application | staff
  created_at  timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications: read own or broadcast"
  on public.notifications for select
  using (auth.uid() = user_id or user_id is null);

-- ----------------------------------------------------------------------------
-- Helper: current ISO week key, e.g. '2026-W30'
-- ----------------------------------------------------------------------------
create or replace function public.iso_week_key(ts timestamptz default now())
returns text
language sql
immutable
as $$
  select to_char(ts, 'IYYY') || '-W' || to_char(ts, 'IW');
$$;

-- ----------------------------------------------------------------------------
-- View: weekly credited minutes per user, for the current week
-- ----------------------------------------------------------------------------
create or replace view public.weekly_credit_v as
select
  user_id,
  week_key,
  sum(minutes_credited) as credited_minutes,
  sum(minutes_worked)   as worked_minutes
from public.shifts
where status = 'completed'
group by user_id, week_key;
