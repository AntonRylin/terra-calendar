-- Migration 0014: calendar sharing.
--
-- Lets a Cloud subscriber share their calendar with family: everything, only
-- certain categories, or one specific event. Recipients need an account but NOT
-- a subscription — the sharer's subscription covers the household.
--
-- DESIGN RULE, do not break it: the `events` SELECT policy is NOT widened here.
-- `SupabaseRepository.load()` and the MCP server both issue a bare `select('*')`
-- and rely on RLS to scope the result. Widening that policy would silently push
-- other people's events into the sync engine, which would write them to the
-- local file and PUSH THEM INTO THE USER'S iCLOUD/GOOGLE ACCOUNTS, and
-- delete-wins would then let a viewer destroy the owner's events. Shared events
-- are therefore read through `shared_events()` only, into a separate client
-- store that is never a sync store.

-- Prerequisites ---------------------------------------------------------------
-- `gen_random_bytes` (share tokens) comes from pgcrypto.
create extension if not exists "pgcrypto";

-- The policies below gate share CREATION on the Cloud subscription, using the
-- helper from migration 0009. Projects created from an older full_setup.sql
-- don't have it, and Postgres' own error for that ("function ... does not
-- exist") doesn't say what to do about it — so check up front and say so.
do $$
begin
  if to_regprocedure('public.has_cloud_access()') is null then
    raise exception
      'This project is missing public.has_cloud_access() (migration 0009). Run supabase/full_setup.sql first — it is idempotent and brings the project up to date — then re-run this file.';
  end if;
end $$;

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
