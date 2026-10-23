-- Open Calendar — initial cloud schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) once your
-- project exists. It creates the per-user events table and locks it down with
-- Row-Level Security so each user can only ever see and touch their own rows.

create extension if not exists "pgcrypto";

create table if not exists public.events (
  -- Event id is generated client-side (crypto.randomUUID), so it's the PK.
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title           text not null,
  description     text,
  -- "YYYY-MM-DD" local wall-clock. Stored as text to preserve the app's exact
  -- floating semantics (no UTC/timezone coercion) — see the design spec.
  date            text not null,
  -- "HH:mm" local wall-clock; null = all-day.
  time            text,
  -- IANA timezone the time is anchored to; null on all-day/floating events.
  tz              text,
  -- { unit: 'week'|'month'|'year', interval: number } or null.
  recurrence      jsonb,
  -- Excluded occurrence dates for recurring events.
  exdates         text[],
  color           text,
  cosmetic        text,
  show_on_minimap boolean,
  created_at      timestamptz not null,
  updated_at      timestamptz not null
);

create index if not exists events_user_id_idx on public.events (user_id);

alter table public.events enable row level security;

-- One policy per command so the rules are explicit and auditable.
create policy "Users read their own events"
  on public.events for select
  using (auth.uid() = user_id);

create policy "Users insert their own events"
  on public.events for insert
  with check (auth.uid() = user_id);

create policy "Users update their own events"
  on public.events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete their own events"
  on public.events for delete
  using (auth.uid() = user_id);
