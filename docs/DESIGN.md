---
version: alpha
name: Web Builder editor chrome
description: >-
  Quiet, dense pro-tool chrome for the Web Builder desktop app (Tauri 2 + React +
  shadcn/ui + Tailwind v4). Tokens mirror src/index.css; that file is the source
  of truth. Light values are the :root block; dark values (dark-*) are the .dark
  block. Covers the app's own UI only, not the pages users build.
colors:
  # Light (:root)
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.145 0 0)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.56 0.16 244)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "#6b6b6b"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.91 0 0)"
  input: "oklch(0.922 0 0)"
  ring: "oklch(0.62 0.15 242)"
  sidebar: "oklch(0.975 0 0)"
  sidebar-foreground: "oklch(0.145 0 0)"
  sidebar-primary: "oklch(0.56 0.16 244)"
  sidebar-primary-foreground: "oklch(0.985 0 0)"
  sidebar-accent: "oklch(0.97 0 0)"
  sidebar-accent-foreground: "oklch(0.205 0 0)"
  sidebar-border: "oklch(0.91 0 0)"
  sidebar-ring: "oklch(0.62 0.15 242)"
  chart-1: "oklch(0.87 0 0)"
  chart-2: "oklch(0.556 0 0)"
  chart-3: "oklch(0.439 0 0)"
  chart-4: "oklch(0.371 0 0)"
  chart-5: "oklch(0.269 0 0)"
  # Dark (.dark)
  dark-background: "oklch(0.17 0 0)"
  dark-foreground: "oklch(0.985 0 0)"
  dark-card: "oklch(0.205 0 0)"
  dark-card-foreground: "oklch(0.985 0 0)"
  dark-popover: "oklch(0.205 0 0)"
  dark-popover-foreground: "oklch(0.985 0 0)"
  dark-primary: "oklch(0.68 0.15 240)"
  dark-primary-foreground: "oklch(0.16 0.02 245)"
  dark-secondary: "oklch(0.269 0 0)"
  dark-secondary-foreground: "oklch(0.985 0 0)"
  dark-muted: "oklch(0.269 0 0)"
  dark-muted-foreground: "oklch(0.708 0 0)"
  dark-accent: "oklch(0.269 0 0)"
  dark-accent-foreground: "oklch(0.985 0 0)"
  dark-destructive: "oklch(0.704 0.191 22.216)"
  dark-border: "oklch(1 0 0 / 10%)"
  dark-input: "oklch(1 0 0 / 15%)"
  dark-ring: "oklch(0.68 0.15 240)"
  dark-sidebar: "oklch(0.2 0 0)"
  dark-sidebar-foreground: "oklch(0.985 0 0)"
  dark-sidebar-primary: "oklch(0.68 0.15 240)"
  dark-sidebar-primary-foreground: "oklch(0.16 0.02 245)"
  dark-sidebar-accent: "oklch(0.269 0 0)"
  dark-sidebar-accent-foreground: "oklch(0.985 0 0)"
  dark-sidebar-border: "oklch(1 0 0 / 10%)"
  dark-sidebar-ring: "oklch(0.68 0.15 240)"
typography:
  # --font-sans / --font-heading (same stack). Thai comes from system fonts; no Thai webfont is bundled.
  panel-caption:
    fontFamily: "'Geist Variable', 'Noto Sans Thai', 'Noto Sans Thai UI', 'Leelawadee UI', 'Thonburi', system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
  control:
    fontFamily: "'Geist Variable', 'Noto Sans Thai', 'Noto Sans Thai UI', 'Leelawadee UI', 'Thonburi', system-ui, sans-serif"
    fontSize: 12px
    lineHeight: 16px
  list-row:
    fontFamily: "'Geist Variable', 'Noto Sans Thai', 'Noto Sans Thai UI', 'Leelawadee UI', 'Thonburi', system-ui, sans-serif"
    fontSize: 13px
    lineHeight: 20px
  body:
    fontFamily: "'Geist Variable', 'Noto Sans Thai', 'Noto Sans Thai UI', 'Leelawadee UI', 'Thonburi', system-ui, sans-serif"
    fontSize: 14px
    lineHeight: 20px
  screen-title:
    fontFamily: "'Geist Variable', 'Noto Sans Thai', 'Noto Sans Thai UI', 'Leelawadee UI', 'Thonburi', system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 28px
  mono:
    fontFamily: "ui-monospace, 'SFMono-Regular', 'DejaVu Sans Mono', monospace"
    fontSize: 12px
    lineHeight: 16px
rounded:
  # --radius: 0.5rem; Tailwind radius-* are calc() multiples of it in @theme inline.
  sm: 0.3rem    # --radius * 0.6
  md: 0.4rem    # --radius * 0.8
  lg: 0.5rem    # --radius
  xl: 0.7rem    # --radius * 1.4
  2xl: 0.9rem   # --radius * 1.8
  3xl: 1.1rem   # --radius * 2.2
  4xl: 1.3rem   # --radius * 2.6
spacing:
  base: 4px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: 28px
  panel:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
  panel-caption:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.panel-caption}"
  layer-row-selected:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
    typography: "{typography.list-row}"
    height: 28px
  dark-button-primary:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-primary-foreground}"
    rounded: "{rounded.lg}"
    height: 28px
  dark-panel-caption:
    backgroundColor: "{colors.dark-sidebar}"
    textColor: "{colors.dark-muted-foreground}"
    typography: "{typography.panel-caption}"
---

# Web Builder editor chrome

Read this before generating or editing any UI in `src/components`, `src/pages`, or `src/components/ui`.
Sources: `src/index.css` (tokens), `docs/UI-REFRESH-SHADCN.md` (chrome spec), `docs/HANDOFF-PAUSE.md` (decisions log).
When this file and `src/index.css` disagree, `src/index.css` wins; update this file.

**Out of scope:** project-level page tokens (colours/type for the pages users build) are not defined here; deferred (HANDOFF "Deferred: Project design tokens").

## Overview

A quiet pro tool: neutral chrome, hairline borders instead of shadows, dense 28px controls, one blue accent. The canvas page is the only bright "paper" surface. Thai-first copy (`<html lang="th">`); keep existing Thai labels word-for-word. Low resource use is a hard rule: initial JS ≈ 112 kB gz, so new UI goes into lazy chunks; no new animation, icon, or UI packages.

## Colors

- Use the semantic Tailwind classes (`bg-background`, `bg-sidebar`, `text-muted-foreground`, `border-border`, `ring-ring` …). Never hard-code hex/oklch in chrome components.
- **Blue is reserved** for selection, focus, and the primary action: `primary` (primary buttons such as สร้างโปรเจกต์ and a dirty บันทึก, FieldRow override dot), `ring` (focus, used at `/50`), `sidebar-primary` (selected row inset bar). Exception: a `ring`-blue hover is allowed on the pane resize handle and on slider thumbs (focus-type affordances). Nothing else is blue.
- `accent` / `sidebar-accent` are neutral **hover/selected surfaces**, never a brand colour.
- Active toggles (mode switch, segmented fields): `bg-background` chip on a `bg-muted` track, `text-foreground`. No accent fill.
- `destructive` for delete and errors; success stays `text-emerald-600` in toasts. No other hues.
- Panels use `sidebar`; top bar and dialogs use `background`; panes are split by 1px `border`.
- `chart-*` exist but are unused.
- `muted-foreground` light is `#6b6b6b` (changed from `oklch(0.556 0 0)` in the 2026-10 polish batch to reach 4.5:1 on `sidebar`/`muted`).
- **Contrast:** all text ≥ 4.5:1 (WCAG AA) against its actual surface, in light and dark. Check muted text on `sidebar` and `muted`, not only on white.
- **Canvas stays light in dark mode.** The design page card carries `.theme-light` (re-declares the light tokens); Preview renders a white iframe. Never let user content go dark.
- Canvas selection/drop outlines in `node-view.tsx` are hard-coded `sky-*` on purpose (canvas, out of chrome scope); `primary` is tuned to sit next to them.

## Typography

- One stack: `font-sans` (Geist Variable, then system Thai fonts). Mono fields (hex, href, asset id) use `font-mono`. Do not bundle a Thai webfont or Geist Mono.
- Scale: caption 11px/16 `text-[11px] font-medium text-muted-foreground` · controls 12px `text-xs` · rows/menu items 13px `text-[13px]` · body 14px `text-sm` · screen title 18px `text-lg font-semibold`.
- **Minimum 11px for any Thai or chrome text.** Never `text-[10px]` or smaller.
- No `leading-none` on Thai (tone marks clip); minimum `leading-4` at 11–12px.
- No `uppercase` / `tracking-wide` on Thai captions; use `font-medium` + muted colour.

## Layout

- 4px base. Lists `px-2`, forms `px-3`, field rows `space-y-2`, sections `border-t py-2`.
- Heights: top bar 44px (`h-11`), buttons/fields/rows/menu items 28px (`h-7`), panel header 32px (`h-8`), icon buttons in panels 24px (`size-6`). Hit targets never below 24px.
- No menubar (PM call; the Ctrl/Cmd+K command palette and the visible search field carry those actions). Top bar must stay one row at the 960px window minimum.

## Elevation & Depth

- **No shadows on chrome surfaces**: panes, top bar, panels, rows, toolbars, controls. Separate with 1px borders.
- Exceptions already in the spec (UI-REFRESH §1.6): floating layers keep shadcn defaults (popover/menu/select `shadow-md`, dialog `shadow-lg`), and the canvas page card keeps `shadow-sm` because it is the paper, not chrome. Also allowed: `shadow-sm` on selected toggle chips (`data-[state=on]:shadow-sm`) and on Preview device frames. The selected-row inset bar uses `shadow-[inset_2px_0_0_var(--sidebar-primary)]` as a border technique, not elevation.
- No blur backdrops. Dialog overlay `bg-black/20` light, `bg-black/50` dark.

## Shapes

- `--radius: 0.5rem`. Buttons/inputs `rounded-lg`, rows/toggles `rounded-md`, swatches/kbd `rounded-sm`, cards/dialogs `rounded-xl`. Do not change radii per component; change the variable.

## Components

- shadcn/ui primitives from `src/components/ui`, importing `cn` from `"cn"` and primitives from `"radix-ui"`. Add a primitive only when a spec names it.
- **Icons:** `lucide-react` named imports only, allowed in chrome (UI-REFRESH §1.8): 14px `size-3.5` in panels/rows/menus, 16px `size-4` in top bar and dialogs. No second icon pack. Icon-only buttons need a Thai `aria-label` + Tooltip. Do not add icons where no spec asks.
- **Hover:** only the existing neutral hover surfaces (`hover:bg-accent`, `hover:bg-sidebar-accent[/60]`, `hover:text-foreground` on ghost/muted controls), plus the `ring`-blue hover on the pane resize handle and slider thumbs. No new hover effects unless a spec asks.
- Colour presets live in the ColorField **popover** (สีสำเร็จรูป grid, roving tabindex), not inline.
- **Esc commits inline text edits** on the canvas (same as Enter); it does not discard.
- Keyboard and a11y are part of the design: one Tab stop per toggle group and list (roving tabindex), focus returns to the trigger after dialogs/menus, canvas shortcuts are inert while an overlay is open, toasts use live regions.
- Toasts go through the `toast.*` facade (sonner renderer), bottom-right, max 3.
- Command palette (cmdk) stays lazy-loaded; never in the entry chunk.

## Motion

- `tw-animate-css` only (no framer-motion or other libs). Short: `duration-100`.
- Dialogs, alert-dialogs and floating layers (popover, dropdown, context menu, select, tooltip) may use the shadcn `fade-in-0 zoom-in-95` / `zoom-out-95` (plus slide-in) animations, **provided motion-reduce applies**: no animation under `prefers-reduced-motion: reduce`. Dialog overlays fade.
- Respect `prefers-reduced-motion`: `motion-reduce:animate-none` on overlays and content; any transform feedback (e.g. Preview button press) must be disabled under `prefers-reduced-motion: reduce`.
- Motion explains state; nothing animates while idle.

## Do's and Don'ts

- Do use the tokens above via Tailwind semantic classes; don't introduce new hues or raw colour values in chrome.
- Do keep text ≥ 11px and ≥ 4.5:1; don't use `text-[10px]`, `leading-none` on Thai, or `uppercase` captions.
- Do separate with borders; don't add shadows to chrome surfaces (beyond the listed exceptions, incl. `shadow-sm` on selected toggle chips and Preview device frames) or blur to overlays.
- Do reserve blue for selection, focus, primary; don't use it for hover or decoration (only exception: `ring` hover on the pane resize handle and slider thumbs).
- Don't add a menubar, new icons, shadows, or hover effects unless a spec asks.
- Do keep the canvas page light in dark mode.
- Do keep shadcn zoom/slide animations on dialogs and floating layers only with motion-reduce (no animation under `prefers-reduced-motion: reduce`).
- Do lazy-load new UI; don't add packages for UI or animation.
