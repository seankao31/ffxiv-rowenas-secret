# Tailwind CSS + DaisyUI Migration

## Summary

Introduce Tailwind CSS v4 and DaisyUI 5 to the project, migrate all existing component styles from raw `<style>` blocks to Tailwind utility classes and DaisyUI component classes, and implement column header tooltips.

## Infrastructure

### Dependencies

- `tailwindcss` (v4) — utility-first CSS framework
- `@tailwindcss/vite` — Vite plugin (no PostCSS config needed)
- `daisyui` (v5) — Tailwind CSS component plugin

### Configuration

- Add `@tailwindcss/vite` to `vite.config.ts` plugins
- Create `src/client/app.css`:
  ```css
  @import "tailwindcss";
  @plugin "daisyui" {
    themes: night --default;
  }
  ```
  The `--default` flag is required or DaisyUI defaults to its light theme.
- Import `app.css` in `src/client/main.ts` — this must happen before any `<style>` blocks are removed, since the DaisyUI theme provides the base styles (body background, font, etc.) that replace the `:global(body)` rule in App.svelte.
- Define a custom `pulse-bright` keyframe in `app.css` for the StatusBar flash animation (see StatusBar section below).

No `tailwind.config.js` needed — Tailwind v4 uses CSS-first configuration.

## Theme

Use DaisyUI's built-in `night` theme as default. Color palette will be customized in a future pass.

## Component Migration

All 4 Svelte components will have their `<style>` blocks removed and replaced with inline Tailwind/DaisyUI classes.

### App.svelte

| Element | Current | Migration |
|---|---|---|
| Body background | `:global(body)` style | DaisyUI theme handles `base-100` |
| App layout | `.app` flex column | Tailwind flex utilities |
| Header | `.header` with custom bg/border | DaisyUI `navbar` or Tailwind bg utilities |
| Content wrapper | `.content` max-width centered | Tailwind `max-w-screen-xl mx-auto px-8` |
| Footer | Custom padding/colors | Tailwind text/color utilities |
| Cold start progress | `.progress-track` / `.progress-fill` | DaisyUI `progress` component |
| Messages | `.msg`, `.err` | Tailwind text utilities |

### StatusBar.svelte

| Element | Current | Migration |
|---|---|---|
| Normal bar | `.bar` with bg/padding | DaisyUI `alert` or Tailwind utilities |
| Stale warning | `.stale` yellow bg | DaisyUI `alert alert-warning` |
| Severe warning | `.severe` red bg | DaisyUI `alert alert-error` |
| Flash animation | `@keyframes pulse-bright` | Custom `@keyframes pulse-bright` + `@utility` in `app.css` (Tailwind's `animate-pulse` is an opacity fade, not a color flash) |

### ThresholdControls.svelte

| Element | Current | Migration |
|---|---|---|
| Panel wrapper | `.panel` with bg/border | Tailwind bg/border utilities (not DaisyUI collapse — it manages open/close state via HTML focus/checkbox, which conflicts with the existing Svelte `open` state) |
| Toggle button | `.toggle` | Tailwind utilities, keep Svelte `{#if open}` toggle logic |
| Controls layout | `.controls` flex wrap | Tailwind flex/gap utilities |
| Range inputs | Raw `<input type="range">` | DaisyUI `range` class |
| Number inputs | Custom styled | DaisyUI `input` class |
| Checkbox | Raw `<input type="checkbox">` | DaisyUI `checkbox` class |
| Select | Raw `<select>` | DaisyUI `select` class |

### OpportunityTable.svelte

| Element | Current | Migration |
|---|---|---|
| Table | Custom styled `<table>` | DaisyUI `table` class |
| Header row | Custom `th` styles | DaisyUI table styling |
| Data cells | Custom `td` styles | Tailwind text/padding utilities + `tabular-nums` for numeric alignment |
| Price lines | `.price-line` flex layout | Tailwind `flex items-baseline gap-2` |
| Alt lines | `.alt-line` secondary text | Tailwind text-sm/opacity utilities |
| Links | Custom link colors | DaisyUI `link` class |
| Tooltip icons (new) | N/A | DaisyUI `tooltip` component + inline SVG info icon |

## Column Tooltips

Add informational tooltips to 6 column headers: Sell, Profit/unit, Units, Comp, Vel, Gil/day. Uses DaisyUI's `tooltip` component class with an inline SVG info-circle icon.

See `2026-04-02-column-tooltips-design.md` for tooltip text content.

## Migration Strategy

1. Set up infrastructure (deps, config, css file)
2. Migrate components one at a time, removing `<style>` blocks
3. Add tooltips to OpportunityTable during its migration
4. Verify the app visually after each component
