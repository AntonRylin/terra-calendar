# App UI rework — production-ready, consistent design language

Date: 2026-06-29
Status: **Shipped** (2026-07-02, branch `ui-rework`) — see outcome notes below.

## Outcome (what shipped vs the design)

All sections below were implemented. Deviations and additions:

- **Settings nav got icons + an account summary header** (avatar, email, plan) —
  added on user feedback during the build; the `AccountMenu` items got matching
  leading icons. All icons are inline stroke SVGs following the app's idiom.
- **Settings modal is a fixed 860×640 card** (capped at 92vw×86vh) with internal
  pane scrolling — user feedback; the design's `max-height` approach made the
  card resize per section.
- **`ExpandingSearch`** uses a single `open` state plus a CSS `:hover` rule
  (rather than separate hovered/focused state) — more robust against a
  clear-button blur race; behavior is the approved hybrid (hover or click
  expands, collapses only when empty and unfocused).
- **Layout dropdown hint keys (`C`/`M`) work while the menu is open**; global
  app-wide shortcuts remain deferred.
- **Minimap header controls were intentionally left as-is** — they already
  follow the quiet idiom (compact hover-reveal chrome); restyling them to 30px
  toolbar buttons would have broken their absolute-positioned layout for no
  visual gain.
- **Confirm dialog kept its stacked-modal structure** (larger tap targets are
  deliberate for destructive confirms); only its font weight was aligned to the
  shared 500.
- The weather glance renders only while weather & location are enabled.
- Deferred (unchanged from Non-goals): prev/next month chevrons, ⌘K command
  palette, new palette/rebrand.

## Goal

Make Open-Calendar's UI clean, consistent, and polished enough to sell. Today the
two main toolbars (the calendar month header and the Upcoming panel header) use
different idioms — text pills, mixed button shapes, two separate settings gears,
an always-open search box. This rework unifies everything onto one quiet,
Notion-flavored control language layered on the existing Apple-clean theme.

Direction chosen: **refine the current Apple-clean look** (not a rebrand) — lowest
risk, most consistent with what exists. See [[ui-apple-clean-themed]].

## Design language

One shared control vocabulary, used on every surface.

### Buttons
- **Text/labeled button** (`Continuous ▾`, `Today`): height 30px, padding `0 9px`,
  gap 5px, `border-radius: var(--radius-sm)` (6px), `font-size: 13px`,
  `font-weight: 500`.
- **Fill:** subtle gray — resting `background: var(--color-muted-bg)` with
  `border: 0.5px solid var(--color-border)`; hover steps one shade
  (`background: var(--color-surface)` in light / a touch lighter in dark). This is
  the Notion "soft gray button" look the user approved (subtle, not tinted).
- **Icon button:** 30×30px square, same radius/fill rules, icon 16–18px, centered.
- **Active/selected state:** `background: var(--color-accent-soft)`,
  `color: var(--color-accent)`.
- All icon-only buttons carry `aria-label` + `title`; tooltips never replace a
  visible label where a label adds clarity (lesson from review: icon-only controls
  failed to convey meaning, so primary actions are labeled).

### Controls
- **Dropdown selector** (Notion-style): a labeled button that names the current
  value and opens a popover menu. Each menu row = optional leading checkmark (18px
  slot) + label + right-aligned keyboard hint (`<kbd>`). Reused for the layout
  selector and any future pickers.
- **Stepper capsule** (zoom): one hairline-bordered capsule containing
  `[−] 100% [+]`, value centered with hairline dividers. Adjacent "fit" icon
  button.
- **Switch:** keep the existing `.ios-switch`, no change.
- **Popover:** `var(--color-surface)` bg, `0.5px solid var(--color-border-strong)`,
  `border-radius: var(--radius-md)`, `box-shadow: var(--shadow-popover)`, 6px inner
  padding, rows at `8px 10px` with `var(--radius-sm)` hover.

### Tokens
No palette change. The button fill reuses `--color-muted-bg`. Add two convenience
tokens to `src/ui/tokens.css` (both themes) only if needed during build:
`--control-h: 30px` and `--control-pad: 9px`, so every surface stays in lockstep.

### Shared primitives (new)
Extract the repeated markup into small, reusable components under `src/ui/`:
- `ToolbarButton.tsx` — labeled/icon button (variant: `text | icon`, `active`).
- `Dropdown.tsx` — the labeled selector + checkmark menu (built on the existing
  `AnchoredPopover`).
- `ZoomStepper.tsx` — the `− value +` capsule + fit button.
- `AccountMenu.tsx` — the avatar + dropdown account menu (new, see below).

These replace ad-hoc button markup so the "consistent across the whole app" goal
is enforced by reuse, not by copy-paste discipline.

## Surface-by-surface changes

### 1. Calendar toolbar (`MonthGrid.tsx` `.month-header`)
Final layout, left → right:
- `June 2026` title (year in `--color-text-secondary`).
- Quiet weather glance: small cloud icon + temperature (replaces the
  `📍 Location` text pill; clicking still opens the location dialog).
- Spacer.
- `Continuous ▾` layout selector (Notion dropdown, replaces the
  `Continuous | Months` text toggle).
- `Today` button (replaces `show today` / `showing today`; disabled-when-visible
  behavior preserved).
- Zoom stepper capsule + fit button (the "interface selector" — kept **visible**,
  just cleaned up; replaces the current `100% − +` cluster).
- Hairline divider.
- **Avatar** (account menu trigger) — replaces the gear (`CalendarsButton`).

Window controls (`WindowControls`) continue to render at the far right on desktop;
the toolbar remains the drag region.

Prev/next month chevrons (seen in the Notion reference) are **optional** and out of
scope for v1 unless trivially free — the calendar scrolls continuously today.

### 2. Layout selector (Notion dropdown)
`Continuous ▾` opens a menu with two rows: `Continuous` (checkmark when active) and
`Months`, each with a keyboard hint (`C` / `M`). Wire the shortcuts to
`setCalendarViewMode`. Built with `Dropdown.tsx`.

### 3. Zoom control
Replace the inline zoom buttons with `ZoomStepper.tsx`: `[−] 100% [+]` capsule +
fit button. Same handlers (`setTileScale`, `setTileScaleAuto`), same 50–150% range.

### 4. Search — lupa in the Upcoming header (`UpcomingStack.tsx`)
Search stays in the Upcoming section (confirmed). Convert the always-open
`upcoming-search` input into a collapsing lupa:
- Resting: a 30px lupa icon button.
- Expands to the input on **hover OR focus/click** (`A + B hybrid`): width animates
  ~190px, input gains focus on click.
- Collapses on blur/mouseleave **only when empty**; stays open while it has a value.
- Clear (`×`) button appears when there's a query. Existing `view.query` state and
  filtering are unchanged — only the chrome changes.

### 5. Avatar account menu (`AccountMenu.tsx`, new)
The avatar (initials, or photo if available) opens a dropdown menu:
- Header: avatar + email + plan label (Free / Cloud).
- `Settings` → opens the full settings window (Account tab).
- `Calendars` → opens settings on the Calendars section.
- `Dark mode` quick toggle (switch) → `setTheme`.
- `Upgrade to cloud` (only when not subscribed) → existing checkout flow.
- `Sign out` (only when signed in) → `signOut`.
This **replaces both gears** — the month-header gear (`CalendarsButton`) and the
app-level settings entry. The Upcoming panel's own view-settings button (group
by / sort / filter) is panel-local and stays, restyled to the icon-button language.

### 6. Settings — left sidebar nav (`Settings.tsx`)
Restructure the single long scrolling `.settings-card` into a two-pane layout:
- **Left nav** (~172px): avatar/account summary at top, then sections —
  `Account`, `Calendars`, `Appearance`, `Categories`, `Weather & grid`, `Minimap`,
  `Data`. Active row uses the accent-soft active state.
- **Right pane:** the selected section's content (existing controls, regrouped).
- Replace the `SettingsPanel = 'minimap' | 'calendars'` model with a section id
  per nav item: `'account' | 'calendars' | 'appearance' | 'categories' |
  'weather' | 'minimap' | 'data'`. `openSettings(section)` selects the starting
  section; the minimap entry still works (opened from the minimap header).
- Content is regrouped from today's stacked sections — no settings are removed,
  only relocated under the matching nav item. The Account section gets the
  sign-in/Supabase + Apple/Google connect UI currently mixed into `calendars`.

### 7. Consistency rollout (whole app)
Apply the shared primitives and button language to remaining surfaces:
- **Upcoming header:** icon buttons (search lupa, filter, add) on the shared
  icon-button style; panel view-settings button restyled.
- **Popovers** (filter/sort, move-recurring, delete-choices, day popover): adopt
  the shared popover styling + button language.
- **Event / task / span editors:** primary/secondary action buttons adopt the
  button language (primary = accent, secondary = gray); inputs already themed.
- **Minimap / year-circle header:** controls restyled to match; minimap settings
  still reachable.
- **Mobile:** the tab bar stays; toolbars collapse to icon buttons + avatar. The
  lupa, dropdown, and account menu must work with tap (hybrid search already does).
  Respect `--font-scale` for any new popovers/overlays per
  [[font-scale-zoom-coordinate-spaces]].

## Non-goals (v1)
- No new color palette or rebrand.
- No command palette (⌘K) — search stays inline in Upcoming.
- No prev/next month chevrons unless free.
- No change to event data, sync, or storage. Don't strip free event sync
  ([[editions-and-monetization]]).

## State / data changes
- `settingsStore`: broaden `SettingsPanel` → section ids; `openSettings(section)`.
- `AccountMenu` reads `useAuthStore` (session), `useEntitlementStore` (plan), and
  `useSettingsStore` (theme).
- No persistence schema changes.

## Testing
- Unit: search expand/collapse logic (expands on hover+focus, collapses only when
  empty); layout-selector keyboard shortcuts; settings section routing.
- Component (Testing Library): avatar menu opens, items dispatch correct actions;
  settings nav switches sections.
- Manual (Tauri desktop + web + mobile width): toolbar alignment, drag region,
  window controls, dark mode, `--font-scale` zoom on popovers.

## Phasing
1. Shared primitives (`ToolbarButton`, `Dropdown`, `ZoomStepper`) + tokens.
2. Calendar toolbar: layout selector, Today, zoom, weather glance.
3. Avatar + `AccountMenu`; remove month-header gear.
4. Search lupa in Upcoming.
5. Settings sidebar-nav restructure (incl. Account section + store change).
6. Consistency rollout to popovers, editors, minimap, mobile.

Per [[update-docs-thoroughly]], update any UI/setup docs and the roadmap as these
land, marking done vs deferred.
