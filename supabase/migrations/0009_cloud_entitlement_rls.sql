-- Migration 0009: gate cloud WRITES on the paid Cloud entitlement.
--
-- Before this migration the events / user_settings / user_special_days tables
-- and the day-backgrounds bucket only checked ownership (auth.uid() = user_id),
-- so any signed-in free user with a patched client could use the paid cloud
-- storage. Writes now also require profiles.cloud_active.
--
-- Reads (and deletes) stay ownership-only on purpose: a lapsed subscriber can
-- still see, export, and delete their data — we never ransom it.
--
-- Also caps the day-backgrounds bucket (5 MB per file, WebP only) so it can't
-- be abused as free file hosting.

-- Entitlement check ----------------------------------------------------------
-- SECURITY DEFINER so policies don't re-enter profiles' own RLS.
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

-- events ---------------------------------------------------------------------
drop policy if exists "Users insert their own events" on public.events;
drop policy if exists "Users update their own events" on public.events;
create policy "Users insert their own events" on public.events for insert
  with check (auth.uid() = user_id and public.has_cloud_access());
create policy "Users update their own events" on public.events for update
  using (auth.uid() = user_id and public.has_cloud_access())
  with check (auth.uid() = user_id and public.has_cloud_access());

-- user_settings ----------------------------------------------------------------
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings for insert
  with check (auth.uid() = user_id and public.has_cloud_access());
create policy "user_settings_update_own" on public.user_settings for update
  using (auth.uid() = user_id and public.has_cloud_access())
  with check (auth.uid() = user_id and public.has_cloud_access());

-- user_special_days ------------------------------------------------------------
drop policy if exists "user_special_days_insert_own" on public.user_special_days;
drop policy if exists "user_special_days_update_own" on public.user_special_days;
create policy "user_special_days_insert_own" on public.user_special_days for insert
  with check (auth.uid() = user_id and public.has_cloud_access());
create policy "user_special_days_update_own" on public.user_special_days for update
  using (auth.uid() = user_id and public.has_cloud_access())
  with check (auth.uid() = user_id and public.has_cloud_access());

-- day-backgrounds bucket -------------------------------------------------------
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

-- Abuse limits: the app uploads {uid}/{imageId}.webp (see imageImport.ts).
-- (Migration 0013 widens both of these for video/GIF backgrounds.)
update storage.buckets
  set file_size_limit = 5242880, -- 5 MB
      allowed_mime_types = array['image/webp']
  where id = 'day-backgrounds';
