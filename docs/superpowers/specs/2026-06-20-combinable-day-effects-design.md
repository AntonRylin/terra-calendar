# Combinable Day-Styling Effects — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm)

## Goal

In the special-day styling popover (opened via right-click on a day tile), the
**Effect** row currently behaves like a radio group: exactly one of Sparkles /
Snow / Fireflies / Wiggle / Bounce / Rainbow can be active, plus a "None" pill.

Make effects **combinable**, Apple-style: any number of effects can be selected
at once, each pill toggling independently.

## Non-goals

- No new effects are added.
- No changes to the Style (cosmetic/gradient) selector.
- No changes to recurrence.

## Data model — `src/app/specialDaysStore.ts`

- `SpecialDay.animation: string` → `SpecialDay.animations: string[]`.
  - Empty array = no effect (replaces the old `'none'` sentinel).
  - Example: `['sparkles', 'wiggle']`.
- **Migration on read (`init`):** when parsing `localStorage`, normalize each
  record:
  - legacy `animation: 'x'` (where `x !== 'none'`) → `animations: ['x']`
  - legacy `animation: 'none'` or missing → `animations: []`
  - drop the old `animation` key.
  Old saved days continue to render correctly with no user action.

## Selector UI — `src/features/special-day/SpecialDayHost.tsx`

- Form state: `const [animations, setAnimations] = useState<string[]>(...)`,
  seeded from `existingDirect?.animations ?? []`.
- **Remove the "None" pill** from the `EFFECTS` list. The empty-array state is
  "no effects"; the existing ↺ topbar button (`handleClear`) still clears
  everything (now `setAnimations([])`).
- Each pill toggles its id in/out of the array. A pill is `.selected` when its
  id is in `animations`. Any number can be selected simultaneously.
- Preview effect (`useEffect`): the "is this day special?" test becomes
  `cosmetic || animations.length > 0`; otherwise behaves as today.

## Rendering — `src/features/month-grid/MonthGrid.tsx`

- Replace the single `specialAnimationClass` with one class per selected effect:
  `animations.map(a => `animation-${a}`).join(' ')`.
- Particle overlays (Sparkles / Snow / Fireflies): change each
  `specialDay?.animation === 'x'` guard to `specialDay?.animations.includes('x')`.
  They render as separate overlay layers and stack naturally.
- Copy/paste style clipboard + every `hasStyle` / inherited-style check that
  references `animation`/`'none'` updated to use `animations` (`.length > 0`).

## CSS composition — `src/features/special-day/specialDay.css`

The only effects that conflict are **Wiggle + Bounce**, because both currently
animate the `transform` property of `.day-tile`, and two keyframe animations
cannot share `transform`.

Fix using CSS Transforms Level 2 **individual transform properties**, which
animate independently and compose natively:

- Wiggle `@keyframes` animate the **`rotate`** property (`-1.2deg → 1.2deg`)
  instead of `transform: rotate(...)`.
- Bounce `@keyframes` animate the **`translate`** property (`0 0 → 0 -4px`)
  instead of `transform: translateY(...)`.
- Add a combined rule so both animations run when both classes are present:
  ```css
  .day-tile.animation-wiggle.animation-bounce {
    animation: wiggle-anim 0.6s infinite ease-in-out alternate,
               bounce-anim 0.6s infinite ease-in-out alternate;
  }
  ```
  (Bounce stays `:hover`-gated as today — its standalone rule is unchanged in
  trigger; only the property it animates changes. The combined rule's bounce
  segment likewise keys off hover via a `:hover` variant if we keep that
  behavior — see Open question.)

Rainbow (`::after` border) and all particle overlays already compose with
everything; no change needed.

## Open question (resolve during implementation)

- **Bounce-on-hover vs. always:** Bounce currently only animates on `:hover`.
  When composed with always-on Wiggle, decide whether the combined tile bounces
  always or only on hover. Default: preserve current behavior — bounce segment
  hover-gated, wiggle always-on — via a `.animation-wiggle.animation-bounce`
  base rule (wiggle only) plus a `:hover` rule that adds the bounce animation.

## Testing

- Manual (preview): select 0, 1, and several effects on a day; confirm each
  renders and they stack. Verify Wiggle+Bounce compose (rotating lift), not
  fight.
- Migration: seed `localStorage` with a legacy `animation: 'snow'` record,
  reload, confirm it renders snow and the popover shows Snow selected.
- Clear (↺) removes all effects.
