-- Migration 0011: cloud habit-tab entries.
--   * user_habit_entries — one jsonb row per user holding the nested
--     { tabId: { "YYYY-MM-DD": { v, updatedAt } } } map of habit-tracker
--     entries. Local storage is the source of truth; this row is the paid
--     cloud mirror, merged last-writer-wins per (tabId, date). The tab
--     *definitions* ride the existing user_settings row (like categories).
-- Apply via the Supabase SQL editor or `supabase db push`.

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
