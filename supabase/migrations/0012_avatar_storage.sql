-- Migration 0012: user avatars.
--   * avatars — a PUBLIC Storage bucket for per-user avatar images, laid out as
--     {auth.uid()}/avatar.webp with folder-scoped RLS. The app uploads the WebP
--     and stores the resulting public URL in the auth user's metadata
--     (user_metadata.avatar_url) — unlike a base64 data URL, a short URL keeps
--     the JWT small.
--   * Unlike day-backgrounds, avatar writes are NOT gated behind
--     has_cloud_access(): identity (name + picture) belongs to the account, not
--     the paid cross-device sync tier, so any signed-in user may set one.
-- Apply via the Supabase SQL editor or `supabase db push`.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone may read avatars (public bucket → <img src> works without signed URLs).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

-- A user may write/replace/delete only files under their own {auth.uid()}/ prefix.
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

-- Abuse limits: the app uploads {uid}/avatar.webp (see cloudAvatar.ts).
update storage.buckets
  set file_size_limit = 1048576, -- 1 MB (a 128px WebP is a few KB)
      allowed_mime_types = array['image/webp']
  where id = 'avatars';
