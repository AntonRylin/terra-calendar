# P3c — Cloud Day Backgrounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For subscribers (cloud mode), sync day-background config (special days) + images across devices — config via a `user_special_days` jsonb row, custom images via a private `day-backgrounds` Storage bucket, and URL backgrounds as plain links; free users unchanged.

**Architecture:** `DayImageRef` becomes a discriminated union (`upload` = WebP blob in IndexedDB + bucket; `url` = live link). Two small data modules (`cloudSpecialDays`, `cloudDayImages`) do the Supabase I/O. `specialDaysStore` pushes the config on `commit()` in cloud mode and exposes `hydrateDayBackgroundsFromCloud()` (per-day LWW merge + seed + image reconcile). `DayBackgroundHost` uploads images on ingest and offers "Keep as link" vs "Pin a copy". `App.tsx` hydrates on cloud activation. Local mirrors (localStorage + IndexedDB) stay the source of truth; all cloud work is gated by `isCloudMode()` and best-effort.

**Tech Stack:** Supabase (Postgres + RLS + Storage), React 18, Zustand, TypeScript, Vitest.

**Human step:** apply migration `0008` (or re-run `full_setup.sql`) — it creates the `user_special_days` table, the `day-backgrounds` bucket, and the storage RLS policies — before cloud day backgrounds work live.

---

## File Structure

- **Create** `supabase/migrations/0008_day_backgrounds.sql`; add the same to `supabase/full_setup.sql`.
- **Create** `src/data/cloudSpecialDays.ts` — config push/pull. **Test** `src/data/cloudSpecialDays.test.ts`.
- **Create** `src/data/cloudDayImages.ts` — bucket upload/download/delete. **Test** `src/data/cloudDayImages.test.ts`.
- **Modify** `src/app/specialDaysStore.ts` — `DayImageRef` union + migration; cloud push in `commit()`; `hydrateDayBackgroundsFromCloud()` + per-day LWW merge helper. **Test** `src/app/specialDaysCloud.test.ts` + extend ref migration coverage in a new `src/app/specialDaysStore.test.ts`.
- **Modify** `src/features/day-background/useDayImageUrls.ts` — resolve both ref kinds.
- **Modify** `src/features/day-background/DayBackgroundHost.tsx` — two URL buttons; upload on ingest; delete-from-bucket on remove.
- **Modify** `src/App.tsx` — call `hydrateDayBackgroundsFromCloud()` on activation.
- **Modify** docs: roadmap, `BILLING_SETUP.md`, `supabase/README.md`.

---

## Task 1: Schema — table + bucket + storage policies

**Files:**
- Create: `supabase/migrations/0008_day_backgrounds.sql`
- Modify: `supabase/full_setup.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_day_backgrounds.sql`:

```sql
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
```

- [ ] **Step 2: Add the same blocks to `supabase/full_setup.sql`**

In `supabase/full_setup.sql`, update the header comment `migrations 0001–0007` →
`migrations 0001–0008`, and append this section just before the final
`-- Testing tip:` separator block:

```sql
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
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_day_backgrounds.sql supabase/full_setup.sql
git commit -m "feat(cloud): migration 0008 — user_special_days table + day-backgrounds bucket"
```

---

## Task 2: `cloudSpecialDays` data module

**Files:**
- Create: `src/data/cloudSpecialDays.ts`
- Test: `src/data/cloudSpecialDays.test.ts`

Mirrors `src/data/cloudSettings.ts` (read it first for the exact pattern).

- [ ] **Step 1: Write the failing test**

Create `src/data/cloudSpecialDays.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn(async (_row: Record<string, unknown>, _opts?: unknown) => ({ error: null }));
const maybeSingle = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'u1' } } }));
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: { getUser },
    from: () => ({ upsert, select: () => ({ maybeSingle }) }),
  }),
}));

import { pushSpecialDays, pullSpecialDays } from './cloudSpecialDays';

describe('cloudSpecialDays', () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
    getUser.mockClear();
  });

  it('pushSpecialDays upserts the array under the user id', async () => {
    await pushSpecialDays([{ id: 'a', date: '2026-01-01' }]);
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.user_id).toBe('u1');
    expect(row.data).toEqual([{ id: 'a', date: '2026-01-01' }]);
    expect(typeof row.updated_at).toBe('string');
  });

  it('pullSpecialDays returns the row data array, or null when none', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { data: [{ id: 'a' }] }, error: null });
    expect(await pullSpecialDays()).toEqual([{ id: 'a' }]);
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await pullSpecialDays()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/cloudSpecialDays.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/data/cloudSpecialDays.ts`**

```ts
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const TABLE = 'user_special_days';

/** Upsert the whole special-days array to the signed-in user's row. Best-effort:
 *  localStorage remains the source of truth, so failures are swallowed. */
export async function pushSpecialDays(data: unknown[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch {
    // ignore — special days are already saved locally
  }
}

/** The user's cloud special-days array, or null if none / unavailable. */
export async function pullSpecialDays(): Promise<unknown[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('data').maybeSingle();
    if (error || !data) return null;
    const arr = (data as { data: unknown }).data;
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/cloudSpecialDays.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/cloudSpecialDays.ts src/data/cloudSpecialDays.test.ts
git commit -m "feat(cloud): cloudSpecialDays push/pull module"
```

---

## Task 3: `cloudDayImages` data module (Storage bucket)

**Files:**
- Create: `src/data/cloudDayImages.ts`
- Test: `src/data/cloudDayImages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/cloudDayImages.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn(async (_path: string, _blob: Blob, _opts?: unknown) => ({ error: null }));
const download = vi.fn(async (_path: string) => ({ data: null as Blob | null, error: null }));
const remove = vi.fn(async (_paths: string[]) => ({ error: null }));
const getUser = vi.fn(async () => ({ data: { user: { id: 'u1' } } }));
const from = vi.fn(() => ({ upload, download, remove }));
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth: { getUser }, storage: { from } }),
}));

import { uploadDayImage, downloadDayImage, deleteDayImage } from './cloudDayImages';

describe('cloudDayImages', () => {
  beforeEach(() => {
    upload.mockClear();
    download.mockClear();
    remove.mockClear();
    getUser.mockClear();
    from.mockClear();
  });

  it('uploadDayImage writes to {uid}/{id}.webp in the day-backgrounds bucket', async () => {
    await uploadDayImage('img1', new Blob(['x'], { type: 'image/webp' }));
    expect(from).toHaveBeenCalledWith('day-backgrounds');
    expect(upload.mock.calls[0][0]).toBe('u1/img1.webp');
  });

  it('downloadDayImage returns the blob, or null when absent', async () => {
    const blob = new Blob(['y'], { type: 'image/webp' });
    download.mockResolvedValueOnce({ data: blob, error: null });
    expect(await downloadDayImage('img1')).toBe(blob);
    download.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    expect(await downloadDayImage('img1')).toBeNull();
  });

  it('deleteDayImage removes {uid}/{id}.webp', async () => {
    await deleteDayImage('img1');
    expect(remove).toHaveBeenCalledWith(['u1/img1.webp']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/cloudDayImages.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/data/cloudDayImages.ts`**

```ts
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const BUCKET = 'day-backgrounds';

/** The signed-in user's object path for an image id, or null if not available. */
async function pathFor(id: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return `${user.id}/${id}.webp`;
}

/** Upload a WebP blob to the user's bucket folder. Best-effort (the local
 *  IndexedDB copy is the source of truth), so failures are swallowed. */
export async function uploadDayImage(id: string, blob: Blob): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const path = await pathFor(id);
    if (!path) return;
    await getSupabase().storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/webp',
      upsert: true,
    });
  } catch {
    // ignore — image is already stored locally
  }
}

/** Download a day-background image blob from the bucket, or null if missing. */
export async function downloadDayImage(id: string): Promise<Blob | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const path = await pathFor(id);
    if (!path) return null;
    const { data, error } = await getSupabase().storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/** Delete a day-background image from the bucket. Best-effort. */
export async function deleteDayImage(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const path = await pathFor(id);
    if (!path) return;
    await getSupabase().storage.from(BUCKET).remove([path]);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/cloudDayImages.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/cloudDayImages.ts src/data/cloudDayImages.test.ts
git commit -m "feat(cloud): cloudDayImages storage-bucket module"
```

---

## Task 4: `DayImageRef` union + migration

**Files:**
- Modify: `src/app/specialDaysStore.ts`
- Test: `src/app/specialDaysStore.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/app/specialDaysStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeSpecialDay } from './specialDaysStore';

describe('normalizeSpecialDay image refs', () => {
  it('migrates a legacy {id,w,h} image ref to kind:upload', () => {
    const d = normalizeSpecialDay({ id: 'x', date: '2026-01-01', image: { id: 'i1', w: 400, h: 300 } });
    expect(d.image).toEqual({ kind: 'upload', id: 'i1', w: 400, h: 300 });
  });

  it('keeps an explicit upload ref', () => {
    const d = normalizeSpecialDay({ date: '2026-01-02', image: { kind: 'upload', id: 'i2', w: 1, h: 2 } });
    expect(d.image).toEqual({ kind: 'upload', id: 'i2', w: 1, h: 2 });
  });

  it('keeps a url ref with its src', () => {
    const d = normalizeSpecialDay({ date: '2026-01-03', image: { kind: 'url', id: 'i3', src: 'https://e/x.png', w: 10, h: 20 } });
    expect(d.image).toEqual({ kind: 'url', id: 'i3', src: 'https://e/x.png', w: 10, h: 20 });
  });

  it('drops a malformed image ref', () => {
    const d = normalizeSpecialDay({ date: '2026-01-04', image: { nope: true } });
    expect(d.image).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/specialDaysStore.test.ts`
Expected: FAIL — `image` shape mismatch (no `kind` yet).

- [ ] **Step 3: Replace the `DayImageRef` type**

In `src/app/specialDaysStore.ts`, replace:

```ts
export interface DayImageRef {
  id: string;   // key into the image store
  w: number;    // intrinsic px of the stored WebP
  h: number;
}
```

with:

```ts
/** A day-background image. `upload` = a WebP blob stored locally (IndexedDB) and,
 *  for subscribers, in the cloud bucket. `url` = a live remote link (synced as
 *  text only; never uploaded). Both carry a stable `id` used as the render key. */
export type DayImageRef =
  | { kind: 'upload'; id: string; w: number; h: number }
  | { kind: 'url'; id: string; src: string; w: number; h: number };
```

- [ ] **Step 4: Update the `image` normalisation**

In `normalizeSpecialDay`, replace:

```ts
  const rawImage = raw?.image;
  const image: DayImageRef | undefined =
    rawImage && typeof rawImage.id === 'string'
      ? { id: rawImage.id, w: Number(rawImage.w) || 0, h: Number(rawImage.h) || 0 }
      : undefined;
```

with:

```ts
  const rawImage = raw?.image;
  let image: DayImageRef | undefined;
  if (rawImage && typeof rawImage.id === 'string') {
    const w = Number(rawImage.w) || 0;
    const h = Number(rawImage.h) || 0;
    if (rawImage.kind === 'url' && typeof rawImage.src === 'string') {
      image = { kind: 'url', id: rawImage.id, src: rawImage.src, w, h };
    } else {
      // Legacy refs (no kind) and explicit uploads both become upload refs.
      image = { kind: 'upload', id: rawImage.id, w, h };
    }
  }
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/app/specialDaysStore.test.ts` → expected PASS (4 tests).
Run: `npx tsc --noEmit` → expect errors in `DayBackgroundHost.tsx` / `useDayImageUrls.ts` (they reference the old shape). These are fixed in Tasks 5–6; note them and continue.

- [ ] **Step 6: Commit**

```bash
git add src/app/specialDaysStore.ts src/app/specialDaysStore.test.ts
git commit -m "feat(day-bg): DayImageRef discriminated union (upload | url) + migration"
```

---

## Task 5: Resolve both ref kinds when rendering

**Files:**
- Modify: `src/features/day-background/useDayImageUrls.ts`

- [ ] **Step 1: Update `useDayImageUrls` to handle both kinds**

The hook currently maps each day's `image.id` through `getImageUrl` (IndexedDB).
For `url` refs there is no IndexedDB entry — the `src` IS the URL. Replace the
whole body of `src/features/day-background/useDayImageUrls.ts` with:

```ts
import { useEffect, useState } from 'react';
import type { SpecialDay } from '../../app/specialDaysStore';
import { getImageUrl } from '../../data/dayImageStore';

/** Resolve every day-image ref in `specialDays` to a usable URL, keyed by image
 *  id. `url` refs resolve to their live `src`; `upload` refs resolve to a cached
 *  IndexedDB object URL. Keyed on the set of (id|src) pairs so editing unrelated
 *  days doesn't re-fire, and only ids currently in use are kept. */
export function useDayImageUrls(specialDays: SpecialDay[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const refs = specialDays
    .map((d) => d.image)
    .filter((img): img is NonNullable<SpecialDay['image']> => !!img);
  const idKey = Array.from(
    new Set(refs.map((img) => (img.kind === 'url' ? `url:${img.id}:${img.src}` : `up:${img.id}`))),
  )
    .sort()
    .join(',');

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      refs.map(async (img) => {
        if (img.kind === 'url') return [img.id, img.src] as const;
        return [img.id, await getImageUrl(img.id)] as const;
      }),
    )
      .then((pairs) => {
        if (cancelled) return;
        setUrls(Object.fromEntries(pairs.filter(([, url]) => url) as [string, string][]));
      })
      .catch((e) => console.error('Failed to resolve day images:', e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  return urls;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `useDayImageUrls.ts` clean; remaining errors only in `DayBackgroundHost.tsx` (fixed next).

- [ ] **Step 3: Commit**

```bash
git add src/features/day-background/useDayImageUrls.ts
git commit -m "feat(day-bg): resolve url + upload image refs when rendering"
```

---

## Task 6: DayBackgroundHost — upload on ingest, link vs pin, delete on remove

**Files:**
- Modify: `src/features/day-background/DayBackgroundHost.tsx`

- [ ] **Step 1: Add imports**

In `src/features/day-background/DayBackgroundHost.tsx`, replace the import line:

```ts
import { putImage, deleteImage, getImageUrl } from '../../data/dayImageStore';
```

with:

```ts
import { putImage, deleteImage, getImageUrl } from '../../data/dayImageStore';
import { isCloudMode } from '../../data/createRepository';
import { uploadDayImage, deleteDayImage } from '../../data/cloudDayImages';
```

- [ ] **Step 2: Make `ingest` produce an `upload` ref and upload it in cloud mode**

Replace the `ingest` function:

```ts
  const ingest = async (blob: Blob) => {
    setBusy(true); setError('');
    try {
      const { blob: webp, w, h } = await processImage(blob);
      if (existing?.image) await removeExistingImage(existing.image);
      const ref = await putImage(webp, w, h);
      setImageUrl(await getImageUrl(ref.id));
      if (isCloudMode()) void uploadDayImage(ref.id, webp);
      apply({ image: { kind: 'upload', id: ref.id, w: ref.w, h: ref.h }, customStyle: undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load image');
    } finally {
      setBusy(false);
    }
  };
```

Note `putImage` returns `{ id, w, h }` (unchanged). `apply` now wraps it as an
`upload` ref. `removeExistingImage` is added in Step 3.

- [ ] **Step 3: Add a `removeExistingImage` helper + a `keepAsLink` handler**

Immediately above `ingest`, add:

```ts
  // Remove an image ref's bytes: delete the local IndexedDB blob (upload only)
  // and, in cloud mode, the bucket object. `url` refs have no stored bytes.
  const removeExistingImage = async (img: NonNullable<typeof existing>['image']) => {
    if (!img) return;
    if (img.kind === 'upload') {
      await deleteImage(img.id);
      if (isCloudMode()) void deleteDayImage(img.id);
    }
  };

  // "Keep as link": store the URL as a live ref (no upload). Decode once to record
  // intrinsic size, then discard the bytes.
  const keepAsLink = async (src: string) => {
    setBusy(true); setError('');
    try {
      const blob = await blobFromUrl(src);
      const bitmap = await createImageBitmap(blob);
      const w = bitmap.width, h = bitmap.height;
      bitmap.close?.();
      if (existing?.image) await removeExistingImage(existing.image);
      const id = crypto.randomUUID();
      setImageUrl(src);
      apply({ image: { kind: 'url', id, src, w, h }, customStyle: undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load image');
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 4: Update the image preview to handle a `url` ref**

The preview effect currently calls `getImageUrl(existing.image.id)`. Replace:

```ts
  useEffect(() => {
    if (existing?.image) getImageUrl(existing.image.id).then(setImageUrl);
  }, [existing?.image?.id]);
```

with:

```ts
  useEffect(() => {
    const img = existing?.image;
    if (!img) return;
    if (img.kind === 'url') setImageUrl(img.src);
    else getImageUrl(img.id).then(setImageUrl);
  }, [existing?.image?.id]);
```

- [ ] **Step 5: Update the `onRemove` in the ImageTab usage**

Replace the `ImageTab` element's `onRemove`:

```tsx
        {tab === 'image' && (
          <ImageTab busy={busy} hasImage={!!existing?.image} onIngest={ingest}
            onRemove={async () => { if (existing?.image) await deleteImage(existing.image.id); setImageUrl(null); apply({ image: undefined, customStyle: undefined }); }} />
        )}
```

with:

```tsx
        {tab === 'image' && (
          <ImageTab busy={busy} hasImage={!!existing?.image} onIngest={ingest} onKeepLink={keepAsLink}
            onRemove={async () => { if (existing?.image) await removeExistingImage(existing.image); setImageUrl(null); apply({ image: undefined, customStyle: undefined }); }} />
        )}
```

- [ ] **Step 6: Update the `ImageTab` component — two URL buttons**

Replace the whole `ImageTab` function:

```tsx
function ImageTab({ busy, hasImage, onIngest, onKeepLink, onRemove }: {
  busy: boolean; hasImage: boolean; onIngest: (b: Blob) => void; onKeepLink: (src: string) => void; onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  return (
    <div className="dbg-body"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = imageFileFromDataTransfer(e.dataTransfer); if (f) onIngest(f); }}
      onPaste={(e) => { const f = imageFileFromDataTransfer(e.clipboardData); if (f) onIngest(f); }}
    >
      <div className="dbg-drop">{busy ? 'Processing…' : 'Drag & drop a photo here, or paste (Ctrl+V)'}</div>
      <div className="dbg-row">
        <button onClick={() => fileRef.current?.click()}>📁 Choose file</button>
        {hasImage && <button onClick={onRemove}>🗑 Remove</button>}
      </div>
      <div className="dbg-row">
        <input className="dbg-input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button disabled={!url} onClick={() => onKeepLink(url)} title="Sync the link only — loads live on every device">🔗 Keep as link</button>
        <button disabled={!url} onClick={async () => onIngest(await blobFromUrl(url))} title="Download a copy — offline-safe, stored in your cloud bucket">📌 Pin a copy</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onIngest(f); }} />
    </div>
  );
}
```

- [ ] **Step 7: Typecheck + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/features/day-background/DayBackgroundHost.tsx
git commit -m "feat(day-bg): upload images to cloud bucket; keep-as-link vs pin-a-copy"
```

---

## Task 7: Settings store — push special days on commit + cloud hydrate

**Files:**
- Modify: `src/app/specialDaysStore.ts`
- Test: `src/app/specialDaysCloud.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/app/specialDaysCloud.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let cloudOn = true;
const pushSpecialDays = vi.fn(async (_d: unknown[]) => {});
const pullSpecialDays = vi.fn(async () => null as unknown[] | null);
const downloadDayImage = vi.fn(async (_id: string) => null as Blob | null);
const putImage = vi.fn(async (_b: Blob, _w: number, _h: number) => ({ id: 'x', w: 0, h: 0 }));
const hasImage = vi.fn(async (_id: string) => false);
vi.mock('../data/createRepository', () => ({ isCloudMode: () => cloudOn }));
vi.mock('../data/cloudSpecialDays', () => ({
  pushSpecialDays: (d: unknown[]) => pushSpecialDays(d),
  pullSpecialDays: () => pullSpecialDays(),
}));
vi.mock('../data/cloudDayImages', () => ({
  downloadDayImage: (id: string) => downloadDayImage(id),
}));
vi.mock('../data/dayImageStore', () => ({
  putImage: (b: Blob, w: number, h: number) => putImage(b, w, h),
  hasImage: (id: string) => hasImage(id),
  getImageUrl: async () => null,
  deleteImage: async () => {},
}));

import { useSpecialDaysStore, hydrateDayBackgroundsFromCloud } from './specialDaysStore';

describe('cloud day-background sync', () => {
  beforeEach(() => {
    cloudOn = true;
    pushSpecialDays.mockClear();
    pullSpecialDays.mockReset();
    downloadDayImage.mockReset().mockResolvedValue(null);
    putImage.mockClear();
    hasImage.mockReset().mockResolvedValue(false);
    localStorage.clear();
    useSpecialDaysStore.setState({ specialDays: [] });
  });

  it('commit pushes the array in cloud mode', () => {
    useSpecialDaysStore.setState({ specialDays: [{ id: 'a', date: '2026-01-01', cosmetic: '', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' }] });
    useSpecialDaysStore.getState().commit();
    expect(pushSpecialDays).toHaveBeenCalledTimes(1);
    expect((pushSpecialDays.mock.calls[0][0] as unknown[]).length).toBe(1);
  });

  it('hydrate merges per-day by updatedAt (newer wins, union of dates)', async () => {
    // local: day A old, day B only-local
    useSpecialDaysStore.setState({ specialDays: [
      { id: 'a', date: '2026-01-01', cosmetic: 'old', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', date: '2026-02-02', cosmetic: 'localonly', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' },
    ] });
    // cloud: day A newer, day C only-cloud
    pullSpecialDays.mockResolvedValueOnce([
      { id: 'a', date: '2026-01-01', cosmetic: 'new', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'c', date: '2026-03-03', cosmetic: 'cloudonly', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    await hydrateDayBackgroundsFromCloud();
    const days = useSpecialDaysStore.getState().specialDays;
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.cosmetic]));
    expect(byDate['2026-01-01']).toBe('new');       // cloud newer wins
    expect(byDate['2026-02-02']).toBe('localonly'); // local-only kept
    expect(byDate['2026-03-03']).toBe('cloudonly'); // cloud-only added
  });

  it('hydrate downloads upload images missing locally', async () => {
    hasImage.mockResolvedValue(false);
    downloadDayImage.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }));
    pullSpecialDays.mockResolvedValueOnce([
      { id: 'a', date: '2026-01-01', cosmetic: '', animations: [], emoji: '', recurrence: 'none',
        image: { kind: 'upload', id: 'img1', w: 1, h: 1 }, updatedAt: '2026-06-01T00:00:00Z' },
    ]);
    await hydrateDayBackgroundsFromCloud();
    expect(downloadDayImage).toHaveBeenCalledWith('img1');
    expect(putImage).toHaveBeenCalledTimes(1);
  });

  it('empty cloud seeds from local', async () => {
    useSpecialDaysStore.setState({ specialDays: [
      { id: 'a', date: '2026-01-01', cosmetic: '', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' },
    ] });
    pullSpecialDays.mockResolvedValueOnce(null);
    await hydrateDayBackgroundsFromCloud();
    expect(pushSpecialDays).toHaveBeenCalledTimes(1);
  });

  it('does nothing in local mode', async () => {
    cloudOn = false;
    await hydrateDayBackgroundsFromCloud();
    expect(pullSpecialDays).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/specialDaysCloud.test.ts`
Expected: FAIL — `hydrateDayBackgroundsFromCloud` not exported; commit doesn't push.

- [ ] **Step 3: Add imports + dedup state to `specialDaysStore.ts`**

At the top of `src/app/specialDaysStore.ts`, after `import { create } from 'zustand';`, add:

```ts
import { isCloudMode } from '../data/createRepository';
import { pushSpecialDays, pullSpecialDays } from '../data/cloudSpecialDays';
import { downloadDayImage } from '../data/cloudDayImages';
import { putImage, hasImage } from '../data/dayImageStore';

/** JSON of the last special-days array pushed to the cloud — skips redundant pushes. */
let lastPushedSpecialDays = '';
```

- [ ] **Step 4: Push from `commit()`**

Replace:

```ts
  commit() {
    localStorage.setItem('open-calendar.special-days', JSON.stringify(get().specialDays));
  },
```

with:

```ts
  commit() {
    const days = get().specialDays;
    localStorage.setItem('open-calendar.special-days', JSON.stringify(days));
    if (isCloudMode()) {
      const json = JSON.stringify(days);
      if (json !== lastPushedSpecialDays) {
        lastPushedSpecialDays = json;
        void pushSpecialDays(days);
      }
    }
  },
```

- [ ] **Step 5: Add the per-day merge helper + `hydrateDayBackgroundsFromCloud`**

At the end of `src/app/specialDaysStore.ts` (after `getSpecialDayForDate`), add:

```ts
/** Merge two special-days arrays by anchor date, keeping the record with the
 *  newer `updatedAt` for each date (last-writer-wins). Union of all dates. */
export function mergeSpecialDaysByDate(local: SpecialDay[], cloud: SpecialDay[]): SpecialDay[] {
  const byDate = new Map<string, SpecialDay>();
  for (const d of local) byDate.set(d.date, d);
  for (const d of cloud) {
    const existing = byDate.get(d.date);
    if (!existing || (d.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
      byDate.set(d.date, d);
    }
  }
  return Array.from(byDate.values());
}

/**
 * Pull the subscriber's cloud day backgrounds, merge per-day (last-writer-wins by
 * `updatedAt`) with the local set, and download any `upload` images missing from
 * the local IndexedDB cache. An empty cloud is seeded from local. No-op outside
 * cloud mode. Call on cloud activation.
 */
export async function hydrateDayBackgroundsFromCloud(): Promise<void> {
  if (!isCloudMode()) return;
  const raw = await pullSpecialDays();
  if (raw) {
    const cloudDays = raw.map(normalizeSpecialDay);
    const merged = mergeSpecialDaysByDate(useSpecialDaysStore.getState().specialDays, cloudDays);
    lastPushedSpecialDays = JSON.stringify(merged);
    useSpecialDaysStore.setState({ specialDays: merged });
    useSpecialDaysStore.getState().commit();
    // Backfill any upload images we don't have locally yet.
    for (const d of merged) {
      const img = d.image;
      if (img && img.kind === 'upload' && !(await hasImage(img.id))) {
        const blob = await downloadDayImage(img.id);
        if (blob) await putImage(blob, img.w, img.h, img.id);
      }
    }
  } else {
    const days = useSpecialDaysStore.getState().specialDays;
    lastPushedSpecialDays = JSON.stringify(days);
    await pushSpecialDays(days);
  }
}
```

NOTE: this calls `putImage(blob, w, h, id)` with an explicit id — `putImage`
currently generates its own id. Update it in Step 6.

- [ ] **Step 6: Let `putImage` accept an explicit id**

In `src/data/dayImageStore.ts`, replace:

```ts
/** Store a WebP blob under a fresh id; returns the ref to persist on the day. */
export async function putImage(blob: Blob, w: number, h: number): Promise<{ id: string; w: number; h: number }> {
  const id = crypto.randomUUID();
  await tx('readwrite', (s) => s.put({ blob, w, h } satisfies StoredImage, id));
  return { id, w, h };
}
```

with:

```ts
/** Store a WebP blob under `id` (or a fresh one); returns the ref to persist on
 *  the day. Passing an explicit id is used when restoring a cloud image. */
export async function putImage(blob: Blob, w: number, h: number, id = crypto.randomUUID()): Promise<{ id: string; w: number; h: number }> {
  await tx('readwrite', (s) => s.put({ blob, w, h } satisfies StoredImage, id));
  return { id, w, h };
}
```

- [ ] **Step 7: Run test + typecheck**

Run: `npx vitest run src/app/specialDaysCloud.test.ts` → expected PASS (5 tests).
Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/specialDaysStore.ts src/app/specialDaysCloud.test.ts src/data/dayImageStore.ts
git commit -m "feat(day-bg): push special days + cloud hydrate (per-day LWW + image backfill)"
```

---

## Task 8: App — hydrate day backgrounds on activation

**Files:**
- Modify: `src/App.tsx`

(No unit test — App effect is integration; the logic is unit-tested in Task 7.)

- [ ] **Step 1: Import the hydrate function**

In `src/App.tsx`, add the import (near the other store imports):

```ts
import { hydrateDayBackgroundsFromCloud } from './app/specialDaysStore';
```

- [ ] **Step 2: Add the effect**

Immediately AFTER the `hydrateSettingsFromCloud` effect (added in P3b), add:

```tsx
  // On cloud activation, pull the subscriber's day backgrounds (config + images)
  // and seed an empty cloud from local. No-op in local mode.
  useEffect(() => {
    if (!isCloudMode()) return;
    void hydrateDayBackgroundsFromCloud();
  }, [sessionId, cloudActive]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(day-bg): hydrate cloud day backgrounds on activation"
```

---

## Task 9: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`
- Modify: `docs/BILLING_SETUP.md`
- Modify: `supabase/README.md`

- [ ] **Step 1: Update the strategy roadmap**

In `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`, replace:

```markdown
- **P3c — realtime + day-background images + iCloud-as-mirror:** ⏳ not started.
```

with:

```markdown
- **P3c — cloud day backgrounds:** ✅ shipped to `main`. Subscribers' special-days
  config syncs via a `user_special_days` row; custom images via a private
  `day-backgrounds` Storage bucket; URL backgrounds sync as live links. Requires
  migration `0008` (table + bucket + storage RLS).
- **P3d — realtime + iCloud-as-mirror:** ⏳ not started (split out of P3c).
```

- [ ] **Step 2: Note migration `0008` in `docs/BILLING_SETUP.md`**

In `docs/BILLING_SETUP.md`, change the migrations line to include `0008`:

```markdown
1. Apply the migrations: `supabase db push` — `0004` (profiles + RLS + signup
   trigger), `0005` (`show_in_upcoming`), `0006` (event columns for
   spans/type/overrides/tasks), `0007` (`user_settings`), and `0008`
   (`user_special_days` + the `day-backgrounds` Storage bucket). Or just paste
   `supabase/full_setup.sql`. Cloud event sync needs `0006`; cloud settings sync
   needs `0007`; cloud day backgrounds need `0008`.
```

- [ ] **Step 3: Note the bucket in `supabase/README.md`**

In `supabase/README.md`, under "## 2. Create the schema", after the paragraph
about every row being owner-scoped, add:

```markdown
P3c also creates a private **`day-backgrounds`** Storage bucket; each user can
read/write only objects under their own `{auth.uid()}/…` folder (storage RLS).
`full_setup.sql` and migration `0008` both create it.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-business-model-strategy-design.md docs/BILLING_SETUP.md supabase/README.md
git commit -m "docs: P3c done; migration 0008 + day-backgrounds bucket in setup"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all pass. New tests: Task 2 (2) + Task 3 (3) + Task 4 (4) + Task 7 (5) = 14 added → 421 total (was 407).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Local-mode smoke**

`npm run dev` with no Supabase env → day backgrounds (image + builder + code
tabs) behave exactly as before; "Keep as link" stores a URL ref and renders;
`isCloudMode()` false → no cloud calls.

- [ ] **Step 4: (Human, live) Cloud smoke**

After applying `0008` and signing in as a `cloud_active` user: set a day image
(Pin a copy) on one device → it appears on another after reopening; set a URL
background with "Keep as link" → appears with no upload; removing an image clears
it on both devices.

---

## Self-Review

**Spec coverage (against `2026-06-26-p3c-cloud-day-backgrounds-design.md`):**
- `DayImageRef` union (upload | url) + legacy migration → Task 4 + test. ✓
- `user_special_days` table + RLS → Task 1. ✓
- `day-backgrounds` private bucket + folder-scoped storage RLS → Task 1. ✓
- `cloudSpecialDays` push/pull → Task 2. ✓
- `cloudDayImages` upload/download/delete (`{uid}/{id}.webp`) → Task 3. ✓
- Push config on `commit()` (deduped, cloud mode) → Task 7. ✓
- Upload image on ingest; keep-as-link vs pin-a-copy; delete-on-remove → Task 6. ✓
- Hydrate: per-day LWW merge + seed + image backfill → Task 7 + Task 8 wiring. ✓
- Render both ref kinds → Task 5. ✓
- Local mirrors unchanged / free users unaffected → `commit` still writes
  localStorage; IndexedDB untouched; cloud gated by `isCloudMode()`. ✓
- Docs (roadmap, BILLING_SETUP, supabase/README, full_setup.sql) → Tasks 1 + 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands
have expected output. The live cloud smoke is a flagged human step (in-repo code
is unit-tested with a mocked Supabase + storage client).

**Type consistency:**
- `DayImageRef` union defined in Task 4 is consumed identically in Tasks 5
  (`img.kind === 'url' ? img.src : …`), 6 (`{ kind: 'upload', … }` /
  `{ kind: 'url', … }`), and 7 (`img.kind === 'upload'`).
- `putImage(blob, w, h, id?)` — the optional 4th param added in Task 7 Step 6 is
  what Task 7 Step 5's backfill relies on; existing 3-arg callers in
  `DayBackgroundHost` (Task 6) still typecheck.
- `pushSpecialDays(unknown[])` / `pullSpecialDays(): unknown[] | null` (Task 2)
  match the store's `SpecialDay[]` usage via `normalizeSpecialDay` in Task 7.
- `uploadDayImage(id, blob)` / `downloadDayImage(id)` / `deleteDayImage(id)`
  (Task 3) match the calls in Tasks 6 and 7.
- `isCloudMode` is the same P3a predicate used in P3b.
- `mergeSpecialDaysByDate(local, cloud)` defined and used in Task 7; exported for
  its unit test.

**Note for the implementer:** Task 4 Step 5 intentionally leaves the tree with
typecheck errors (the renderer/host still use the old ref shape); they are
resolved by Tasks 5–6. Don't try to "fix" them early — follow the task order.
