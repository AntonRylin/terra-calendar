-- ============================================================================
-- Terra Calendar — full Supabase setup (idempotent).
--
-- Paste this whole file into the Supabase SQL editor and run it (or `supabase db
-- push` the migrations). Safe to re-run. It is the consolidated equivalent of
-- migrations 0001–0014: it brings the `events` table up to date with every
-- column the app syncs, creates the `profiles` (entitlements) table, the
-- `user_settings` table (cloud settings/categories sync), and the
-- `user_special_days` table + `day-backgrounds` Storage bucket (cloud day
-- backgrounds) — all guarded by Row-Level Security, with cloud writes gated
-- on an active Cloud subscription (section 5).
-- ============================================================================
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. events — per-user calendar. (The table already exists from 0001 on most
--    projects; this adds the missing columns and (re)asserts RLS. Works on a
--    fresh project too, since the create is minimal and the alters fill it in.)
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null,
  date       text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

alter table public.events add column if not exists description      text;
alter table public.events add column if not exists end_date         text;
alter table public.events add column if not exists type             text;
alter table public.events add column if not exists time             text;
alter table public.events add column if not exists end_time         text;
alter table public.events add column if not exists tz               text;
alter table public.events add column if not exists recurrence       jsonb;
alter table public.events add column if not exists exdates          text[];
alter table public.events add column if not exists day_overrides    jsonb;
alter table public.events add column if not exists color            text;
alter table public.events add column if not exists cosmetic         text;
alter table public.events add column if not exists show_on_minimap  boolean;
alter table public.events add column if not exists show_in_upcoming boolean;
alter table public.events add column if not exists calendar_urls    text[];
alter table public.events add column if not exists is_task          boolean;
alter table public.events add column if not exists reminders        jsonb;

create index if not exists events_user_id_idx on public.events (user_id);

alter table public.events enable row level security;
drop policy if exists "Users read their own events"   on public.events;
drop policy if exists "Users insert their own events" on public.events;
drop policy if exists "Users update their own events" on public.events;
drop policy if exists "Users delete their own events" on public.events;
create policy "Users read their own events"   on public.events for select using (auth.uid() = user_id);
create policy "Users insert their own events" on public.events for insert with check (auth.uid() = user_id);
create policy "Users update their own events" on public.events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete their own events" on public.events for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. profiles — per-user entitlements ($3.99 cosmetics unlock + Cloud sub).
--    Written ONLY by the Stripe webhook (service role); users read their own row.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  cosmetics_unlocked boolean not null default false,
  cloud_active       boolean not null default false,
  plan               text,
  stripe_customer_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_id_idx on public.profiles (stripe_customer_id);

alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
-- No insert/update/delete policies: entitlement fields are written only by the
-- service-role Stripe webhook, which bypasses RLS. (Hard-enforced — a patched
-- client cannot grant itself a paid feature.)

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill profiles for users who signed up before this ran (e.g. you).
insert into public.profiles (user_id) select id from auth.users
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. user_settings — per-user preferences + categories blob (cloud settings sync).
--    Unlike profiles, the user IS the writer of their own settings.
-- ----------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. user_special_days + day-backgrounds bucket — cloud day backgrounds (P3c).
-- ----------------------------------------------------------------------------
create table if not exists public.user_special_days (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_special_days enable row level security;
drop policy if exists "user_special_days_select_own" on public.user_special_days;
drop policy if exists "user_special_days_insert_own" on public.user_special_days;
drop policy if exists "user_special_days_update_own" on public.user_special_days;
create policy "user_special_days_select_own" on public.user_special_days for select using (auth.uid() = user_id);
create policy "user_special_days_insert_own" on public.user_special_days for insert with check (auth.uid() = user_id);
create policy "user_special_days_update_own" on public.user_special_days for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('day-backgrounds', 'day-backgrounds', false)
on conflict (id) do nothing;
drop policy if exists "day_bg_select_own" on storage.objects;
drop policy if exists "day_bg_insert_own" on storage.objects;
drop policy if exists "day_bg_update_own" on storage.objects;
drop policy if exists "day_bg_delete_own" on storage.objects;
create policy "day_bg_select_own" on storage.objects for select
  using (bucket_id = 'day-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "day_bg_insert_own" on storage.objects for insert
  with check (bucket_id = 'day-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "day_bg_update_own" on storage.objects for update
  using (bucket_id = 'day-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "day_bg_delete_own" on storage.objects for delete
  using (bucket_id = 'day-backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 5. Cloud entitlement write-gating (0009). Writes to the cloud tables/bucket
--    require an active Cloud subscription (profiles.cloud_active); reads and
--    deletes stay ownership-only so a lapsed subscriber can still export and
--    remove their data. Must run after section 2 (profiles).
-- ----------------------------------------------------------------------------
create or replace function public.has_cloud_access()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select cloud_active from public.profiles where user_id = auth.uid()),
    false
  );
$$;
revoke all on function public.has_cloud_access() from public;
grant execute on function public.has_cloud_access() to authenticated;

drop policy if exists "Users insert their own events" on public.events;
drop policy if exists "Users update their own events" on public.events;
create policy "Users insert their own events" on public.events for insert
  with check (auth.uid() = user_id and public.has_cloud_access());
create policy "Users update their own events" on public.events for update
  using (auth.uid() = user_id and public.has_cloud_access())
  with check (auth.uid() = user_id and public.has_cloud_access());

drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings for insert
  with check (auth.uid() = user_id and public.has_cloud_access());
create policy "user_settings_update_own" on public.user_settings for update
  using (auth.uid() = user_id and public.has_cloud_access())
  with check (auth.uid() = user_id and public.has_cloud_access());

drop policy if exists "user_special_days_insert_own" on public.user_special_days;
drop policy if exists "user_special_days_update_own" on public.user_special_days;
create policy "user_special_days_insert_own" on public.user_special_days for insert
  with check (auth.uid() = user_id and public.has_cloud_access());
create policy "user_special_days_update_own" on public.user_special_days for update
  using (auth.uid() = user_id and public.has_cloud_access())
  with check (auth.uid() = user_id and public.has_cloud_access());

drop policy if exists "day_bg_insert_own" on storage.objects;
drop policy if exists "day_bg_update_own" on storage.objects;
create policy "day_bg_insert_own" on storage.objects for insert
  with check (bucket_id = 'day-backgrounds'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_cloud_access());
create policy "day_bg_update_own" on storage.objects for update
  using (bucket_id = 'day-backgrounds'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_cloud_access());

-- Abuse limits: the app uploads {uid}/{mediaId}.{webp|gif|webm|mp4} — WebP
-- stills, plus short muted clips re-encoded from videos and animated GIFs
-- (see imageImport.ts / videoImport.ts). Clips are capped client-side at 480px,
-- 15 fps and 10 s, so 8 MB is generous headroom rather than a target (0013).
update storage.buckets
  set file_size_limit = 8388608, -- 8 MB
      allowed_mime_types = array['image/webp', 'image/gif', 'video/webm', 'video/mp4']
  where id = 'day-backgrounds';

-- ----------------------------------------------------------------------------
-- 6. avatars — PUBLIC Storage bucket for per-user avatar images, {uid}/avatar.webp
--    with folder-scoped RLS. The app stores the resulting public URL in the auth
--    user's metadata (user_metadata.avatar_url); a short URL keeps the JWT small.
--    Writes are NOT gated behind has_cloud_access(): identity belongs to the
--    account, not the paid sync tier, so any signed-in user may set one.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

update storage.buckets
  set file_size_limit = 1048576, -- 1 MB
      allowed_mime_types = array['image/webp']
  where id = 'avatars';

-- ----------------------------------------------------------------------------
-- 7. user_habit_entries — cloud mirror of habit-tab entries (0011). Local
--    storage stays the source of truth; this row is merged last-writer-wins
--    per (tabId, date). Tab *definitions* ride the user_settings row.
-- ----------------------------------------------------------------------------
create table if not exists public.user_habit_entries (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_habit_entries enable row level security;
drop policy if exists "user_habit_entries_select_own" on public.user_habit_entries;
drop policy if exists "user_habit_entries_insert_own" on public.user_habit_entries;
drop policy if exists "user_habit_entries_update_own" on public.user_habit_entries;
create policy "user_habit_entries_select_own" on public.user_habit_entries for select using (auth.uid() = user_id);
create policy "user_habit_entries_insert_own" on public.user_habit_entries for insert with check (auth.uid() = user_id);
create policy "user_habit_entries_update_own" on public.user_habit_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 8. Calendar sharing (0014). Share your calendar with family: everything,
--    certain categories, or one event at a time. The SHARER needs the Cloud
--    subscription; recipients need only a free account.
--
--    Kept verbatim in migrations/0014_calendar_sharing.sql — read the comments
--    there, especially the rule that the `events` SELECT policy must NEVER be
--    widened to include shared rows.
-- ----------------------------------------------------------------------------
-- Per-event share overrides ---------------------------------------------------
-- Scope decides the default; these two override it in either direction.
alter table public.events
  add column if not exists share_include uuid[],
  add column if not exists share_exclude uuid[];

-- Shares ----------------------------------------------------------------------
create table if not exists public.shares (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- What the owner calls this share ("Family", "Work").
  name        text not null,
  -- all        = every event
  -- categories = only events whose `type` is in `categories`
  -- manual     = nothing by default; only events listing this share in share_include
  scope_mode  text not null default 'all' check (scope_mode in ('all', 'categories', 'manual')),
  categories  text[] not null default '{}',
  -- full = title + description; busy = times only, contents redacted server-side.
  detail      text not null default 'full' check (detail in ('full', 'busy')),
  -- Everyone holding the link gets this role. Per-person roles would need a
  -- per-member column; the link model deliberately does not have one.
  role        text not null default 'viewer' check (role in ('viewer', 'editor')),
  -- Hex, not base64: this ends up in a URL.
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shares_owner_id_idx on public.shares (owner_id);

create table if not exists public.share_members (
  share_id  uuid not null references public.shares (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (share_id, user_id)
);

create index if not exists share_members_user_id_idx on public.share_members (user_id);

-- Membership helpers ----------------------------------------------------------
-- SECURITY DEFINER so the policies below don't re-enter each other's RLS
-- (shares' policy reads share_members and vice versa — that would recurse).
create or replace function public.is_share_member(p_share uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.share_members m
    where m.share_id = p_share and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_share_owner(p_share uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shares s where s.id = p_share and s.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_share_member(uuid) from public;
revoke all on function public.is_share_owner(uuid) from public;
grant execute on function public.is_share_member(uuid) to authenticated;
grant execute on function public.is_share_owner(uuid) to authenticated;

-- RLS -------------------------------------------------------------------------
alter table public.shares enable row level security;
alter table public.share_members enable row level security;

-- Owners manage their shares; members may read the share they belong to (the UI
-- shows "shared by …"). CREATING a share requires the Cloud subscription —
-- sharing is the paid half of the feature. Reading and leaving never do, so a
-- lapsed subscriber keeps access to their own data (same rule as migration 0009).
drop policy if exists "shares_select" on public.shares;
drop policy if exists "shares_insert_own" on public.shares;
drop policy if exists "shares_update_own" on public.shares;
drop policy if exists "shares_delete_own" on public.shares;
create policy "shares_select" on public.shares for select
  using (auth.uid() = owner_id or public.is_share_member(id));
create policy "shares_insert_own" on public.shares for insert
  with check (auth.uid() = owner_id and public.has_cloud_access());
create policy "shares_update_own" on public.shares for update
  using (auth.uid() = owner_id and public.has_cloud_access())
  with check (auth.uid() = owner_id and public.has_cloud_access());
create policy "shares_delete_own" on public.shares for delete
  using (auth.uid() = owner_id);

-- A member can see and remove their own membership; an owner can see and remove
-- anyone's. There is deliberately NO insert policy: joining goes through
-- `join_share(token)`, which is the only thing that knows the token.
drop policy if exists "share_members_select" on public.share_members;
drop policy if exists "share_members_delete" on public.share_members;
create policy "share_members_select" on public.share_members for select
  using (user_id = auth.uid() or public.is_share_owner(share_id));
create policy "share_members_delete" on public.share_members for delete
  using (user_id = auth.uid() or public.is_share_owner(share_id));

-- Scope predicate -------------------------------------------------------------
-- One definition, used by both the read function and the editor write path, so
-- "is this event in this share?" can never be answered two different ways.
create or replace function public.event_in_share(
  p_type text, p_include uuid[], p_exclude uuid[],
  p_share uuid, p_scope text, p_categories text[]
) returns boolean language sql immutable as $$
  select
    -- An explicit include always wins (that is what per-event sharing is).
    p_share = any(coalesce(p_include, '{}'::uuid[]))
    or (
      not (p_share = any(coalesce(p_exclude, '{}'::uuid[])))
      and (
        p_scope = 'all'
        or (p_scope = 'categories' and p_type = any(p_categories))
      )
    );
$$;

-- Reading shared events -------------------------------------------------------
-- The ONLY path by which one user sees another's events. Returns a purpose-built
-- shape rather than `setof events`, so it stays decoupled from that table's
-- column order and can carry the share context the UI needs.
create or replace function public.shared_events()
returns table (
  id           uuid,
  share_id     uuid,
  owner_id     uuid,
  owner_name   text,
  role         text,
  title        text,
  description  text,
  date         text,
  end_date     text,
  type         text,
  "time"       text,
  end_time     text,
  tz           text,
  recurrence   jsonb,
  exdates      text[],
  day_overrides jsonb,
  color        text,
  cosmetic     text,
  created_at   timestamptz,
  updated_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    e.id,
    s.id as share_id,
    s.owner_id,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(u.email, '@', 1)
    ) as owner_name,
    s.role,
    -- "Busy" shares redact contents HERE, server-side. Doing it in the client
    -- would ship the private text to a machine that must not have it.
    case when s.detail = 'busy' then 'Busy' else e.title end as title,
    case when s.detail = 'busy' then null else e.description end as description,
    e.date, e.end_date, e.type, e."time", e.end_time, e.tz,
    e.recurrence, e.exdates, e.day_overrides, e.color, e.cosmetic,
    e.created_at, e.updated_at
  from public.events e
  join public.shares s        on s.owner_id = e.user_id
  join public.share_members m on m.share_id = s.id and m.user_id = auth.uid()
  join auth.users u           on u.id = s.owner_id
  where coalesce(e.is_task, false) = false  -- tasks are dateless and private
    and public.event_in_share(
      e.type, e.share_include, e.share_exclude,
      s.id, s.scope_mode, s.categories
    );
$$;

revoke all on function public.shared_events() from public;
grant execute on function public.shared_events() to authenticated;

-- Joining a share -------------------------------------------------------------
create or replace function public.join_share(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_share public.shares;
  v_count integer;
begin
  select * into v_share from public.shares where token = p_token;
  if not found then
    raise exception 'This share link is not valid or has been revoked.'
      using errcode = '22023';
  end if;

  -- Opening your own link is a no-op rather than an error.
  if v_share.owner_id = auth.uid() then
    return v_share.id;
  end if;

  -- Cap membership so a share cannot be repurposed as free shared storage for
  -- an unbounded crowd of free accounts.
  select count(*) into v_count from public.share_members where share_id = v_share.id;
  if v_count >= 10 then
    raise exception 'This share already has the maximum of 10 people.'
      using errcode = '22023';
  end if;

  insert into public.share_members (share_id, user_id)
  values (v_share.id, auth.uid())
  on conflict (share_id, user_id) do nothing;

  return v_share.id;
end;
$$;

revoke all on function public.join_share(text) from public;
grant execute on function public.join_share(text) to authenticated;

-- Editing a shared event ------------------------------------------------------
-- Editors write through this function rather than through a widened UPDATE
-- policy on `events`, so the table's own policies stay ownership-only and the
-- bare `select('*')` in the app and MCP server keep returning only own rows.
--
-- Only the fields a rescheduler needs are patchable. Everything else (cosmetics,
-- recurrence, category, sharing) stays under the owner's control.
create or replace function public.update_shared_event(p_event uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1
    from public.events e
    join public.shares s        on s.owner_id = e.user_id
    join public.share_members m on m.share_id = s.id and m.user_id = auth.uid()
    where e.id = p_event
      and s.role = 'editor'
      and s.detail = 'full'   -- you cannot edit what you are not allowed to read
      and public.event_in_share(
        e.type, e.share_include, e.share_exclude,
        s.id, s.scope_mode, s.categories
      )
  ) into v_ok;

  if not v_ok then
    raise exception 'You do not have permission to edit this event.'
      using errcode = '42501';
  end if;

  update public.events set
    title       = coalesce(p_patch ->> 'title', title),
    description = case when p_patch ? 'description'
                       then nullif(p_patch ->> 'description', '') else description end,
    date        = coalesce(p_patch ->> 'date', date),
    end_date    = case when p_patch ? 'end_date'
                       then nullif(p_patch ->> 'end_date', '') else end_date end,
    "time"      = case when p_patch ? 'time'
                       then nullif(p_patch ->> 'time', '') else "time" end,
    end_time    = case when p_patch ? 'end_time'
                       then nullif(p_patch ->> 'end_time', '') else end_time end,
    tz          = case when p_patch ? 'tz'
                       then nullif(p_patch ->> 'tz', '') else tz end,
    updated_at  = now()
  where id = p_event;
end;
$$;

revoke all on function public.update_shared_event(uuid, jsonb) from public;
grant execute on function public.update_shared_event(uuid, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Testing tip: to grant yourself Cloud + cosmetics without going through Stripe,
-- find your user id (Authentication → Users) and run:
--   update public.profiles
--     set cloud_active = true, cosmetics_unlocked = true
--     where user_id = '<your-auth-user-uuid>';
-- ----------------------------------------------------------------------------
