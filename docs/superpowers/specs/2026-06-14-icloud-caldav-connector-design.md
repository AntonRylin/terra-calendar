# Spec 1 — iCloud CalDAV connector (free tier, desktop)

Date: 2026-06-14
Status: Draft for review

## Context

Open Calendar today has three **disconnected** stores, each chosen at build time by
`createRepository` ([src/data/createRepository.ts](../../../src/data/createRepository.ts)):
the Tauri desktop JSON file, the browser sync-server/localStorage, and Supabase
Postgres. There is no sync between editions, and no way to put events where a
user's *other* devices (phone, second PC) can see them.

We have agreed a **two-tier product model** (one codebase):

- **Free tier** — desktop app + MCP. Data lives locally or in the user's *own*
  calendar account; sync happens through that account. No servers we run.
  Funded by donations.
- **Paid tier** — hosted web app on Supabase that we run. Funded by subscription.

And a **sliced roadmap**: (1) this spec, (2) MCP gets the same connectors,
(3) Google OAuth connector, (4) offline editing, (5) paid tier polish.

This document specifies **slice 1 only**: a CalDAV connector targeting
**Apple iCloud**, selectable at runtime in the desktop app, with a local cache.
One connector proves the entire free-tier vision — two PCs pointed at the same
iCloud account sync through iCloud, and the user's iPhone shows the events
natively.

## Goals

- A new `CalDavRepository` implementing the existing `EventRepository`
  interface, so the calendar store and UI are unchanged.
- Connect to **iCloud** with an Apple ID + app-specific password (no OAuth, no
  server). The same code works for any standard CalDAV host (Nextcloud,
  Fastmail) for free, but iCloud is the only tested target in this slice.
- **Two-way CRUD**: read iCloud events into the app; create/update/delete from
  the app write back to iCloud.
- **Runtime backend selection** in Settings (desktop): choose *Local* or
  *iCloud account*. Switching re-initialises the calendar.
- **Local cache** so the app renders instantly and can **read offline**.
- Credentials stored in the OS keychain, never in plaintext app state or git.

## Non-goals (explicitly deferred)

- **Offline editing / conflict resolution** — v1 is *edit-online, read-offline*.
  Edits require a connection; the cache serves reads only. (Roadmap slice 4.)
- **Google** — needs OAuth; roadmap slice 3.
- **MCP** CalDAV support — roadmap slice 2 (this spec keeps the mapping/transport
  in modules the MCP can reuse, but wires nothing into the MCP yet).
- **Web edition over CalDAV** — browsers can't reach CalDAV (CORS); the web
  edition stays on Supabase. CalDAV is **desktop-only** here.
- **Per-event repository interface** — we keep the whole-list `saveAll` contract
  and diff inside the adapter (see Architecture). A future refactor to per-event
  ops is noted but out of scope.

## Architecture

### The impedance mismatch and how we handle it

`EventRepository.saveAll(events)` hands the adapter the **entire** event list on
every change ([src/app/store.ts:48](../../../src/app/store.ts)). Re-uploading
every event to CalDAV on each keystroke is unacceptable. The `CalDavRepository`
therefore keeps a **snapshot** of the last-known server state (id → {event, etag})
and, on `saveAll`, **diffs** the incoming list against the snapshot to issue only:

- `PUT` for new ids (with `If-None-Match: *`),
- `PUT` for ids whose event content changed (with `If-Match: <etag>`),
- `DELETE` for ids removed from the list (with `If-Match: <etag>`).

This keeps `EventRepository` and the whole UI untouched; all CalDAV complexity is
isolated in the adapter. The optimistic-update + rollback already in
`store.ts`'s `persist()` covers write failures (a failed PUT throws → rollback +
toast), which is acceptable for edit-online v1.

### Modules (new, under `src/data/caldav/`)

| Module | Responsibility | Depends on |
|---|---|---|
| `caldavClient.ts` | CalDAV protocol: principal/home/calendar **discovery**, `calendar-query` read, `PUT`/`DELETE` write, `sync-collection` (or ctag/etag) refresh. Transport is **injected** (a `fetch`-like fn) so it's testable and so Tauri's native HTTP can be supplied. | injected transport |
| `icalMapping.ts` | Pure functions `eventToVEvent(CalendarEvent)` and `vEventToEvent(string)`. No I/O. | `ical.js` |
| `caldavCache.ts` | Persist/restore the snapshot (events + etags + sync-token) per account to local storage (Tauri fs/store), keyed by account. | Tauri fs |
| `caldavRepository.ts` | Implements `EventRepository`: `load()` (cache-first, then refresh) and `saveAll()` (diff → writes). Orchestrates the three modules above. | the three above |

### Transport (Tauri, no CORS)

CalDAV uses non-standard verbs (`PROPFIND`, `REPORT`) and custom XML bodies.
The desktop app supplies **`@tauri-apps/plugin-http`** as the injected transport
(native request, bypasses browser CORS). XML is parsed with the webview's
`DOMParser`. **Early spike required** (see Risks): confirm the Tauri HTTP plugin
permits `PROPFIND`/`REPORT` and custom request bodies; if a third-party CalDAV
lib (`tsdav`) accepts our transport cleanly we use it, otherwise we hand-roll the
~5 requests we need.

### Data mapping (`CalendarEvent` ↔ `VEVENT`)

| CalendarEvent | iCalendar | Notes |
|---|---|---|
| `id` | `UID` + resource href `<UID>.ics` | our UUID is the UID |
| `title` | `SUMMARY` | |
| `description` | `DESCRIPTION` | |
| `date` (all-day) | `DTSTART;VALUE=DATE` | no `DTEND` (1-day implied) |
| `date`+`time`+`tz` | `DTSTART;TZID=<tz>` | no `DTEND`/`DURATION` (we don't model end; zero-duration) |
| `recurrence {unit,interval}` | `RRULE:FREQ=WEEKLY\|MONTHLY\|YEARLY;INTERVAL=n` | |
| `exdates[]` | `EXDATE` | |
| `color` | `COLOR` (CSS3) | Apple UI may ignore per-event color |
| `showOnMinimap` | `X-OPENCAL-MINIMAP` | custom X- prop, round-trips |
| `showInUpcoming` | `X-OPENCAL-UPCOMING` | custom X- prop, round-trips |
| `createdAt` / `updatedAt` | `CREATED` / `LAST-MODIFIED` (+`DTSTAMP`) | `updatedAt` is the change signal |
| (per-event etag) | HTTP `ETag` | stored in cache, not on the event |

Lossiness is acknowledged and bounded: event **end/duration** isn't modelled (we
emit zero/implied duration); per-event color may not render in Apple's UI. These
do not affect the app's own behaviour.

### Read flow (`load()`)

1. Restore cache for the active account → return immediately (instant render,
   works offline).
2. In the background, refresh from the server: `sync-collection` with the stored
   sync-token if available, else a full `calendar-query`; fall back to
   ctag+etag diffing if the server lacks RFC 6578.
3. Map changed `VEVENT`s → `CalendarEvent`, update snapshot + cache, and push the
   merged list into the store (the store exposes an in-memory update path;
   `load()` resolves with the cache-or-fresh list and a later refresh updates
   state — exact wiring decided in the plan).

### Write flow (`saveAll(events)`)

1. Diff `events` vs snapshot → adds / updates / deletes.
2. Issue conditional `PUT`/`DELETE` via the client.
3. On success, update snapshot etags + cache. On `412 Precondition Failed`
   (remote changed under us), v1 surfaces a toast asking the user to reload
   (full conflict handling is slice 4).

### Settings & credentials

- New connection state (extend `settingsStore` or a small `connectionStore`):
  `{ kind: 'local' | 'caldav', caldav?: { username, serverUrl?, calendarUrl? } }`.
  The **password lives only in the OS keychain** (Tauri keychain/secure-storage
  plugin), referenced by account key — never in this store, never in git.
- Settings UI (desktop): pick *Local* or *Connect iCloud*; for iCloud, fields for
  Apple ID + app-specific password, a "Test connection" button (runs discovery),
  and a calendar picker if multiple calendars exist.
- `LocalApp` in [src/App.tsx](../../../src/App.tsx) reads the connection setting,
  builds the matching repository, and **re-inits** the calendar store when it
  changes. The Supabase `CloudApp` path is untouched.

## Error handling

- Discovery/auth failure → clear, actionable message ("check your app-specific
  password"); stay on Local until a connection succeeds.
- Network failure on `load()` → serve cache, show an "offline — showing cached
  events" indicator; reads succeed, writes are disabled/queued-as-failed.
- Write failure → existing optimistic rollback + toast.
- `412` on write → "this event changed elsewhere, reload" toast (no data loss:
  local change is rolled back).

## Testing

- `icalMapping.ts` — pure unit tests, including round-trip
  (`event → vEvent → event`), recurrence, exdates, all-day vs timed, the custom
  X- prop.
- `caldavRepository.ts` — unit tests with a **mock transport**: discovery, read,
  the diff logic (add/update/delete), conditional headers, `412` handling.
- `caldavCache.ts` — save/restore round-trip.
- Manual integration test against a **real iCloud account** (documented steps).
  Optional CI integration against a local Radicale container is a stretch goal.

## Build order within this slice (de-risk)

1. **Spike**: prove the Tauri transport can do `PROPFIND`/`REPORT` against iCloud
   and we can discover the calendar home. (Kills the biggest risk first.)
2. **Read-only**: discovery + `calendar-query` + mapping + cache → show iCloud
   events in the app (Local still default).
3. **Settings + runtime switch**: pick Local vs iCloud, keychain credentials.
4. **Write**: diff + conditional `PUT`/`DELETE`, `412` handling.

## Risks

- **Tauri HTTP plugin** may restrict CalDAV verbs/bodies → spike first; fallback
  is a minimal hand-rolled client or a Rust-side command.
- **iCloud quirks**: app-specific password required (2FA on); principal discovery
  has redirects; per-event color/X- prop support varies. Mitigated by ical.js +
  testing against a real account.
- **"Fast" expectation**: even this single connector is real work (transport,
  discovery, mapping, cache, diff). Slicing read→write keeps each step shippable.

## Open questions for the reviewer

1. Extend `settingsStore` or add a separate `connectionStore`? (Leaning separate,
   to keep credentials/connection concerns out of UI prefs.)
2. `ical.js` dependency acceptable, or prefer a hand-rolled minimal mapper for
   the small model? (Leaning `ical.js` for RRULE/TZID correctness.)
3. Keychain plugin choice (tauri-plugin-keyring vs stronghold vs OS-specific) —
   decide in the plan after checking what's already in `src-tauri`.
