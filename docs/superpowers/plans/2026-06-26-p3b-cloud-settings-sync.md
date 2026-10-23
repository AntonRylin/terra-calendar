# P3b — Cloud Categories + Settings Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For subscribers (cloud mode), sync categories + app preferences across devices via a Supabase `user_settings` row; device-local sizing stays per-device; free users unchanged.

**Architecture:** A `cloudSettings` data module does the Supabase push/pull of an opaque settings blob. The settings store defines the syncable slice (preferences + categories, excluding the five sizing fields), pushes it on every change while in cloud mode (deduped), and `hydrateSettingsFromCloud()` pulls + merges (keeping device-local) on cloud activation, seeding an empty cloud from local. The existing `localStorage` + `settings.json` mirrors are untouched.

**Tech Stack:** Supabase (Postgres + RLS), React 18, Zustand, TypeScript, Vitest.

**Human step:** apply migration `0007` (or re-run `full_setup.sql`) to your Supabase before cloud settings sync works live.

---

## File Structure

- **Create** `supabase/migrations/0007_user_settings.sql`; add the table to `supabase/full_setup.sql`.
- **Create** `src/data/cloudSettings.ts` — `pushSettings` / `pullSettings` (opaque blob I/O). **Test** `src/data/cloudSettings.test.ts`.
- **Modify** `src/app/settingsStore.ts` — `syncableSettings`, cloud push in `persist()`, `hydrateSettingsFromCloud()`. **Test** `src/app/settingsCloud.test.ts`.
- **Modify** `src/App.tsx` — call `hydrateSettingsFromCloud()` on cloud activation.
- **Modify** docs: roadmap, `BILLING_SETUP.md`.

---

## Task 1: Schema — `user_settings`

**Files:**
- Create: `supabase/migrations/0007_user_settings.sql`
- Modify: `supabase/full_setup.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0007_user_settings.sql`:

```sql
-- Migration 0007: per-user settings blob (preferences + categories) for cloud
-- sync. One row per user; the user is the writer (unlike profiles). RLS scopes
-- it to the owner. Apply via the Supabase SQL editor or `supabase db push`.
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
```

- [ ] **Step 2: Add the same block to `supabase/full_setup.sql`**

Append the identical `create table … user_settings …` + RLS block (from Step 1, minus the `-- Migration 0007` header line) to the end of `supabase/full_setup.sql`, under a comment:

```sql

-- ----------------------------------------------------------------------------
-- 3. user_settings — per-user preferences + categories blob (cloud settings sync).
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
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_user_settings.sql supabase/full_setup.sql
git commit -m "feat(cloud): migration 0007 — user_settings table for settings sync"
```

---

## Task 2: `cloudSettings` data module

**Files:**
- Create: `src/data/cloudSettings.ts`
- Test: `src/data/cloudSettings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/cloudSettings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn(async () => ({ error: null }));
const maybeSingle = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'u1' } } }));
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: { getUser },
    from: () => ({ upsert, select: () => ({ maybeSingle }) }),
  }),
}));

import { pushSettings, pullSettings } from './cloudSettings';

describe('cloudSettings', () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
    getUser.mockClear();
  });

  it('pushSettings upserts the blob under the user id', async () => {
    await pushSettings({ theme: 'dark' });
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.user_id).toBe('u1');
    expect(row.data).toEqual({ theme: 'dark' });
    expect(typeof row.updated_at).toBe('string');
  });

  it('pullSettings returns the row data, or null when none', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { data: { theme: 'dark' } }, error: null });
    expect(await pullSettings()).toEqual({ theme: 'dark' });
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await pullSettings()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/cloudSettings.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/data/cloudSettings.ts`**

```ts
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const TABLE = 'user_settings';

/** Upsert the syncable settings blob to the signed-in user's row. Best-effort:
 *  local mirrors remain the source of truth, so failures are swallowed. */
export async function pushSettings(data: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch {
    // ignore — settings are already saved locally
  }
}

/** The user's cloud settings blob, or null if none / unavailable. (RLS scopes
 *  the select to the user, so there is at most one row.) */
export async function pullSettings(): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('data').maybeSingle();
    if (error || !data) return null;
    return (data as { data: Record<string, unknown> | null }).data ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/cloudSettings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/cloudSettings.ts src/data/cloudSettings.test.ts
git commit -m "feat(cloud): cloudSettings push/pull module"
```

---

## Task 3: Settings store — syncable slice, push, cloud hydrate

**Files:**
- Modify: `src/app/settingsStore.ts`
- Test: `src/app/settingsCloud.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/app/settingsCloud.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let cloudOn = true;
const pushSettings = vi.fn(async (_d: Record<string, unknown>) => {});
const pullSettings = vi.fn(async () => null as Record<string, unknown> | null);
vi.mock('../data/createRepository', () => ({ isCloudMode: () => cloudOn }));
vi.mock('../data/cloudSettings', () => ({
  pushSettings: (d: Record<string, unknown>) => pushSettings(d),
  pullSettings: () => pullSettings(),
}));
vi.mock('../data/settingsFile', () => ({
  settingsFileAvailable: () => false,
  readSettingsFile: async () => null,
  writeSettingsFile: async () => {},
}));

import { useSettingsStore, syncableSettings, hydrateSettingsFromCloud } from './settingsStore';

describe('cloud settings sync', () => {
  beforeEach(() => {
    cloudOn = true;
    pushSettings.mockClear();
    pullSettings.mockReset();
    localStorage.clear();
    useSettingsStore.setState({ categories: {}, theme: 'light', sidebarWidth: 30, minimapSize: 100 });
  });

  it('syncableSettings includes preferences/categories and excludes device-local sizing', () => {
    const s = syncableSettings(useSettingsStore.getState());
    expect(s).toHaveProperty('theme');
    expect(s).toHaveProperty('categories');
    expect(s).not.toHaveProperty('sidebarWidth');
    expect(s).not.toHaveProperty('sidebarSplit');
    expect(s).not.toHaveProperty('minimapSize');
    expect(s).not.toHaveProperty('fontScale');
    expect(s).not.toHaveProperty('tileScale');
  });

  it('hydrate merges cloud preferences but keeps device-local; empty cloud seeds', async () => {
    // Existing cloud row → applied over current, device-local untouched.
    pullSettings.mockResolvedValueOnce({ theme: 'dark', categories: { Work: { type: 'color', value: '#f00' } } });
    useSettingsStore.setState({ sidebarWidth: 42 });
    await hydrateSettingsFromCloud();
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(useSettingsStore.getState().categories.Work).toEqual({ type: 'color', value: '#f00' });
    expect(useSettingsStore.getState().sidebarWidth).toBe(42); // device-local preserved

    // Empty cloud → seed from current.
    pullSettings.mockResolvedValueOnce(null);
    pushSettings.mockClear();
    await hydrateSettingsFromCloud();
    expect(pushSettings).toHaveBeenCalledTimes(1);
    expect(pushSettings.mock.calls[0][0]).not.toHaveProperty('sidebarWidth');
  });

  it('does nothing in local mode', async () => {
    cloudOn = false;
    await hydrateSettingsFromCloud();
    expect(pullSettings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/settingsCloud.test.ts`
Expected: FAIL — `syncableSettings` / `hydrateSettingsFromCloud` not exported.

- [ ] **Step 3: Add imports + module state** to `src/app/settingsStore.ts`

Add near the top imports (after the `settingsFile` import line):

```ts
import { isCloudMode } from '../data/createRepository';
import { pushSettings, pullSettings } from '../data/cloudSettings';
```

Add a module-level variable just below the `STORAGE_KEY` constant near the top of the file:

```ts
/** JSON of the last syncable slice pushed to the cloud — skips redundant pushes
 *  (e.g. when only device-local sizing changed). */
let lastPushedSyncable = '';
```

- [ ] **Step 4: Add `syncableSettings`** (right after the `serialize` function)

```ts
/** The settings that sync to the cloud for subscribers — preferences and
 *  categories. The sizing/layout numbers (minimapSize, sidebarWidth, sidebarSplit,
 *  fontScale, tileScale) stay device-local and are deliberately excluded. */
export function syncableSettings(s: PersistedSettings): Partial<PersistedSettings> {
  return {
    theme: s.theme,
    monthLabelMode: s.monthLabelMode,
    customMonths: s.customMonths,
    displayTimeZone: s.displayTimeZone,
    minimapFilter: s.minimapFilter,
    minimapMode: s.minimapMode,
    minimapRotation: s.minimapRotation,
    accentColor: s.accentColor,
    categories: s.categories,
    showUvIndex: s.showUvIndex,
    showHourlyWeather: s.showHourlyWeather,
    showWeatherIconOnDays: s.showWeatherIconOnDays,
    showClockOnToday: s.showClockOnToday,
    weatherAndLocationEnabled: s.weatherAndLocationEnabled,
    calendarViewMode: s.calendarViewMode,
    showGrid: s.showGrid,
  };
}
```

- [ ] **Step 5: Push to the cloud from `persist()`**

Find the existing `persist` function inside the store:

```ts
  function persist() {
    writeMirrors(get());
  }
```

Replace it with:

```ts
  function persist() {
    writeMirrors(get());
    // Subscribers also mirror the syncable slice to the cloud. Skip when only a
    // device-local field changed (the slice is identical to the last push).
    if (isCloudMode()) {
      const slice = syncableSettings(get());
      const json = JSON.stringify(slice);
      if (json !== lastPushedSyncable) {
        lastPushedSyncable = json;
        void pushSettings(slice as Record<string, unknown>);
      }
    }
  }
```

- [ ] **Step 6: Add `hydrateSettingsFromCloud`** (right after the existing `hydrateSettingsFromDisk` function)

```ts
/**
 * Pull the subscriber's cloud settings and apply the synced fields over the
 * current state (device-local sizing is kept). An empty cloud row is seeded from
 * the current local settings. No-op outside cloud mode. Call on cloud activation.
 */
export async function hydrateSettingsFromCloud(): Promise<void> {
  if (!isCloudMode()) return;
  const data = await pullSettings();
  if (data) {
    const current = serialize(useSettingsStore.getState());
    // Normalise the cloud blob through the migrator, then take only its synced
    // fields and lay them over the current settings (keeps device-local values).
    const incoming = syncableSettings(mergeSettings(data as Partial<PersistedSettings>));
    const merged = { ...current, ...incoming };
    useSettingsStore.setState(merged);
    writeMirrors(merged);
    lastPushedSyncable = JSON.stringify(syncableSettings(merged));
  } else {
    const slice = syncableSettings(useSettingsStore.getState());
    lastPushedSyncable = JSON.stringify(slice);
    await pushSettings(slice as Record<string, unknown>);
  }
}
```

- [ ] **Step 7: Run test + typecheck**

Run: `npx vitest run src/app/settingsCloud.test.ts` → expected PASS (3 tests).
Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/settingsStore.ts src/app/settingsCloud.test.ts
git commit -m "feat(cloud): settings store cloud mirror (push + hydrate/seed)"
```

---

## Task 4: App — hydrate cloud settings on activation

**Files:**
- Modify: `src/App.tsx`

(No unit test — App effect is integration; the logic is unit-tested in Task 3.)

- [ ] **Step 1: Import the hydrate function**

In `src/App.tsx`, add `hydrateSettingsFromCloud` to the existing settings-store import:

```ts
import { useSettingsStore, ACCENT_COLORS, hydrateSettingsFromDisk, hydrateSettingsFromCloud } from './app/settingsStore';
```

- [ ] **Step 2: Add the effect**

Immediately AFTER the existing Cloud-mode focus-refresh effect (the one that adds the `window` `focus` listener), add:

```tsx
  // On cloud activation, pull the subscriber's categories + settings from the
  // cloud (and seed an empty cloud from local). No-op in local mode.
  useEffect(() => {
    if (!isCloudMode()) return;
    void hydrateSettingsFromCloud();
  }, [sessionId, cloudActive]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(cloud): hydrate cloud settings on activation"
```

---

## Task 5: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`
- Modify: `docs/BILLING_SETUP.md`

- [ ] **Step 1: Update the strategy roadmap**

In `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`, replace:

```markdown
- **P3b — cloud categories + settings sync:** ⏳ not started.
```

with:

```markdown
- **P3b — cloud categories + settings sync:** ✅ shipped to `main`. Subscribers'
  preferences + categories sync via a `user_settings` row (device-local sizing
  stays per-device). Requires migration `0007`.
```

- [ ] **Step 2: Note migration `0007` in `docs/BILLING_SETUP.md`**

In `docs/BILLING_SETUP.md`, change the migrations line under "## 1. Supabase" from:

```markdown
1. Apply the migrations: `supabase db push` — `0004` (profiles + RLS + signup
   trigger), `0005` (`show_in_upcoming`), and `0006` (event columns for
   spans/type/overrides/tasks). Cloud event sync needs `0006`.
```

to:

```markdown
1. Apply the migrations: `supabase db push` — `0004` (profiles + RLS + signup
   trigger), `0005` (`show_in_upcoming`), `0006` (event columns for
   spans/type/overrides/tasks), and `0007` (`user_settings`). Or just paste
   `supabase/full_setup.sql`. Cloud event sync needs `0006`; cloud settings sync
   needs `0007`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-business-model-strategy-design.md docs/BILLING_SETUP.md
git commit -m "docs: P3b done; migration 0007 in setup"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all pass (prior 402 + Task 2 (2) + Task 3 (3) = 407).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Local-mode smoke**

`npm run dev` with no Supabase env → settings/categories behave exactly as before
(`isCloudMode()` false → no cloud calls).

- [ ] **Step 4: (Human, live) Cloud smoke**

After applying `0007` and signing in as a `cloud_active` user: change a category
colour / theme on one device → it appears on another after reopening; the sidebar
width set on each device stays independent.

---

## Self-Review

**Spec coverage (against `2026-06-26-p3b-cloud-settings-sync-design.md`):**
- Syncable slice (prefs + categories; exclude 5 sizing fields) → Task 3 `syncableSettings` + test. ✓
- `user_settings` table + RLS → Task 1. ✓
- Push on change in cloud mode (deduped) → Task 3 `persist`. ✓
- Pull + merge (device-local kept) + seed on empty → Task 3 `hydrateSettingsFromCloud` + Task 4 wiring. ✓
- Local mirrors unchanged / free users unaffected → `persist` still calls `writeMirrors`; cloud gated by `isCloudMode()`. ✓
- Security (RLS, anon key, user is writer) → Task 1 policies. ✓
- Docs (roadmap, BILLING_SETUP, full_setup.sql) → Tasks 1 + 5. ✓

**Placeholder scan:** No TBD/TODO; complete code; commands have expected output. The live cloud smoke is a flagged human step (the in-repo code is unit-tested with a mocked Supabase).

**Type consistency:** `syncableSettings` returns `Partial<PersistedSettings>`; `pushSettings`/`pullSettings` take/return `Record<string, unknown>` (the jsonb blob). `isCloudMode` is the same predicate from P3a. `mergeSettings`/`serialize`/`writeMirrors`/`useSettingsStore` are existing settings-store members. The five excluded device-local fields match the spec (`sidebarWidth`, `sidebarSplit`, `tileScale`, `fontScale`, `minimapSize`).
