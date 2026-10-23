# Custom Day Backgrounds — Images & Custom CSS — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorm)

## Goal

Let people decorate individual calendar days with **their own content**, beyond
the ~70 preset gradient cosmetics:

1. **Custom image** — e.g. a friend's photo on their birthday (added by file
   picker, drag-and-drop, image URL, or clipboard paste; auto-downscaled and
   stored as WebP).
2. **Custom CSS** — a pasted snippet (an animated gradient found online) *or* a
   no-code gradient built from controls.

This extends the existing special-day system (`specialDaysStore`,
`cosmetics.ts`, `SpecialDayHost`, `MonthGrid`) rather than replacing it, and
makes day styling **sync across devices** in the cloud (Supabase) edition.

## The mental model

A day's look is **one background source + any number of overlay effects + an
emoji badge + a repeat rule**:

- **Background (choose exactly one):** *None* · *Preset gradient* (existing
  `cosmetic`) · *Custom image* · *Custom CSS*. All paint the same "fill" layer,
  so they are **mutually exclusive** — the editor enforces one at a time.
- **Overlay effects (any number):** the existing `animations` (sparkles, snow,
  fireflies, wiggle, bounce, rainbow) layer *on top* of whatever background is
  chosen. Unchanged.
- **Emoji badge** + **Repeat** (once / weekly / monthly / yearly): unchanged.
  Yearly is what makes a birthday photo reappear automatically every year.

This generalizes the current "cosmetic + animations" model: `cosmetic` becomes
one of several background sources; `animations` stay as the overlay axis.

## Non-goals

- No changes to the overlay effects themselves, to emoji, or to recurrence
  semantics (`getSpecialDayForDate`).
- No image editing (crop/filters/focal point) in v1 — images render
  `background-size: cover` centered.
- No combining two background sources on one day (e.g. image *and* animated CSS).
- Custom CSS is **not** a hostile sandbox: it's the user's own machine and own
  account. The bar is "don't let me break my own app layout or silently phone
  home," not multi-tenant isolation.
- No real-time multi-device merge; sync uses the same last-writer-wins whole-list
  mirror the `events` table already uses.

---

# Phase 1 — The feature (local)

Fully usable on a single device; the data model is designed sync-ready so Phase 2
adds no migration churn.

## Data model — `src/app/specialDaysStore.ts`

Extend `SpecialDay`:

```ts
export interface DayImageRef {
  id: string;   // key into the image store (IndexedDB; Storage path in Phase 2)
  w: number;    // intrinsic px of the stored (downscaled) WebP
  h: number;
}

export type DayCustomStyle =
  | { kind: 'raw'; source: string }   // pasted CSS, verbatim
  | { kind: 'recipe';                 // no-code builder output (re-editable)
      gradient: 'linear' | 'radial' | 'conic';
      colors: string[];               // 2–5 hex stops
      angle: number;                  // degrees
      animation: 'none' | 'shift' | 'rotate' | 'pulse';
      speedSec: number };

export interface SpecialDay {
  id: string;
  date: string;                       // YYYY-MM-DD anchor (unchanged)
  cosmetic: string;                   // preset gradient id, '' = none (unchanged)
  animations: string[];               // overlay effects (unchanged)
  emoji: string;                      // (unchanged)
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly';
  image?: DayImageRef;                // NEW
  customStyle?: DayCustomStyle;       // NEW
  updatedAt?: string;                 // NEW (ISO) — sync ordering / future merge
}
```

- **Migration (`normalizeSpecialDay`):** default `image`/`customStyle` to
  `undefined`, `updatedAt` to `''` when absent; carry through if present. Old
  records keep rendering unchanged (extends the existing normalize that already
  migrated `animation` → `animations`).
- **Mutual exclusivity** lives in the editor (setting one source clears the
  others); a defensive **resolver** picks one if a record somehow has several.

### Background resolver — `src/core/dayBackground.ts` (pure, tested)

```ts
export type DayBackground =
  | { kind: 'none' }
  | { kind: 'cosmetic'; id: string }
  | { kind: 'image'; ref: DayImageRef }
  | { kind: 'css'; style: DayCustomStyle; scopeClass: string };

export function resolveDayBackground(sd: SpecialDay): DayBackground;
```

Precedence when more than one is set (shouldn't happen via UI): `image` >
`customStyle` > `cosmetic` > none. `scopeClass` = `cd-${sd.id}` (stable per
record, so recurring days share one compiled rule).

## Image store — `src/data/dayImageStore.ts` (IndexedDB)

Binary blobs go in **IndexedDB**, not localStorage (avoids the ~5 MB cap, stores
`Blob` natively, works identically in the Tauri webview and plain web). Object
store `day-images`, key = `DayImageRef.id`, value = `{ blob, w, h }`.

```ts
putImage(blob: Blob, w: number, h: number): Promise<DayImageRef>; // new uuid id
getImageUrl(id: string): Promise<string | null>;                  // memoized objectURL
deleteImage(id: string): Promise<void>;
hasImage(id: string): Promise<boolean>;
```

`getImageUrl` caches `id → objectURL` in a module map so a recurring image is
decoded once. Orphan cleanup: when a day's image is replaced/cleared/deleted,
`deleteImage` the old id (best-effort; a stray blob is harmless).

## Image import pipeline — `src/features/day-background/imageImport.ts`

All sources converge to a `Blob`, then one path:

```ts
// pure-ish: decode → downscale → re-encode WebP
async function processImage(input: Blob): Promise<{ blob: Blob; w: number; h: number }>;
```

- Decode via `createImageBitmap(input)`.
- **Downscale**: longest side → `MAX_EDGE = 512` px, preserving aspect (no
  upscaling). The dimension math is a pure function `fitWithin(w, h, max)` —
  unit-tested.
- Draw to a `<canvas>` and `canvas.toBlob(blob, 'image/webp', 0.82)`. A 4 MB
  photo becomes ~30–50 KB with no visible loss on a small tile.

Source adapters (each returns a `Blob`, then `processImage` → `putImage`):

- **File picker** — `<input type="file" accept="image/*">`.
- **Drag-and-drop** — a drop zone in the modal reading `DataTransfer.files`.
  *Tauri note:* the webview may intercept OS file drops; resolve in
  implementation (handle Tauri's drag-drop event and/or set the window
  `dragDropEnabled` appropriately). Treated as an integration detail.
- **Clipboard paste** — `paste` event `clipboardData.items` image entries.
- **URL** — fetch bytes via the **Tauri HTTP plugin** (`@tauri-apps/plugin-http`,
  already a dependency) to avoid CORS canvas-tainting; web fallback uses `fetch`
  with `crossOrigin` best-effort. We store a local copy (the URL is not kept as a
  live remote reference — no re-phoning-home on render).

## Custom CSS — compiler + sanitizer — `src/core/dayCss.ts` (pure, tested)

The single source of truth that turns a `DayCustomStyle` into a safe, scoped
stylesheet string. Runs **at render time on every device**, so any source
(typed, builder, or synced) is sanitized identically.

```ts
compileCustomStyle(style: DayCustomStyle, scopeClass: string): string; // a <style> body
```

**Raw (`kind: 'raw'`):**
1. **Extract `@keyframes`** blocks from `source` (brace-counting scan, since
   there is no CSS-parser dependency). Remaining text = the declaration block.
2. **Rename** each keyframes name to `${scopeClass}-${name}` and rewrite
   `animation` / `animation-name` references in the declarations to match
   (prevents collisions across days).
3. **Sanitize the declaration block** (`sanitizeDeclarations`):
   - strip `position: fixed | sticky`,
   - strip `@import`, legacy `expression(`, `behavior:`, `-moz-binding`,
   - strip every `url(...)` (remote = privacy/phone-home; images have their own
     feature). *Open question:* allowlist `data:` for tiny inline SVG.
   - cap total length (e.g. 8 KB) and keyframes count (e.g. 8).
4. **Emit** `.${scopeClass}{<sanitized decls>}` + the renamed `@keyframes` rules.

**Recipe (`kind: 'recipe'`):** generate the declaration block + (for animated
types) one `@keyframes` from the spec, then go through the *same* emit/namespace
path. Examples: `shift` → `background-size:200% 200%` + position keyframes;
`rotate` → conic + `rotate` keyframes; `pulse` → `scale`/opacity keyframes.

**Containment (defense in depth):** the fill element is `position:absolute;
inset:0; overflow:hidden; contain: paint`, inside an already
`overflow:hidden` cell — so even a wild `transform`/oversize stays clipped to the
tile. `@media (prefers-reduced-motion: reduce)` pauses the animations.

## No-code builder

A `DayCustomStyle` of `kind:'recipe'` edited via controls: gradient type
(linear/radial/conic), 2–5 color stops (add/remove + color input), angle,
animation (none/shift/rotate/pulse), speed slider. Output runs through
`compileCustomStyle`; the recipe (not just compiled CSS) is stored so reopening
restores the controls.

## Rendering — `src/features/month-grid/MonthGrid.tsx`

- Compute `resolveDayBackground(specialDay)` per current-month cell.
- **Fill layer** (a `div.day-fill` behind the cell content, `z-index:0`):
  - `cosmetic` → existing `cosmetic-<id> cosmetic-<kind>` classes (unchanged
    path).
  - `image` → `style={{ backgroundImage: url(objectUrl) }}`, `background-size:
    cover; background-position:center`. Object URLs come from a small
    **`useDayImageUrls(specialDays)`** hook that resolves `getImageUrl` into
    state (async; re-renders when ready).
  - `css` → the element gets the `cd-<id>` class; the compiled CSS is injected by
    a single **`<DayCustomStyleSheet>`** component (rendered once in MonthGrid)
    that maps active custom-CSS days through `compileCustomStyle` and emits one
    `<style>`. Recomputes when `specialDays` changes.
- **Legibility scrim** (mock A): for `image`/`css` fills, add a `div.day-scrim`
  (top+bottom dark gradient) under the date/events, and give the day number a
  `text-shadow`. Presets keep today's look.
- **Overlay effects + emoji badge:** unchanged; they already layer above the
  fill (`z-index` ordering: fill 0 → scrim 1 → content/effects 3).
- The minimap (which only does flat swatches) ignores image/css backgrounds, or
  shows the preset swatch only — no animation there.

## Editor UI

**Quick popover — `src/features/special-day/SpecialDayHost.tsx`:** keep the fast
path (preset Style selector, Effect pills, Repeat, emoji) and add a **"🎨 Custom
background…"** button that opens the studio modal. Choosing a preset clears
`image`/`customStyle`; choosing an image/CSS in the modal clears `cosmetic`. Same
preview-on-change + commit-on-close pattern the popover already uses.

**Studio modal — `src/features/day-background/DayBackgroundHost.tsx` (new):**
a roomier panel with a large **live-preview tile** and three tabs:

- **Image** — drop zone + Choose file / From URL / Paste; shows the current image
  with a Remove button.
- **Builder** — the no-code recipe controls.
- **Code** — a single textarea (paste declarations + `@keyframes`), with the
  "scoped / keyframes renamed / url() stripped" reassurance line and live
  preview / error surfacing.

`uiStore` gains a `dayBackgroundEditor: { date } | null` slot + open/close
actions, mirroring `specialDayEditor`.

## Phase 1 testing

- **Pure units (vitest):**
  - `dayCss`: keyframe extraction + renaming + reference rewrite; sanitizer
    strips each dangerous construct and all `url()`; length/count caps; recipe →
    CSS for each animation type.
  - `dayBackground`: resolver precedence + none case.
  - `imageImport.fitWithin`: downscale math (landscape/portrait/already-small).
  - `specialDaysStore.normalizeSpecialDay`: new fields default + carry-through;
    legacy records still normalize.
- **Manual (preview):** add an image via each source; paste the classic animated
  gradient; build one in the Builder; combine a background with effects + emoji +
  yearly recurrence; clear/remove; confirm the date stays legible over a photo.

---

# Phase 2 — Sync (cloud / Supabase edition)

Active only when `getBackend() === 'supabase'` and signed in. In the local
edition, day styling stays localStorage-only (as today) and the toggles below are
hidden — there is no cross-device channel for app metadata there.

## Schema — `supabase/migrations/0003_special_days.sql`

A `special_days` table mirroring `SpecialDay`, following the `events` table's
conventions exactly (client-generated UUID PK, `user_id default auth.uid()`,
`created_at`/`updated_at`, and the same four per-command RLS policies scoping rows
to `auth.uid() = user_id`):

```
id uuid pk, user_id uuid, date text, recurrence text, emoji text,
cosmetic text, animations text[], image jsonb, custom_style jsonb,
created_at timestamptz, updated_at timestamptz
```
Index on `user_id`. RLS enabled with read/insert/update/delete policies copied
from `0001_init.sql`.

## Image blobs — Supabase Storage

- Private bucket **`day-images`**; object path `${userId}/${imageRef.id}.webp`.
- Storage RLS policies so a user can only read/write objects under their own
  `auth.uid()` prefix.
- **IndexedDB becomes a local cache; Storage is the source of truth.** On
  `putImage` (when image-sync is on) upload the blob. `getImageUrl`: if the id is
  not in IndexedDB, **download lazily from Storage** (only for days actually in
  view), cache it, then return the object URL.

## Repository — `src/data/specialDaysRepository.ts` (new)

Mirror the `EventRepository` pattern:

```ts
interface SpecialDaysRepository {
  load(): Promise<SpecialDay[]>;
  saveAll(days: SpecialDay[]): Promise<void>;   // whole-list mirror
}
```

- `LocalSpecialDaysRepository` — localStorage (today's behavior; also the offline
  cache).
- `SupabaseSpecialDaysRepository` — the `special_days` table; `saveAll` upserts
  all rows + deletes anything removed locally (a direct copy of
  `SupabaseRepository.saveAll`). Pure `fromRow`/`toRow` mappers (unit-tested).
- `createSpecialDaysRepository()` selects by `getBackend()` (mirrors
  `createRepository`).
- `specialDaysStore.init()`/`commit()` route through the repo; localStorage stays
  as the always-on offline cache. On supabase, `init` loads cloud rows and
  reconciles with the local cache by `updatedAt` (newer wins).

## Settings — `src/app/settingsStore.ts` + `src/features/settings/Settings.tsx`

Add to `PersistedSettings` (defaults **true**):

- `syncDayStyles: boolean` — sync the `special_days` metadata.
- `syncDayImages: boolean` — upload/download image blobs. Off ⇒ photos stay
  device-local while gradients/effects/emoji still sync.

Both toggles are hidden when `getBackend() !== 'supabase'`.

## Merge model

Last-writer-wins, whole-list mirror — identical to `events` today (the
`events` README already flags per-row merge as a future improvement). `updatedAt`
is stored now so a later per-row/Realtime merge needs no migration.

## Phase 2 testing

- `fromRow`/`toRow` round-trip mappers (pure).
- `LocalSpecialDaysRepository` round-trip.
- Manual: sign in on a second device, confirm styled days + images appear;
  toggle "Include images" off and confirm metadata still syncs while photos stay
  local; delete a styled day and confirm it disappears on the other device.

---

## Phasing summary

| Phase | Deliverable | Key files |
|------|-------------|-----------|
| 1 | Images + custom CSS + builder, rendered, local | `specialDaysStore`, `dayImageStore`, `imageImport`, `dayCss`, `dayBackground`, `MonthGrid`, `SpecialDayHost`, `DayBackgroundHost`, `uiStore` |
| 2 | Cross-device sync + settings toggles | `0003_special_days.sql`, Storage bucket, `specialDaysRepository`, `dayImageStore` (cloud), `settingsStore`, `Settings` |

## Open questions (resolve during implementation)

- `MAX_EDGE` (512?) and WebP quality (0.82?) — tune against real tile sizes /
  the existing `tileScale` zoom.
- Allow `data:` URLs in custom-CSS `url()` (for inline SVG patterns), or strip
  all? Default: strip all.
- Tauri drag-and-drop wiring (webview interception vs HTML5 DnD).
- Phase-2 reconciliation detail: pure `updatedAt` newer-wins vs. surfacing
  conflicts; default newer-wins to match `events`.
