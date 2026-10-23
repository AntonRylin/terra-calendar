# Category management redesign — one editor, swatch gallery, live previews

Date: 2026-07-04
Status: **Shipped** (2026-07-04, branch `ui-rework`). Implemented per plan with
two small deviations: UpcomingStack had no cosmetic rendering of its own, so
the matched look lands on the card's dot (the category name chip already
follows `getCategoryStyle` live); the gradient drift uses a self-contained
`event-match-shift` keyframes in cosmetics.css instead of referencing the
upcoming-stack keyframes. Verified live: editor flow, premium try-on +
upsell (never persists), matched chip rendering in the month grid, dark
mode tokens, 375px mobile reflow, and 140% font-scale.

## Goal

Make category styling easy, simple, and pretty: nameless swatches (names on
hover), a saved library of custom gradients behind a `+` tile, live previews of
both the category and its events, and a one-switch way to keep events looking
exactly like their category. Also fix the structural problem that category
editing exists twice (a floating card in `Settings.tsx` and an older popover in
`CategoryEditorHost.tsx`) with drifting behavior.

## 1. One editor, two entry points

New shared component `src/features/category-editor/CategoryEditor.tsx` (+
`categoryEditor.css` reworked) renders the whole editing surface. Consumers:

- **Settings → Categories pane**: the pane *is* the manager. It shows the
  add-category row and the category list (unchanged behavior); clicking a
  category swaps the pane content to `<CategoryEditor category={name} />` with
  a back control in the pane header. The separate `categories-card` floating
  overlay and its ~250 lines of inline editing UI in `Settings.tsx` are
  deleted.
- **Chip double-click popover**: `CategoryEditorHost` keeps only its anchored
  popover shell and renders the same `<CategoryEditor>` inside (compact via a
  `variant="popover"` prop that tightens paddings and hides the upcoming-row
  preview). All duplicated editing JSX inside it is deleted.

Rename-on-type, auto-save-on-change, and reset-style behaviors carry over
unchanged from the current editors.

## 2. Editor layout (top to bottom)

1. **Preview strip** — two cards side by side, always live:
   - *Category*: the category name rendered with the current config (text
     gradient / solid), editable inline (contentEditable, Enter commits) —
     replaces the current big editable title.
   - *Event*: a fake event pill ("9:00 Team standup" style) plus an
     upcoming-row line with the category dot, rendered with the **effective
     event style** (matched category look, or the chosen cosmetic when
     unlinked). Popover variant shows the pill only.
2. **`Solid | Gradient` segmented control** (existing semantics).
3. **Swatch grid, collapsed**: 6 columns × 2 rows = 11 swatches + dashed `+`
   always last. No visible names; every swatch has a hover tooltip (and
   `title`/`aria-label`) with its name. Selected swatch gets an accent outline.
   Contents: user's custom gradients first, then presets, until 11 slots fill.
   Solid mode: 11 preset colors + `+` (opens the native color picker).
4. **See all designs ▾** — expands the grid in place into a grouped gallery:
   - *Your gradients* — saved customs; hover shows a small × to delete (with
     confirm if the gradient is in use by any category).
   - *Presets* — the 11 built-ins (existing 4 + 7 new: Grape Soda, Rose Gold,
     Deep Sea, Peach Glow, Northern Lights, Cherry Blossom, Midnight Violet;
     exact stops tunable at implementation).
   - *Premium designs* — the gradient-kind cosmetics from `COSMETICS`
     (Aurora, Sunset, Neon Rush, Nebula, Cyberpunk, …) rendered as swatches
     with a lock badge when not unlocked.
   - *Show less ▴* collapses back.
5. **Custom gradient flow**: `+` reveals an inline row — Start/End color
   pickers + a live gradient strip + **Save**. Save appends to the
   `customGradients` library (auto-named "Custom 1", "Custom 2", … — the name
   is only ever seen in tooltips), selects it, and collapses the row.
6. **Events match category** toggle (see §4), and when off, the existing
   `CosmeticSelector` row beneath it.
7. Footer: Reset style (existing), Done/close per surface.

## 3. Try-on semantics (premium preview)

Clicking any swatch updates the previews instantly. Free swatches also persist
immediately (auto-save, as today). Premium swatches apply to the previews only
(a transient "trying" state) with the lock badge echoed next to the preview;
persisting is blocked:

- Selecting another swatch discards the try-on.
- Closing/Done with a locked design still "on" shows the existing cosmetics
  upsell dialog (same `confirmChoice` flow used by `CosmeticSelector`, $3.99
  copy); decline reverts to the last saved config. Nothing locked is ever
  written to `CategoryConfig`.

## 4. Events match category

`CategoryConfig` gains `matchEvents?: boolean`.

- **On** (default for newly created categories): events in the category render
  with the category's exact solid color or animated gradient — the event style
  is *derived* from the category config at render time, so later category edits
  propagate automatically. This is **fully free**, including animated
  gradients (user decision; premium value stays in effects/glow/flashy
  cosmetics).
- **Off**: current behavior — the `cosmetic` field drives the default event
  style via `CosmeticSelector`, with existing entitlement gating untouched.
- Migration: configs with a truthy `cosmetic` and no `matchEvents` field are
  treated as `matchEvents: false`; configs with neither are treated as
  `matchEvents: false` as well (no visual change for existing users; the
  toggle only defaults on for categories created after this ships).
- Rendering: a new pure helper `getCategoryEventStyle(config)` in
  `settingsStore.ts` (or `core/`) returns the effective event style
  (matched-look CSS or the cosmetic id) and is used by the month grid and
  upcoming stack where per-category default event styling is resolved today.
  An event's own per-event cosmetic override still wins over both.

## 5. Data model & sync

- `CategoryConfig`: `{ type, value, color1, color2, cosmetic?, matchEvents? }`.
- New persisted settings field `customGradients: { name: string; color1:
  string; color2: string }[]` (empty default). Both live in the existing
  persisted settings slice, so localStorage/disk mirrors and cloud settings
  sync pick them up with no new plumbing. Free event sync is untouched
  (editions constraint).

## 6. Dark mode & screen sizes (hard requirements)

- **Dark mode**: every new element uses the existing theme tokens
  (`--color-surface`, `--color-border`, `--color-muted-bg`, `--color-text-*`,
  `--color-accent(-soft)`) — no hardcoded hexes outside the swatch fills
  themselves. Specifically verify in dark: swatch hairline borders remain
  visible against dark surfaces, hover tooltips use the popover surface +
  shadow, the lock badge and delete × stay legible, and preview cards sit on
  `--color-muted-bg` so light AND dark gradients read against them. White text
  on the event-pill preview must switch to the existing contrast-color helper
  (`getContrastColor`) for light solid colors.
- **Screen sizes**: the editor lives inside the fixed settings pane
  (scrollable) and the compact popover. The swatch grid uses
  `repeat(auto-fill, minmax(40px, 1fr))` capped at 6 columns so it reflows
  instead of overflowing at narrow widths (mobile settings stacks the nav; the
  pane can get ~320px wide). At <380px pane width the preview strip stacks
  vertically (category card above event card). The popover variant must fit
  within `min(92vw, 360px)` and remain fully usable at mobile widths, with the
  gallery scrolling inside the popover's max height. Hover tooltips have a
  touch fallback: long-press/`title` attributes (names are never required to
  operate the UI). Both surfaces respect the html-level `--font-scale` zoom
  (popovers must compensate per the existing convention).

## 7. Error handling

- Deleting a custom gradient that a category currently uses: confirm dialog;
  on confirm the category keeps its current colors (the config already stores
  color1/color2 — nothing dangles).
- Renaming to an empty/duplicate name: existing rename guards carry over.
- Premium try-on never persists (see §3), so a crash/close mid-try leaves the
  saved config intact.

## 8. Testing

- Unit: `getCategoryEventStyle` (matched vs cosmetic vs override precedence,
  migration defaults); custom gradient add/delete (incl. in-use delete keeps
  category colors); premium try-on never writes to the store; collapsed grid
  composition (customs first, 11 + `+`).
- Component: swatch click updates both previews; tooltip/aria names present;
  See all expands groups; `+` flow saves and selects; Match toggle reveals
  CosmeticSelector; popover variant renders via `CategoryEditorHost`.
- Manual: settings pane flow (list → edit → back), chip double-click popover,
  upsell dialog on locked save; full pass in BOTH light and dark themes; grid
  reflow + preview stacking at 320–400px pane widths and in the popover;
  `--font-scale` zoom at 80% and 140%.

## Non-goals

- No changes to per-event cosmetic overrides or the cosmetics purchase flow.
- No new premium SKUs; premium gallery entries reuse existing cosmetic ids.
- No category reordering/merging features.
- Mobile layout beyond what the settings pane/popover already provide.
