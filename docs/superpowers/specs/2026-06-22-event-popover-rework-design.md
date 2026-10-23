# Event popover rework — reminders, calendars, account identity

Date: 2026-06-22
Status: Approved

## Goal

Make the event create/edit popover feel polished and intuitive. Three focus
areas, all visual/UX only — no data-model or sync changes:

1. **Reminders** — replace the bare dropdown-in-a-row list with compact
   removable pills plus a small "add" menu.
2. **Connected calendars** — group calendars by account, with a clear account
   header.
3. **Account identity** — show the real account email and the real brand logo
   (Apple / Google) instead of a generic right-aligned "Apple"/"Google" text tag.

## Constraints

- Surface area: `src/features/event-editor/EventForm.tsx`,
  `src/features/event-editor/eventEditor.css`, and a new
  `src/ui/brandLogos.tsx`. No changes to `connectionStore`, the repositories,
  the sync layer, or `EventFormValues`.
- The form's output (`onChange` / `onSubmit` payload) is byte-for-byte
  equivalent to today's for the same user input.
- Must remain Apple-clean and theme-token driven (light + dark), per the repo's
  UI memory. No hardcoded colors except inside the brand-logo SVGs (Google's
  brand colors are fixed; Apple's mark uses `currentColor` so it flips by theme).
- Calendars carry no per-calendar color in the data model
  (`CalDavCalendarConfig` has only `url`, `displayName`, `enabled`,
  `writeDefault`), so no color dots — checkbox + name only.

## Design

### Calendars — grouped by account (Direction A)

Today `enabledCalendars()` returns a flat list; each row renders a checkbox, the
name, and a muted `Apple`/`Google` tag on the right.

Reworked:

- Group the enabled calendars by account key `${provider}:${account}`,
  preserving first-seen order (Apple accounts before Google, matching
  `calendars()` order).
- Each group renders an **account header**: the real brand logo + the account
  email (`account` field, e.g. `me@icloud.example`).
- Under the header, each calendar is a row with an Apple-style custom checkbox
  (rounded square; accent fill + check glyph when on) and the calendar name. The
  right-aligned provider text tag is removed (brand now lives in the header).
- The whole block keeps the existing bordered `fieldset` container and "Calendars"
  legend.

Behavior is unchanged: `toggleCalendar` still enforces at-most-one selection per
account while allowing selections across accounts. Grouping only makes that rule
visually legible; it does not change selection logic.

### Reminders — pills + add menu (Treatment 1)

Today each reminder is a row: a preset `<select>`, optional custom number+unit
inputs, and an `×` remove button; a `+ Add` button appends a default 15-minute
reminder.

Reworked:

- Header: bell icon + "Reminders".
- Each saved reminder renders as a compact removable **pill** showing a
  human-readable label (`At time of event`, `15 min before`, `1 day before`,
  …) with a trailing `×`.
- Empty state: no italic "None" — just the dashed **"+ Add"** pill.
- The "+ Add" pill toggles a small dropdown anchored under it, listing presets:
  `At time of event`, `5 / 15 / 30 min`, `1 / 2 hours`, `1 / 2 days`, and
  `Custom…`. Presets already present are shown checked and disabled (dedup).
- Selecting a preset appends that reminder and closes the menu. Selecting
  `Custom…` appends a pill in **edit mode**: an inline number stepper + unit
  select (`min` / `hr` / `days`); once a value is set it reads as a normal pill.
  Clicking an existing custom pill re-opens its edit mode.
- The menu closes on outside-click / Escape.

Reminder label formatting (pure helper, unit-aware singular/plural):
- value `0` → `At time of event`
- minutes → `N min before`
- hours → `N hour before` / `N hours before`
- days → `N day before` / `N days before`

### Brand logos

New `src/ui/brandLogos.tsx`:

- `AppleLogo` — the Apple silhouette as inline SVG using `fill="currentColor"`,
  so the header text color (theme-aware) drives it. Default size ~14px.
- `GoogleLogo` — the four-color Google "G" as inline SVG with its fixed brand
  hexes (renders identically in light/dark, which is correct for that mark).
- Both accept an optional `size` prop and are `aria-hidden` (decorative; the
  email text carries the meaning).

A small `providerLogo(provider)` helper in `EventForm` picks the component.

## State changes in EventForm

- Add `addMenuOpen: boolean` for the reminders add-menu.
- Add `editingReminderIndex: number | null` so a freshly added Custom pill (or a
  clicked custom pill) shows its inline editor.
- `FormReminder`, the reminder handlers (`addReminder` becomes
  `addReminderPreset` / `addCustomReminder`), `removeReminder`, and the
  custom value/unit handlers are reused with minimal change.

No new props. No change to `EventFormProps` or `EventFormValues`.

## Testing

- Existing `EventCreateHost.test.tsx` / `EventEditorHost.test.tsx` /
  `EventForm`-touching tests must still pass; update any selector that depended
  on the old reminder `<select>` markup.
- Add coverage:
  - Reminder label helper (table of value/unit → label).
  - Add-menu: opening it, picking a preset adds a pill, already-added presets are
    disabled, removing a pill works.
  - Custom reminder: `Custom…` adds an editable pill; changing value/unit is
    reflected in the submitted payload.
  - Calendars: with two accounts connected, headers show each account email and
    calendars are grouped under the right header; toggling preserves the
    at-most-one-per-account rule.

## Out of scope

- Per-calendar color, reordering reminders, new reminder units, default-calendar
  management (that lives in Settings), and any sync/repository behavior.
