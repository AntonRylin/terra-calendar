# Spec — Multi-account sync (Apple + Google together, modular write targets)

Date: 2026-06-18
Status: Implemented

## Context

The iCloud and Google connectors each replaced the whole repository, so only one
account could be connected at a time (local **xor** Apple **xor** Google). Users
want to **read from every connected calendar at once** and **write to a
customizable set** of them — e.g. one person mirrors new events to both Apple and
Google, another reads from both but only writes to Apple. Per-event overrides
should be possible too, selecting one *or several* calendars.

## Goals

- Connect **Apple and Google simultaneously**; read events from all enabled
  calendars, merged into one view.
- An event can live in **several calendars at once** (same UID replicated) —
  **but at most one per account**, since iCloud/CalDAV enforce UID uniqueness
  within a calendar home; replicating one UID across two calendars of the same
  account gets the second PUT rejected (HTTP 412). It appears once in the app and
  edits/deletes apply to every copy.
- A user-configurable **default write-target calendar per account** for new
  events, chosen in Settings (`Default` is exclusive within an account).
- A per-event **calendar picker** that starts from the defaults; selecting a
  calendar replaces any other already-picked one from the same account.

## Data model

`CalendarEvent.calendarUrl?: string` → **`calendarUrls?: string[]`** — the set of
calendar collection URLs the event is synced to. It is repository metadata, not
serialized to iCalendar: the repos set it on load (which calendars a UID was
found in) and read it on save (where to write). `CalDavCalendarConfig` gains
`writeDefault?: boolean`.

## Architecture

Two repositories replace the single-account `CalDavRepository`:

| Module | Responsibility |
|---|---|
| `data/multiCalendarRepository.ts` | **One account, many calendars per event.** `load` merges all enabled calendars and records, per UID, every calendar it appears in (`copies: calendarUrl → {href,etag}`). `saveAll` fans each event out to exactly `event.calendarUrls`: create in added calendars, update changed copies, delete copies from dropped calendars; delete every copy for removed events. Caches its snapshot per account (offline read). |
| `data/compositeRepository.ts` | **Many accounts.** `load` reads each account and **merges by UID**, unioning `calendarUrls` and keeping the latest-edited copy as canonical. `saveAll` assigns the configured defaults to new events, then **projects** each event onto every account (calendarUrls filtered to that account's calendars) and delegates — so each account prunes/fans out its own copies. |

`CalDavClient` (protocol), `icalMapping`, and the keychain/OAuth/transport layers
are unchanged and reused. `caldav/connect` and `google/connect` now expose
`buildAppleAccount` / `buildGoogleAccount` returning `{ client, config }`;
`createRepository.repositoryForAccount` wraps a client into a
`MultiCalendarRepository`, and `createRepositoryAsync` composes the connected
accounts into a `CompositeRepository` (falling back to local if none build).

## Connection state

`connectionStore` drops the single `kind` (legacy field ignored on load) and
holds `caldav?` and `google?` independently, with helpers: `isConnected`,
`calendars`/`enabledCalendars` (flattened across accounts, tagged by provider),
`defaultCalendarUrls` (flagged write targets, else the first enabled calendar so
new events always land somewhere), and `setCalendarEnabled` /
`setCalendarWriteDefault`. App re-inits the calendar when either account's
config changes.

## UI

- **Settings** lists every connected account; each calendar row has an *enabled*
  checkbox and a *Default* (write-target) checkbox. Connect buttons appear for
  whichever account isn't connected yet; disconnect is per-account.
- **Event editor** shows a multi-select calendar picker (grouped by provider)
  pre-filled with the event's calendars, or the defaults for a new event. New
  events created elsewhere (quick entry) inherit the defaults via the store.

## Testing

- `multiCalendarRepository.test.ts` — merge-by-UID across calendars; create in
  all, add/drop a calendar, delete-all-copies; offline cache fallback.
- `compositeRepository.test.ts` — merge across accounts (union urls, latest
  wins), projection/filtering, default assignment, empty-account pruning.
- `connectionStore.test.ts` — simultaneous connect, independent disconnect,
  flattening, default resolution, per-calendar toggles, legacy `kind` ignored.
- Manual: connect Apple **and** Google, mark one Default **in each account**,
  create an event → appears once, exists in both accounts; toggle a calendar off
  → hidden; edit the per-event picker to move an event across calendars. Marking
  a second Default within one account must clear the first (one per account).
