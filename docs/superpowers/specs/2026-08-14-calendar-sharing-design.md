# Calendar Sharing — Design

- **Date:** 2026-08-14
- **Status:** Implemented (both phases). Setup steps in
  [`docs/SHARING_SETUP.md`](../../SHARING_SETUP.md). Not yet verified against a
  real shared calendar or a live Supabase project — see "Verification owed".
- **Type:** Feature — let a user share their calendar with family, scoped by
  category or per event, and read/edit calendars others share with them.
- **Roadmap:** Phase 1 (free, CalDAV) is standalone and ships first. Phase 2
  (Cloud sharing) builds on it and is the first genuinely new paid capability
  since P3a–P3d.

## Goal

Two things the user asked for, which turn out to be different features:

1. **Receiving** — *"my family shares a calendar with me; I want to see it, and
   sometimes reschedule a doctor's appointment so they see the change too."*
2. **Sending** — *"I want to share my events with my family — sometimes
   everything, sometimes only certain categories, sometimes one specific event."*

Receiving is already 90 % built and costs nothing to run. Sending, at the
granularity asked for, cannot be expressed in CalDAV at all and needs the hosted
backend.

## Tiering: what is free and what is paid

**Free (Phase 1) — "Subscribed calendars."** If your family shares a calendar
through Google or Apple, connect that account and it appears in Open Calendar.
Read it, and — where the share grants write access — edit it, with changes
flowing back to the owner. No subscription, no account with us.

**Cloud (Phase 2) — "Sharing."** Share *from inside Open Calendar*: pick which
categories go in a share, override it per event, send a link. Requires an active
`cloud_active` subscription for the **sharer only**.

### Why the paid tier is better than the free one

The free tier lets you *receive* what Google and Apple already know how to send,
and it shares at their granularity: a whole calendar, to a whole person, all or
nothing. To share only your work schedule with a colleague you would have to
create a second calendar in Google, move the right events into it by hand, and
keep doing that forever — and to share one single event there is simply no
mechanism at all. It also only works on the desktop app, because CalDAV cannot be
called from a browser, and it only works if everyone involved is inside the same
ecosystem and already owns a Google or Apple account. Cloud sharing removes every
one of those limits: you tick which of your existing categories belong in a share
and it stays true forever as you add events, you override any single event in
either direction from the event itself, you send a link to anyone regardless of
which calendar app or ecosystem they use — or whether they have one at all — and
it works in the browser and on your phone, where CalDAV never will. The free tier
is a window someone else has to build for you; the paid tier is a door you
control, and you never have to leave the app to open it.

That framing matters commercially: we are not paywalling family sharing. We
support it free and handle it better than most clients. We charge for the parts
Google and Apple genuinely do not do.

### Who pays in Phase 2

The **sharer** needs Cloud. Recipients view and (when granted) edit for free.

- Recipients are the funnel — every share puts the app on a family member's
  screen with real data in it.
- A household at $2/head does not convert; at $2/household it does.
- It does not leak free cloud storage. Migration `0009` gates writes on
  `cloud_active` for rows the user **owns**. A free recipient still cannot sync
  their own calendar without subscribing. The anti-abuse property holds.

Cap members per share (10) so shares cannot be repurposed as shared storage.

---

# Phase 1 — Free: subscribed calendars (CalDAV)

## What already works

`CalDavClient.discover()` walks `current-user-principal` →
`calendar-home-set` → Depth-1 listing. Both iCloud and Google place calendars
*shared with you* into that home set once you accept the invite, so they are
already discovered and enabled.

Write-back already routes correctly. `MultiCalendarRepository.load()` records the
`href` each event came from and tags the event with its calendar URL; `saveAll()`
PUTs to that same `href`. So editing an event that lives on Anna's shared
calendar updates **Anna's** copy on the server. The reschedule case works today.

## What is broken

Four defects, all latent right now and all made worse by shared calendars:

1. **No read-only detection.** Discovery requests `displayname`,
   `resourcetype` and `supported-calendar-component-set` — not
   `current-user-privilege-set`. A read-only share is indistinguishable from an
   owned calendar, so every write attempt 403s and the sync retries it forever
   with no actionable message.

2. **A shared calendar can become the default write target.**
   `accountDefaultUrl()` falls back to the account's *first enabled* calendar,
   and discovery enables everything it finds. New private events can therefore be
   created on someone else's calendar. This is a privacy leak, not just a bug.

3. **Foreign events get replicated into the user's own accounts.**
   `CalDavAccountStore.saveAll()` assigns its account's default calendar to any
   event that has no calendar in that account. With both Apple and Google
   connected, every event on Anna's Apple-shared calendar is copied into the
   user's Google account. Correct for the user's own events; wrong for
   someone else's.

4. **Deletion is one careless click.** Delete-wins plus write access means
   deleting locally removes the event from the owner's calendar for everyone.

## Design

### Discovery reports ownership and privileges

`CalendarInfo` gains three fields, filled from two extra PROPFIND props
(`current-user-privilege-set`, `owner`):

```ts
export interface CalendarInfo {
  url: string;
  displayName: string;
  /** No DAV:write / write-content privilege — never PUT or DELETE here. */
  readOnly: boolean;
  /** DAV:owner is a principal other than the connected account. */
  shared: boolean;
  /** Owner principal href, when the server reports one (for the UI label). */
  owner?: string;
}
```

**Absent privileges mean writable.** Not every server returns
`current-user-privilege-set`; defaulting those to read-only would break writes
for existing users. Only an explicitly returned privilege set *without* write is
treated as read-only.

`shared` is likewise best-effort: true only when the server reports an `owner`
that differs from the connected principal. A server that reports neither yields
`shared: false`, which is exactly today's behavior — so nothing regresses.

These flags are persisted on `CalDavCalendarConfig` so the rest of the app can
read them without re-running discovery.

### Foreign events are tagged at the source

`CalendarEvent` gains two derived fields:

```ts
/** Display name of the calendar this event lives on, when it is not the
 *  user's own. Presence means "someone else owns this". */
sharedFrom?: string;
/** The event's home calendar refuses writes. */
readOnly?: true;
```

`MultiCalendarRepository` receives the per-calendar flags and tags events as it
loads them. Everything downstream keys off the tags rather than re-deriving
ownership:

| Component | Rule |
|---|---|
| `MultiCalendarRepository.saveAll` | Never PUT or DELETE an event marked `readOnly`. |
| `CalDavAccountStore.saveAll` | Never assign the account default to an event marked `sharedFrom` — a foreign event belongs to its own calendar or nowhere. |
| `UnifiedRepository` | Foreign events are not written to Supabase (they are not the user's rows to store). |
| Local store | Persists them, tags intact, so they survive offline. |

### Baseline accounting

The sync engine infers a deletion from *"the baseline says store S held this and
S no longer does."* Since stores now legitimately skip events, the baseline must
record what each store **actually holds**, not what it was asked to hold.

`UnifiedRepository.saveAll` already has this shape for tasks
(`!(s.kind === 'caldav' && e.isTask)`). The predicate generalises to a single
`storeHolds(store, event)` helper covering tasks, read-only events and foreign
events. This is the highest-risk change in Phase 1 and is built test-first: a
wrong predicate here resurrects or destroys real events.

### UI

- **Settings → Calendars:** shared calendars carry a label (`Shared · read-only`,
  or `Shared` when writable) and their *Default* radio is disabled.
- **Event editor:** read-only events open in a non-editable state with a note
  saying which calendar they belong to. Writable shared events edit normally,
  with the owning calendar shown.
- **Delete:** deleting an event that lives on someone else's calendar asks first,
  naming the calendar, because the deletion propagates to the owner.

## Out of scope for Phase 1

Creating a share from inside the app. Apple exposes no public sharing API at all,
and Google requires the Calendar ACL API — a different surface from the CalDAV
sync path, with its own consent scope. Users set shares up in Google's or Apple's
own UI; we consume them.

---

# Phase 2 — Cloud: sharing from inside the app

## The primitive

One concept covers all three granularities the user asked for. A **share** is an
audience plus a scope:

```
share := { id, owner, name, scope, detail, members[] }
scope := all | categories[…] | manual
```

- *"Share everything with family"* → `scope: all`
- *"Share only these categories"* → `scope: categories`
- *"Share this one event"* → a per-event override on top of either

Per-event overrides live on the event and work in both directions: pull one event
into a share it would not otherwise be in, or hold one back from a share it would.

```ts
/** Share ids this event is explicitly added to, beyond scope. */
shareInclude?: string[];
/** Share ids this event is explicitly withheld from, despite scope. */
shareExclude?: string[];
```

### Chosen defaults

- **Invites are links with tokens.** No transactional email to build, pay for, or
  keep out of spam. The recipient opens the link, signs in free, and the share
  binds to their account. It is also the natural basis for public read-only links
  later.
- **Detail level is full, with a per-share "busy only" toggle.** Families want
  the address in the description; colleagues do not. One switch, not two systems.

## Schema sketch

```sql
create table public.shares (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  scope_mode  text not null check (scope_mode in ('all','categories','manual')),
  categories  text[] not null default '{}',
  detail      text not null default 'full' check (detail in ('full','busy')),
  token       text unique not null,
  created_at  timestamptz not null default now()
);

create table public.share_members (
  share_id  uuid not null references public.shares (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null check (role in ('viewer','editor')),
  joined_at timestamptz not null default now(),
  primary key (share_id, user_id)
);
```

## The one thing that must not be done

**Do not widen the `events` SELECT policy to include shared rows.**

`SupabaseRepository.load()` and the MCP server both issue a bare `select('*')`
and rely entirely on RLS to scope the result. Widening the policy would silently
change what those existing queries return: other people's events would flow into
`UnifiedRepository`, be written to the local file, and be **pushed into the
user's connected iCloud and Google accounts**. Delete-wins would then let a
viewer destroy the owner's events.

Shared events must arrive through a **separate path** — a dedicated view or RPC —
be held in a sibling store, and be merged only at the render layer. They are
never a `SyncStore`. Only eight call sites read the events array, so a
`useVisibleEvents()` selector is a contained change.

## Known hazard: categories are mutable strings

A category is `event.type`, a bare string, and `renameCategory()` rewrites every
event that carries it. A category-scoped share therefore breaks silently on
rename — or worse, silently *starts* sharing the wrong events if the old name is
later reused for something else. Phase 2 must either introduce stable category
ids or make rename transactional across share scopes. The former is cleaner and
pays for itself elsewhere.

## Phase 2 as built

1. `supabase/migrations/0014_calendar_sharing.sql` — `shares`, `share_members`,
   the two event override columns, RLS, and four functions: `shared_events()`
   (the only cross-user read path), `join_share(token)`, `update_shared_event()`
   (the only cross-user write path), and the shared `event_in_share()` predicate.
2. `src/data/sharing/` — API layer. `src/app/shareStore.ts` (owned shares),
   `src/app/sharedEventsStore.ts` (received events, a sibling of the calendar
   store and never a `SyncStore`).
3. `src/app/visibleEvents.ts` — `useVisibleEvents()` / `useVisibleEvent()`, the
   only place the two sets meet. The four render views use it; the mutating
   views still read `useCalendarStore` so they can only act on the user's own set.
4. `src/features/sharing/` — Settings panel, per-event picker, link helpers, and
   `useSharing()` which redeems invite tokens and refreshes on focus.
5. Editor write-back routes through `update_shared_event`; deletion of someone
   else's event is refused with an explanation.

### Verification owed

Everything is covered by unit tests and typechecks, but two paths have never run
against real infrastructure and should be walked once before release:

- **A real CalDAV shared calendar** (Phase 1) — read-only and read-write, on both
  iCloud and Google. Confirms discovery actually reports `owner` and
  `current-user-privilege-set` the way the parser expects.
- **A live Supabase project** (Phase 2) — the end-to-end script in
  `docs/SHARING_SETUP.md` §4.

### Still open

- **Recipient-side management UI.** A recipient can join and leave via
  `leaveShare()`, but there is no screen listing the shares they have received.
  The API is there; the panel is not.
- **Member management.** `removeShareMember()` exists; the owner's UI shows a
  count, not a list of who joined.
- **Realtime.** Updates arrive on focus and reconnect, not live.
