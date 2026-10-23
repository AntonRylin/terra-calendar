# P3b — Cloud Categories + Settings Sync Design

- **Date:** 2026-06-26
- **Status:** Approved (design); ready for implementation plan
- **Type:** Cloud sync — sync a subscriber's categories + app preferences across devices.
- **Roadmap:** Second slice of P3. Depends on P3a (cloud mode + entitlement). Realtime/images/iCloud-mirror = P3c.

## Goal

For **subscribers** (signed in + `cloud_active`), categories and app preferences
sync across devices via Supabase — fixing the original "category cosmetics lost on
another device" problem. **Free / non-subscriber** users are unchanged: their
settings stay local (`localStorage` + `settings.json` + manual export/import), and
their *events* still sync via Google/Apple CalDAV. (Categories and settings cannot
ride CalDAV — it only carries events — so for free users they remain local.)

## What syncs

The store's `PersistedSettings`, split into two groups:

- **Synced (preferences):** `categories`, `theme`, `accentColor`, `minimapMode`,
  `minimapFilter`, `minimapRotation`, `monthLabelMode`, `customMonths`,
  `displayTimeZone`, `showUvIndex`, `showHourlyWeather`, `showWeatherIconOnDays`,
  `showClockOnToday`, `weatherAndLocationEnabled`, `calendarViewMode`, `showGrid`.
- **Device-local (NOT synced):** the sizing/layout numbers — `sidebarWidth`,
  `sidebarSplit`, `tileScale`, `fontScale`, `minimapSize`. These are
  physical-screen-specific (a phone's layout shouldn't follow a desktop's). The
  Apple-like rule: your *stuff and preferences* follow you; your *window sizing*
  doesn't.

`syncableSettings(s)` returns the synced subset; the device-local fields are never
sent to or applied from the cloud.

## Storage

A `user_settings` table — one row per user:

```sql
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,           -- the syncable settings slice (incl. categories)
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
-- Owner has full read/write of their own row (unlike profiles, the user IS the writer).
create policy "user_settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "user_settings_upsert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Ships as migration `0007` and is added to `supabase/full_setup.sql`.

## Mechanism (mirrors the events sync)

The settings store gains a **cloud mirror**, active only in cloud mode
(`isCloudMode()`):

- **Push on change:** `persist()` already writes the local mirrors
  (`localStorage` + `settings.json`); when in cloud mode it additionally upserts
  `syncableSettings(get())` to `user_settings` with a fresh `updated_at`
  (fire-and-forget; local mirrors stay the synchronous source of truth).
- **Pull on activation / open:** when cloud mode becomes active (session /
  `cloud_active` change), `hydrateSettingsFromCloud()` reads the user's row:
  - row exists → merge its `data` over the current settings (preferences only;
    device-local fields untouched), and refresh the local mirrors so they match.
  - row absent (empty cloud) → **seed** it from the user's current synced settings
    (first-activation, exactly like events).
- **Conflict:** whole-slice last-writer-wins by `updated_at`. Fine for one user's
  own devices; changes appear on the other device on next open/focus.

New module `src/data/cloudSettings.ts`: `syncableSettings(s)`, `pushSettings(slice)`,
`pullSettings()` — pure data access over Supabase, testable with a mocked client.
`settingsStore` calls them; `App.tsx` triggers `hydrateSettingsFromCloud()` on cloud
activation (alongside the existing events re-init).

## Security

RLS scopes `user_settings` to the owner via the anon key + JWT (no service-role).
Unlike `profiles`, the user IS the legitimate writer of their own settings, so
insert/update policies are present (scoped to `auth.uid() = user_id`).

## Reliability

- Local mirrors are unchanged, so a cloud push failing never blocks the UI (the
  setting is already saved locally). Pushes are best-effort fire-and-forget.
- Seed only fires on an empty cloud row (idempotent).
- Free/local users run exactly as before — the cloud path is gated by `isCloudMode()`.

## Components / files

- **Create** `supabase/migrations/0007_user_settings.sql`; add the table to
  `supabase/full_setup.sql`.
- **Create** `src/data/cloudSettings.ts` — `syncableSettings` / `pushSettings` /
  `pullSettings`. **Test** `src/data/cloudSettings.test.ts`.
- **Modify** `src/app/settingsStore.ts` — push on `persist()` in cloud mode; add
  `hydrateSettingsFromCloud()` (pull/merge/seed).
- **Modify** `src/App.tsx` — call `hydrateSettingsFromCloud()` on cloud activation.
- **Modify** docs: strategy roadmap (P3b done), `BILLING_SETUP.md` (apply `0007`).

## Testing

- `syncableSettings` includes the preference fields and excludes the five
  device-local sizing fields.
- `pushSettings` upserts the slice; `pullSettings` returns the row's `data` or null.
- Cloud hydrate: existing row merges (device-local untouched); empty row seeds.

## Out of scope

- Realtime settings updates (next open/focus is enough) → P3c.
- Per-field merge / device-specific overrides beyond the fixed device-local set.
- Day-background image sync → P3c.
