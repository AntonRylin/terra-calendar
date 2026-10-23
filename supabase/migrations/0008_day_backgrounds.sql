-- Migration 0008: cloud day backgrounds.
--   * user_special_days — one jsonb row per user (the special-days array, incl.
--     image refs). The user is the writer; RLS scopes it to the owner.
--   * day-backgrounds — a PRIVATE Storage bucket for per-user WebP images, laid
--     out as {auth.uid()}/{imageId}.webp with folder-scoped RLS.
-- Apply via the Supabase SQL editor or `supabase db push`.

-- Config table ---------------------------------------------------------------
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

-- Image bucket ---------------------------------------------------------------
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
