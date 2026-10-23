# P3c — Cloud Day Backgrounds Design

- **Date:** 2026-06-26
- **Status:** Approved (design); ready for implementation plan
- **Type:** Cloud sync — sync a subscriber's day-background config + images across devices.
- **Roadmap:** Third slice of P3. Depends on P3a (cloud mode + entitlement) and P3b
  (settings sync pattern). Realtime + iCloud-as-mirror are **deferred to P3d**.

## Goal

For **subscribers** (signed in + `cloud_active`), day backgrounds sync across
devices: the per-day "special day" config (cosmetic / emoji / recurrence / custom
gradient / image ref) **and** the background images themselves. **Free /
non-subscriber** users are unchanged — special days stay in `localStorage` and
images in IndexedDB, never uploaded.

## Background — how day backgrounds work today

- **Special days** live in a Zustand store mirrored to `localStorage`
  (`open-calendar.special-days`), one record per anchor date, each with a per-day
  `updatedAt` (ISO). A record may carry a `customStyle` (gradient/raw CSS) and/or
  an `image` ref.
- **Images:** both a dropped/pasted file *and* a "Load URL" link are fetched →
  downscaled to a ≤512px WebP → stored as a **blob in IndexedDB** (`dayImageStore`)
  under a random id. The day keeps only `{ id, w, h }`. IndexedDB is per-device /
  per-WebView, so nothing about day backgrounds syncs today — not even on the
  desktop `settings.json` mirror.

## What syncs

1. The whole special-days array (config), and
2. the WebP image blobs for `upload`-kind images.

`url`-kind images (live links) sync as **text only** — the URL travels in the
config blob; nothing is uploaded.

## Data model change — image refs become a discriminated union

`DayImageRef` in `specialDaysStore.ts` gains a `kind`:

```ts
export type DayImageRef =
  | { kind: 'upload'; id: string; w: number; h: number }            // WebP blob: IndexedDB + cloud bucket
  | { kind: 'url';    id: string; src: string; w: number; h: number }; // live remote link
```

- Both kinds keep a stable `id`, so the day-cell renderer keeps keying images by
  `id` unchanged.
- `normalizeSpecialDay` migrates legacy `{ id, w, h }` (no `kind`) →
  `{ kind: 'upload', id, w, h }`, so existing days keep rendering.
- `useDayImageUrls` resolves each ref to a URL: for `url` it returns `src`
  directly; for `upload` it returns the IndexedDB object-URL (as today).

## Storage — two transports

Both gated by `isCloudMode()`; both best-effort (local stays the source of truth).

### a. Config → table `user_special_days`

One jsonb row per user (the special-days array), mirroring `user_settings` exactly:

```sql
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
```

New module `src/data/cloudSpecialDays.ts`: `pushSpecialDays(array)` /
`pullSpecialDays()` — same shape as `cloudSettings.ts`.

### b. Images → private bucket `day-backgrounds`

Objects at `{auth.uid()}/{imageId}.webp`; RLS on `storage.objects` scopes each
user to their own uid folder:

```sql
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
```

New module `src/data/cloudDayImages.ts`: `uploadDayImage(id, blob)` /
`downloadDayImage(id): Blob | null` / `deleteDayImage(id)` — paths built as
`${user.id}/${id}.webp`. The bucket is **private**; downloads go through the
authenticated client (`storage.from(...).download(path)`), so RLS is enforced and
no public URL is exposed.

## Sync mechanism (mirrors the settings sync)

- **Push config:** `specialDaysStore.commit()` already writes `localStorage`;
  in cloud mode it additionally upserts the array to `user_special_days`
  (deduped against the last push by JSON, fire-and-forget).
- **Upload image:** in `DayBackgroundHost.ingest`, after the local `putImage`,
  in cloud mode upload the WebP to the bucket. "Pin a copy" (URL) routes through
  this same `upload` path. "Keep as link" creates a `url` ref — no upload.
- **Pull on activation / open:** `hydrateDayBackgroundsFromCloud()` (wired in
  `App.tsx` beside the settings hydrate, on `sessionId` / `cloudActive`):
  1. `pullSpecialDays()`; if a row exists, **per-day last-writer-wins merge by
     `updatedAt`** against the local array (union of dates, newer record wins) →
     set store + commit localStorage. If absent (empty cloud) → **seed** from local.
  2. For every referenced `upload` id **missing** from local IndexedDB,
     `downloadDayImage(id)` → `putImage`/store under that id, filling the cache so
     it renders. (`url` refs need no download.)
- **Delete:** removing or replacing an image (the Remove button / re-ingest)
  deletes its bucket object in cloud mode (snapshot-delete-own; best-effort).

Per-day LWW (not whole-array LWW) keeps one device from clobbering another
device's newer day — matching the multi-device safety of the events sync.

## UI change

In `DayBackgroundHost`'s ImageTab, the URL row's single **Load URL** button
becomes two: **Keep as link** (→ `url` ref, no upload) and **Pin a copy** (→
fetch + downscale + `upload` ref, uploaded in cloud mode). Drag/drop, paste, and
file-pick stay "pin" (always an `upload`). The `url` flow still decodes the image
once to record intrinsic `w`/`h`, then discards the bytes.

## Components / files

- **Create** `supabase/migrations/0008_day_backgrounds.sql`; add the table +
  bucket + storage policies to `supabase/full_setup.sql`.
- **Create** `src/data/cloudSpecialDays.ts` (+ test) — config push/pull.
- **Create** `src/data/cloudDayImages.ts` (+ test) — bucket upload/download/delete.
- **Modify** `src/app/specialDaysStore.ts` — `DayImageRef` union + migration;
  cloud push in `commit()`; `hydrateDayBackgroundsFromCloud()` (+ test).
- **Modify** `src/features/day-background/useDayImageUrls.ts` — resolve both kinds.
- **Modify** `src/features/day-background/DayBackgroundHost.tsx` — two URL buttons;
  upload on ingest in cloud mode; delete-from-bucket on remove.
- **Modify** `src/App.tsx` — call `hydrateDayBackgroundsFromCloud()` on activation.
- **Modify** docs: strategy roadmap (P3c done, P3d = realtime + iCloud-mirror),
  `BILLING_SETUP.md` + `supabase/README.md` (migration `0008` + bucket).

## Security

- `user_special_days` and the `day-backgrounds` bucket are both RLS-scoped to the
  owner via the anon key + JWT (no service-role). The bucket is private; folder
  isolation (`(storage.foldername(name))[1] = auth.uid()`) means a user can never
  read or write another user's images.
- Day-background custom CSS is already sanitised on render (`@keyframes`
  auto-renamed, remote `url()` and layout-escape stripped) — unchanged here.

## Reliability

- Local mirrors (localStorage + IndexedDB) are untouched, so a cloud push/upload
  failure never blocks the UI; the background is already saved locally.
- Config seed only fires on an empty cloud row; image download only fires for ids
  missing locally — both idempotent.
- Free/local users run exactly as before — the whole cloud path is gated by
  `isCloudMode()`.

## Testing

- `normalizeSpecialDay`: legacy `{id,w,h}` → `{kind:'upload',…}`; `url` ref kept.
- `cloudSpecialDays`: push upserts the array under the user id; pull returns the
  row's `data` or null.
- `cloudDayImages`: upload/download/delete build the `${uid}/${id}.webp` path;
  download returns null when absent.
- Hydrate: existing cloud row → per-day LWW merge (newer day wins, union of
  dates); empty cloud → seed; missing `upload` ids → download; local mode → no-op.

## Out of scope (→ P3d)

- Realtime push (Supabase Realtime) — next open/focus is enough for now.
- iCloud-as-mirror for events/images.
- Per-image GC of orphaned bucket objects beyond delete-on-remove.
- Sharing/public day backgrounds.
