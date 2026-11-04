# Web Builder — UI Refresh with shadcn/ui (app chrome)

**Product:** Web Builder (Tauri desktop)
**Scope:** The app's **own** UI only: editor top bar, mode switch, element palette, layers panel, style panel fields, project list, dialogs, toasts, optional command palette and dark mode. **Not** end-user page templates, not canvas node rendering (`node-view.tsx`), not the compiler.
**When:** DEV implements after Phase 3b. Spec only; no code changed by this doc.
**Related:** Preview device picker (slice S2b), see [`DEVICE-PREVIEW-SPEC.md`](./DEVICE-PREVIEW-SPEC.md).
**Stack (as found):** Tauri 2, React 19, Vite 8, Bun, shadcn style `radix-nova` (`components.json`, `baseColor: neutral`, `iconLibrary: lucide`), Tailwind v4 tokens in `src/index.css`, `@fontsource-variable/geist`, `lucide-react`, `radix-ui` (unified package), `cn` (shadcn's clsx+tailwind-merge replacement, re-exported by `src/lib/utils.ts`), `tw-animate-css`, Zustand (`editor-store`, `projects-store`), react-router.
**Hard constraints:**
- `src/schema.ts` and `src-tauri/src/defaults.rs` are **locked**. Nothing here needs a schema key.
- Thai-first copy: existing labels stay word-for-word. New strings are listed in §9.
- Keyboard shortcuts unchanged: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Delete/Backspace, Enter (inline edit), Esc (select parent / cancel), ↑/↓ (siblings). New shortcuts (Ctrl+K, optional Ctrl+S) are additive and flagged in §7.
- Keep shipped a11y (see §5.3). Low CPU/RAM: no framer-motion, no extra icon packs, no animation libs beyond `tw-animate-css` (already imported in `index.css`).

---

## 0. What exists today (audit)

| Area | File | Today | Notes for refresh |
|------|------|-------|-------------------|
| shadcn primitives installed | `src/components/ui/` | `button`, `dialog`, `dropdown-menu`, `input`, `separator`, plus custom `toaster.tsx` | All import `cn` from `"cn"` and primitives from `"radix-ui"`. Keep that pattern. |
| Tokens | `src/index.css` | Stock shadcn neutral `:root` + `.dark`, `--radius: 0.625rem`, `@custom-variant dark`, sidebar tokens | `.dark` block exists but nothing toggles it. No accent hue: `--primary` is near-black. |
| Font | `src/index.css` | `--font-sans: 'Geist Variable', sans-serif` | Geist has **no Thai glyphs**; Thai falls to whatever `sans-serif` resolves to. `index.html` has `lang="en"`. |
| Top bar | `components/editor/EditorTopBar.tsx` | `h-12`; ghost back button **โปรเจกต์**, vertical `Separator`, inline title `Input` (design) / text (preview), `ModeSwitch`, **ส่งออก** (outline + `Loader2`), **บันทึก** / **บันทึก\*** (outline, disabled when clean) | No save-state feedback besides the `*`. No Ctrl+S. |
| Mode switch | `components/editor/ModeSwitch.tsx` | `role="group"` `aria-label="โหมดแก้ไข"`, two `Button`s with `aria-pressed` | Two Tab stops, no arrow keys. |
| Palette | `components/editor/ElementPalette.tsx` | 4×2 grid of native `draggable` buttons, `title` tooltips, `text-[10px] leading-none` Thai labels | `leading-none` + 10px risks clipping Thai tone marks. |
| Layers | `components/editor/LayersPanel.tsx` | `aside w-56`; `div role="listbox" data-kbd-scope="layers" tabIndex={-1}`; rows are `<button role="option" aria-selected data-layer-row>`; indent `8 + depth*12px` | **No roving tabindex**: every row is a Tab stop. ↑/↓ change *selection* via the window listener in `DesignCanvas.tsx`, but focus stays on the old row. No context menu, no drag in the panel. |
| Keyboard | `components/editor/DesignCanvas.tsx` | Two `window` `keydown` listeners: undo/redo (skips native text targets + inline edit), node keys gated by `isCanvasShortcutFocus()` (focus must be the canvas `data-kbd-scope="canvas"` or the layers listbox/row) | Radix portals put focus outside both scopes, so node keys are naturally inert in menus/popovers. **But undo/redo is global**: Ctrl+Z works behind an open dialog/menu (focus on a button is not a text target). |
| Style panel | `components/editor/StylePanel.tsx` + `style/*` | `aside w-72`; own disclosure buttons (`aria-expanded`/`aria-controls`), `FieldRow` (88px caption, override dot, `RotateCcw` reset), controls: `NumberField`, `UnitField` (+ native unit `<select>`), `SelectField` (native `<select>`), `SegmentedField` (`role="group"` + `aria-labelledby`, `aria-pressed` buttons), `ColorField` (native `input[type=color]` + hex `Input` + preset swatches with **roving tabindex**), `BoxSpacingField` (link toggle, 4-side grid `role="group"`), `OpacityField` (native range + `NumberField`, history group per drag), native checkbox for **เปิดแท็บใหม่** | Controls are `h-8`; native `<select>`/color open GTK popups on Linux (off-theme, and wrong in dark mode). |
| History | `lib/history.ts`, `editor-store.ts` | `beginHistoryGroup/endHistoryGroup/revertHistoryGroup`, key coalescing 800 ms, `useRafCommit` per-frame writes | Any new control must preserve "one drag / one focus session = one undo step". |
| Canvas | `DesignCanvas.tsx`, `node-view.tsx` | Dotted `bg-muted/40` backdrop, page card `bg-card`, selection `outline-sky-500` (hard-coded), drop line `bg-sky-500` | The sky blue is already the de-facto accent. |
| Project list | `pages/ProjectListPage.tsx`, `components/projects/*` | `h-14` header, CSS grid of `ProjectCard` (separate open button + `DropdownMenu` **เปิด / ลบ**), `ProjectEmptyState`, `NewProjectDialog`, `DeleteProjectDialog` (plain `Dialog`) | First load shows a blank grid (no skeleton). |
| Toasts | `lib/toast.ts` + `ui/toaster.tsx` | Zustand facade `toast.success/error/info`, bottom-right, max 3, `role=status`/`alert` | Works and is accessible. Keep the `toast.*` API as the facade whatever renders it. |
| Confirm on leave | `components/editor/UnsavedChangesDialog.tsx`, `EditorPage.tsx` | **Already shipped**: back button + Tauri `onCloseRequested` + `beforeunload`; **ยกเลิก / ไม่บันทึก / บันทึก** (initial focus on ยกเลิก, PM 2026-09-28) | It is a `Dialog`, so an outside click cancels. Refresh = convert to `AlertDialog` (§2, S7). |
| Errors | `EditorPage.tsx`, `ProjectListPage.tsx` | Inline `role="alert"` banner from `projects-store.error` + **ปิด** | Keep banner (persistent errors), restyle. |
| Dialog overlay | `ui/dialog.tsx` | `bg-black/10 supports-backdrop-filter:backdrop-blur-xs` | Blur contradicts PHASE-1 §5 "avoid blur backdrops" and costs GPU on WebKitGTK. Drop it (§1.7). |

---

## 1. Visual direction

**Feel:** a quiet pro tool (VS Code / Figma / Dreamweaver CS-era panels): neutral chrome, hairline borders instead of shadows, dense 28 px controls, one blue accent reserved for **selection, focus and the primary action**. The canvas page is the only bright "paper" surface.

### 1.1 Color tokens (existing variable names only)

Keep every existing variable. Change values only where listed. One accent hue: **sky/blue 240°**, matching the canvas selection (`outline-sky-500`).

| Token | Light (`:root`) | Dark (`.dark`) | Use |
|-------|-----------------|----------------|-----|
| `--primary` | `oklch(0.56 0.16 244)` (≈ sky-600) | `oklch(0.68 0.15 240)` (≈ sky-400/500) | Primary buttons (**สร้างโปรเจกต์**, **บันทึก** when dirty), override dot in `FieldRow`, active toggle indicator |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.16 0.02 245)` | Text on primary |
| `--ring` | `oklch(0.62 0.15 242)` | `oklch(0.68 0.15 240)` | Focus rings (used at `/50`) |
| `--sidebar-primary` | same as `--primary` | same as `--primary` | Selected layer indicator bar |
| `--background` | `oklch(1 0 0)` (keep) | `oklch(0.17 0 0)` | Top bar, dialogs |
| `--sidebar` | `oklch(0.975 0 0)` | `oklch(0.2 0 0)` | Left/right panels (slightly off the canvas backdrop) |
| `--muted` | keep `0.97` | keep `0.269` | Canvas backdrop (`bg-muted/40`), skeletons |
| `--accent` | keep neutral | keep neutral | **Hover** surfaces only (shadcn meaning). Never the brand accent. |
| `--border` / `--sidebar-border` | `oklch(0.91 0 0)` | keep `oklch(1 0 0 / 10%)` | 1 px hairlines between panes |
| `--destructive` | keep | keep | Delete, errors |
| `--chart-*` | keep, unused | keep | — |

Rules:
- Selected layer row: `bg-sidebar-accent` + 2 px left inset bar in `--sidebar-primary` (`shadow-[inset_2px_0_0_var(--sidebar-primary)]`). Hover: `bg-sidebar-accent/60`.
- Active toggle (mode switch, segmented fields): `bg-background` chip on a `bg-muted` track + `text-foreground`; no accent fill (accent is for selection/primary only).
- Success green stays `text-emerald-600` in toasts (existing). No other hues.
- Do not touch the hard-coded sky outlines in `node-view.tsx` (canvas, out of scope); the new `--primary` is chosen to sit next to them.

### 1.2 Typography

Geist stays the UI face. Thai uses **system-installed** fonts via fallback; do not bundle a Thai webfont (Noto Sans Thai is already installed on the dev machine, `/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf`).

```css
--font-sans: 'Geist Variable', 'Noto Sans Thai', 'Noto Sans Thai UI',
             'Leelawadee UI', 'Thonburi', system-ui, sans-serif;
--font-mono: ui-monospace, 'SFMono-Regular', 'DejaVu Sans Mono', monospace;
```

- Set `<html lang="th">` in `index.html` (better Thai fallback selection and line breaking).
- No Geist Mono package; mono fields (hex, href, asset id) use the system mono stack above.

| Role | Size / line-height | Classes | Where |
|------|--------------------|---------|-------|
| Panel caption | 11 px / 16 | `text-[11px] font-medium text-muted-foreground` | **เพิ่ม**, **เลเยอร์**, **สไตล์**, section headers |
| Control / field text | 12 px / 16 | `text-xs` | Inputs, selects, field labels, hints |
| List row / menu item | 13 px / 20 | `text-[13px]` | Layer rows, dropdown/context/command items |
| Body | 14 px / 20 | `text-sm` | Dialogs, project cards, toasts, top bar title |
| Screen title | 18 px / 28 semibold | `text-lg font-semibold` | Project list header |

Thai-specific rules:
- **Minimum 11 px for Thai.** Replace `text-[10px]` (palette labels, style hints, box-side labels) with `text-[11px]`.
- **No `leading-none` on Thai** (stacked vowels/tone marks clip). Minimum `leading-4` at 11–12 px.
- **Drop `uppercase tracking-wide`** on Thai captions: uppercase is a no-op for Thai and letter-spacing can detach combining marks. Use `font-medium` + muted color instead.

### 1.3 Density & sizing

| Element | Height | Tailwind |
|---------|--------|----------|
| Top bar | 44 px | `h-11` |
| Top bar buttons | 28 px | `Button size="sm"` (`h-7`) |
| Panel header row | 32 px | `h-8` |
| Style field control | 28 px | `h-7` (was `h-8`); `FieldRow` `min-h-7` |
| Layer row | 28 px | `h-7` |
| Icon buttons in panels | 24 px | `size="icon-xs"` (`size-6`) |
| Menu / command item | 28 px | `h-7` |

Panel text is 12–13 px. Hit targets never below 24 px.

### 1.4 Spacing

4 px base. Panels: `px-2` (lists) / `px-3` (forms). Between field rows `space-y-2` (was `space-y-3`). Sections: `border-t` + `py-2`. Project grid `gap-4`, page padding `px-6 py-6` (keep). Avoid `gap-0.5` except inside toggle tracks.

### 1.5 Radius

`--radius: 0.5rem` (from `0.625rem`). Derived: `rounded-lg` 8 px (buttons, inputs), `rounded-md` 6.4 px (rows, toggles), `rounded-sm` 4.8 px (swatches, kbd), `rounded-xl` 11 px (cards, dialogs). Existing components keep their classes; the tighter look comes from the variable.

### 1.6 Borders, elevation, focus

- Panes separated by 1 px `border-border` (resizable handles are that same line, §2.3). No panel shadows.
- Shadows only on floating layers: popover/menu/tooltip `shadow-md`, dialog `shadow-lg`. Canvas page card keeps `shadow-sm`.
- Focus: keep shadcn `focus-visible:ring-3 ring-ring/50` for buttons/inputs; in dense panels (layers rows, swatches, toggles) use `ring-2` or `outline-2 outline-ring` so rings are not clipped by `overflow-auto`. Canvas keeps its inset ring.

### 1.7 Motion

`tw-animate-css` only: menus/popovers `fade-in-0 zoom-in-95` at `duration-100`; dialogs fade only. Remove `backdrop-blur-xs` from `DialogOverlay` (and do not add blur to AlertDialog); use `bg-black/20` (light) / `bg-black/50` (dark). Respect `prefers-reduced-motion` via `motion-reduce:animate-none` on overlay/content.

### 1.8 Icons

`lucide-react` named imports only (already tree-shaken per icon). **14 px** (`size-3.5`) in panels, rows, menus, field buttons; **16 px** (`size-4`) in top bar and dialogs. Default stroke. No second icon pack. After every `shadcn add`, grep the new files for `IconPlaceholder` (the radix-nova registry source uses it; the CLI should rewrite it to lucide per `components.json`). None may remain.

### 1.9 Dark mode (cheap, optional; slice S8)

- Tokens already exist in `.dark`; `@custom-variant dark (&:is(.dark *))` is already in `index.css`.
- `theme` preference in a tiny Zustand slice or `localStorage` key `wb.theme` = `system | light | dark`. Apply by toggling `.dark` on `<html>`.
- **Follow the OS:** in `system` mode use `matchMedia('(prefers-color-scheme: dark)')`; in Tauri also listen to `getCurrentWindow().onThemeChanged`. On Linux WebKitGTK the media query follows the GTK theme preference and can be unreliable; `onThemeChanged` is the source of truth there. Verify on the target distro.
- Optional: sync the native title bar with `getCurrentWindow().setTheme()`; that needs `core:window:allow-set-theme` in `src-tauri/capabilities/default.json` (not present today). Skip if the title bar looks fine.
- No-flash: a 3-line inline script in `index.html` reads `wb.theme` and sets `.dark` before React mounts.
- **The canvas page stays light.** `DesignCanvas`'s page card and `node-view.tsx` placeholders use app tokens (`bg-card`, `bg-muted/50`, `border-border`, `text-muted-foreground`), and Preview renders a white iframe. Wrap the page card in a `.theme-light` scope that re-declares the light `:root` values, so user content never turns dark in Design.
- Toggle lives in the command palette and (if added) the menubar **มุมมอง** menu. No toggle on the project list header in v1.

---

## 2. Components to add

### 2.1 Install command (one-shot, slice S1)

```bash
bunx shadcn@latest add tooltip toggle toggle-group select slider popover switch \
  context-menu alert-dialog resizable sonner card skeleton empty kbd label alert spinner
# later, optional (S8):
bunx shadcn@latest add command menubar
```

Already installed (do not re-add, answer "no" to overwrite): `button`, `dialog`, `dropdown-menu`, `input`, `separator`. **Do not overwrite `toaster.tsx`.**

### 2.2 Mapping table

| shadcn component | CLI name | New npm deps (≈ min+gz) | Replaces / used in | Decision |
|------------------|----------|-------------------------|--------------------|----------|
| Tooltip | `tooltip` | none (`radix-ui`) ≈ 4 KB | `title=` on palette tiles, top bar icon buttons, segmented icon options, reset buttons, swatches | **Add.** One `TooltipProvider delayDuration={400} skipDelayDuration={200}` in `App.tsx`. |
| Toggle + Toggle Group | `toggle toggle-group` | none ≈ 3 KB | `ModeSwitch`, `SegmentedField`, transparent toggle in `ColorField`, link toggle in `BoxSpacingField` | **Add.** See a11y notes §5.3. |
| Select | `select` | none ≈ 8 KB | `SelectField` (font, weight), unit `<select>` in `UnitField` | **Add.** Native GTK popup is off-theme; see §7 for keyboard differences. |
| Slider | `slider` | none ≈ 3 KB | range `<input>` in `OpacityField` | **Add.** Keep history-group logic. |
| Popover | `popover` | none ≈ 3 KB (popper shared with dropdown) | Color swatch in `ColorField` (presets + hex + system picker) | **Add.** |
| Switch | `switch` | none ≈ 1.5 KB | native checkbox **เปิดแท็บใหม่** in `StylePanel` `NodePropsSection` | **Add.** |
| Context Menu | `context-menu` | none (shares menu code with dropdown) ≈ 1–2 KB | New: right-click / Menu key on layer rows | **Add.** Items use existing doc-ops only (§4 S5). |
| Alert Dialog | `alert-dialog` | none (shares dialog) ≈ 1 KB | `DeleteProjectDialog`, `UnsavedChangesDialog` | **Add.** |
| Resizable | `resizable` | `react-resizable-panels` v4 ≈ 13 KB | Fixed `w-56` / `w-72` asides in `EditorPage` | **Add.** |
| Sonner | `sonner` | `sonner` ≈ 9.5 KB **+ `next-themes`** | Renderer behind `lib/toast.ts` | **Add, but** replace the generated `useTheme()` from `next-themes` with the app theme source and `bun remove next-themes`. Keep `toast.*` facade so no call site changes. |
| Card | `card` | none, <1 KB | `ProjectCard` shell | **Add.** |
| Skeleton | `skeleton` | none, <0.5 KB | Project grid first load; Style panel while `!documentReady` | **Add.** |
| Empty | `empty` | none, <1 KB | `ProjectEmptyState`, "เลือกองค์ประกอบเพื่อแก้ไข", "ไม่มีเลเยอร์", canvas/preview empty copy | **Add.** |
| Kbd | `kbd` | none, <0.5 KB | Shortcut hints in tooltips, context menu, command palette | **Add.** |
| Label | `label` | none, <1 KB | `NewProjectDialog` label | **Add** (dialogs only; `FieldRow` keeps its native `<label>`/`<span>` split for `aria-labelledby`). |
| Alert | `alert` | none, <1 KB | Error banners in `EditorPage` / `ProjectListPage` | **Add** (restyle only; keep `role="alert"` + **ปิด**). |
| Spinner | `spinner` | none, <0.5 KB | `Loader2 animate-spin` in top bar export/save, preview loading | **Add** (optional, cosmetic). |
| Breadcrumb | `breadcrumb` | none | — | **Skip.** Two levels only; build `โปรเจกต์ › ชื่อ` from existing `Button` + `ChevronRight`. A `<Link>` crumb would bypass the unsaved-changes guard (`requestBack`). |
| Command | `command` | `cmdk` ≈ 15 KB (+ pulls `input-group`, `textarea`, and standalone `@radix-ui/react-dialog`, normally deduped with `radix-ui`) | New Ctrl+K palette | **Optional (S8)**, lazy-loaded with `React.lazy` so it is not in the startup chunk. |
| Menubar | `menubar` | none ≈ 3 KB | New ไฟล์ / แก้ไข / มุมมอง bar | **Optional (S8).** Adds "Dreamweaver" discoverability; costs ~28 px width budget in the top bar. PM call. |
| Scroll Area | `scroll-area` | none ≈ 4 KB | — | **Skip for panels.** It swaps the native scroller for JS-measured thumbs, adds wrappers around the `role="listbox"` / `data-kbd-scope` element, and interferes with `scrollIntoView`. Use a CSS `.scrollbar-thin` utility (§4 S0). Only acceptable inside `command` if its list needs it. |
| Sidebar | `sidebar` | pulls `sheet`, `use-mobile`, `tooltip`, `skeleton`, cookie state, its own Ctrl+B | — | **Skip.** Its `SidebarMenu` is a `ul/li/button` menu model with its own keyboard handling; it would break the listbox + window-listener model of `LayersPanel`, and `Collapsible` groups would hide rows that ↑/↓ sibling navigation expects to exist. Borrow the look only (the `--sidebar*` tokens are already in `index.css`). |
| Tabs | `tabs` | none | — | **Skip.** `ModeSwitch` swaps whole layouts, not tab panels; `role=tablist/tabpanel` would be wrong. No tabbed panels in v1. |
| Drawer | `drawer` | `vaul` | — | **Skip** (touch/mobile pattern, extra dep). |
| Sheet, Navigation Menu, Carousel, Chart, Calendar, Input Group, Button Group, Field, Item | — | — | — | **Skip** (no payoff for a desktop editor; `input-group` arrives only as a `command` dependency). |

**Eager bundle delta (rough):** Radix primitives ≈ 25–30 KB gz (shared internals with dropdown/dialog already shipped) + `react-resizable-panels` 13 KB + `sonner` 9.5 KB ≈ **45–55 KB gz**. `cmdk` ≈ 10–15 KB gz in a lazy chunk. `next-themes` must not ship. Check with `vite build` before/after (S1 acceptance).

### 2.3 shadcn blocks: borrow vs skip

| Block | Verdict | What to take |
|-------|---------|--------------|
| `sidebar-07` (collapsible to icon rail) | Borrow the idea only | A future collapsed left rail (palette icons only) when the layers pane is collapsed. Do not install the block (it installs `sidebar`). |
| Site header pattern from the dashboard/sidebar blocks (`h-12`, trigger + vertical separator + title) | Borrow proportions | Editor top bar rhythm: panel toggle · separator · crumb/title · spacer · mode switch · actions. |
| `dashboard-01` | Skip | Charts, data tables, cards of KPIs: not our app. |
| Empty-state examples in the `empty` docs | Borrow | Icon-in-muted-square + title + description + one action for every empty state. |
| Login / signup / calendar / products blocks | Skip | Irrelevant. |

---

## 3. Layout sketches

### 3.1 Editor (Design mode)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [◧] │ โปรเจกต์ › [ชื่อโปรเจกต์______]      [✎ ออกแบบ|👁 ตัวอย่าง]   [⇩ ส่งออก] [● บันทึก] │ h-11
├──────────────┬─────────────────────────────────────────────────┬─────────────────┤
│ เพิ่ม          ┆ · · · · · · · · · · · · · · · · · · · · · · ·  ┆ สไตล์             │
│ [□][▣][H][T]  ┆ ·   ┌──────────────────────────────────────┐  ·  ┆ องค์ประกอบ         │
│ [🖼][⬚][🔗][↕] ┆ ·   │  page card (always light)            │  ·  ┆  หัวข้อ · H2       │
│───────────────┆ ·   │   ┏━━━━━━━━━━━━━━┓ ← sky selection    │  ·  ┆ ▾ ขนาด           │
│ เลเยอร์         ┆ ·   │   ┃ หัวข้อ         ┃                    │  ·  ┆ • กว้าง [120][px▾]↺│
│ ▢ หน้า          ┆ ·   │   ┗━━━━━━━━━━━━━━┛                    │  ·  ┆ ▾ ตัวอักษร        │
│ ┊ ▢ ส่วน        ┆ ·   │                                      │  ·  ┆   ฟอนต์ [ระบบ ▾]  │
│ ┃ ┊ H หัวข้อ  ◀ ┆ ·   └──────────────────────────────────────┘  ·  ┆   น้ำหนัก [ปกติ ▾] │
│ ┊ ┊ T ข้อความ   ┆ · · · · · · · · · · · · · · · · · · · · · · ·  ┆ ▾ พื้นหลัง         │
│              ┆                                                  ┆   [■▾] #ffffff [▦] │
└──────────────┴─────────────────────────────────────────────────┴─────────────────┘
  ↑ resizable 200–360px     ↑ canvas min 360px                      ↑ resizable 256–420px
  (┆ = 1px ResizableHandle, ┃ = selected row inset bar, ┊ = depth guide)
```

`[◧]` toggles the layers pane (existing `isSidebarOpen` / `toggleSidebar`, which no UI uses today). Preview mode: top bar only + full-width `PreviewStage`; no resizable group.

### 3.2 Project list

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◆ Web Builder                                              [+ สร้างโปรเจกต์] │ h-14
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ │
│  │ ░░░░░░░░░░░░░░ │ │ ░░ (muted,     │ │                │ │                │ │
│  │ ░░  ▭ icon  ░░ │ │ ░░  aspect-    │ │   skeleton     │ │   skeleton     │ │
│  │ ░░░░░░░░░░░░░░ │ │ ░░  video)     │ │   while first  │ │   while first  │ │
│  │ ชื่อโปรเจกต์  [⋯] │ │ ...        [⋯] │ │   load         │ │   load         │ │
│  │ 5 นาทีที่แล้ว      │ │ ...            │ │                │ │                │ │
│  └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

No real thumbnails in v1 (would need rendering); the media area is a neutral placeholder with a lucide `FileText` icon.

---

## 4. Migration slices

Each slice ships alone, keeps the app working, and does not depend on a later slice. Order is a recommendation; S2–S6 can be reordered after S0+S1.

### S0 — Tokens, fonts, scrollbars

- **Scope:** §1.1 token values, `--radius`, font stacks, `lang="th"`, `.scrollbar-thin` utility (`scrollbar-width: thin; scrollbar-color: var(--border) transparent` + `::-webkit-scrollbar` 8 px rules for WebKitGTK), remove dialog blur, Thai size/leading/tracking fixes (§1.2).
- **Files:** `src/index.css`, `index.html`, `src/components/ui/dialog.tsx` (overlay classes), class-only edits in `ElementPalette.tsx`, `LayersPanel.tsx`, `StylePanel.tsx`, `style/FieldRow.tsx`, `style/BoxSpacingField.tsx`.
- **Deps:** none. **Risk:** low (visual only).
- **Accept:**
  - [ ] Primary buttons and override dots are blue; hover surfaces stay neutral.
  - [ ] Thai labels in palette, captions and hints render ≥ 11 px with no clipped tone marks (check "ช่องว่าง", "รูปภาพ", "ข้อความแทนรูป").
  - [ ] No `uppercase tracking-wide` remains on Thai captions.
  - [ ] Dialog overlay has no blur.
  - [ ] Panel scrollbars are thin in Tauri on Linux.
  - [ ] `schema.ts` untouched.

### S1 — Primitive install (no usage yet)

- **Scope:** run the §2.1 command; post-install fixes: remove `next-themes` import from `ui/sonner.tsx` (hard-code `theme="light"` until S8), `bun remove next-themes`; confirm every new file imports `cn` from `"cn"` and primitives from `"radix-ui"`; grep for `IconPlaceholder` (must be 0); add `TooltipProvider` to `App.tsx`.
- **Files:** new `src/components/ui/{tooltip,toggle,toggle-group,select,slider,popover,switch,context-menu,alert-dialog,resizable,sonner,card,skeleton,empty,kbd,label,alert,spinner}.tsx`; `package.json`/`bun.lock` (CLI); `src/App.tsx`.
- **Risk:** low. CLI may offer to overwrite `button.tsx`/`dialog.tsx`: answer **no** (S0 edits live there).
- **Accept:**
  - [ ] `bun run build` passes; app behaves identically.
  - [ ] `next-themes` absent from `package.json` and the build.
  - [ ] Bundle delta recorded (before/after `dist/assets/*.js` gz sizes) and ≤ ~60 KB gz.

### S2 — Top bar + ModeSwitch

- **Scope:**
  - Top bar `h-11`; left: layers-pane toggle (`PanelLeft` icon-sm, tooltip), back crumb (existing ghost **โปรเจกต์** button + `ChevronRight`, still calls `onBack` → `requestBack`), title input (unchanged behavior).
  - Right: `ModeSwitch`, **ส่งออก** (outline, `Download`/`Spinner`), **บันทึก** with three states: clean → ghost, disabled, `Check` + **บันทึกแล้ว**; dirty → `variant="default"` (blue) **บันทึก** + 6 px dot; saving → `Spinner` + **กำลังบันทึก…**. Tooltips on icon buttons.
  - `ModeSwitch` → `ToggleGroup type="single"` on a `bg-muted` track, `aria-label="โหมดแก้ไข"` kept, `onValueChange={(v) => v && select(v)}` (ignore deselect), icons 14 px.
- **Files:** `components/editor/EditorTopBar.tsx`, `components/editor/ModeSwitch.tsx`.
- **Risk:** low–medium (ModeSwitch a11y role change, §7).
- **Accept:**
  - [ ] Back still opens `UnsavedChangesDialog` when dirty.
  - [ ] Save button shows all three states; disabled when clean (as today).
  - [ ] Mode switch: one Tab stop, ←/→ moves between **ออกแบบ**/**ตัวอย่าง**, Space/Enter selects; clicking the active item does nothing; disabled until `documentReady`.
  - [ ] Screen reader announces group "โหมดแก้ไข" and the checked item.

### S2b — Preview device picker

- **Spec:** [`docs/DEVICE-PREVIEW-SPEC.md`](./DEVICE-PREVIEW-SPEC.md) (full detail; this entry is only the summary).
- **Scope:** Preview mode only. Device `Select` (เต็มพื้นที่, เดสก์ท็อป, แล็ปท็อป, แท็บเล็ต, มือถือ, มือถือเล็ก, จอพับ พับ/กาง, กำหนดเอง), rotate `Toggle`, custom W×H (240–3840), **พอดี / 100%** `ToggleGroup` with zoom readout, optional hinge overlay, optional multi-device view (off by default, max 3). Shown in the S2 top bar only when `mode === "preview"`; choices saved in `localStorage` `wb.preview.device.v1`.
- **Files:** new `src/lib/devices.ts`, `src/stores/preview-device-store.ts`, `src/components/editor/preview/DeviceToolbar.tsx`, `DeviceStage.tsx`; edits in `components/editor/PreviewStage.tsx`, `components/editor/EditorTopBar.tsx`. No schema, compiler or `src-tauri` change.
- **Depends on:** S1 (`select`, `toggle`, `toggle-group`, `tooltip`), S2 (top bar layout).
- **Risk:** medium. Device frames need a fixed height (today's auto-height `measure()` stays only for เต็มพื้นที่), and the iframe must keep one stable element so a device switch never re-parses `srcDoc`.
- **Accept:** see DEVICE-PREVIEW-SPEC §14. Key checks: a device switch fires neither `compile_preview` nor the iframe `load` event; iframe size equals the preset CSS size; choices persist; `dirty` stays false.

### S3 — Resizable panes

- **Scope:** `EditorPage` design branch → `ResizablePanelGroup orientation="horizontal"`: layers `defaultSize="224px" minSize="200px" maxSize="360px" collapsible collapsedSize={0}` (bound to `isSidebarOpen`); canvas `minSize="360px"`; style `defaultSize="288px" minSize="256px" maxSize="420px"`. `LayersPanel`/`StylePanel` drop their fixed `w-56`/`w-72`/`shrink-0` and fill the panel. Handles: 1 px line, 4 px hit area, `aria-label` "ปรับขนาดแผง". Double-click a handle → reset to defaults. Persist layout on `onLayoutChanged` to `localStorage` `wb.editor.layout.v1` (app-level, not per project).
- **Files:** `pages/EditorPage.tsx`, `components/editor/LayersPanel.tsx`, `components/editor/StylePanel.tsx` (outer `aside` classes only).
- **Risk:** medium: layout persistence is new behavior; verify drag CPU.
- **Accept:**
  - [ ] At the window minimum (960×640) all three panes fit with minimums respected.
  - [ ] Widths survive project switch and app restart; Preview ↔ Design restores them.
  - [ ] Dragging a handle does not re-render `DesignCanvas`/`NodeView` per frame (React Profiler) and CPU stays near idle after release.
  - [ ] Handles are keyboard-resizable (focus + arrows) and never trigger canvas shortcuts.
  - [ ] Palette drag-and-drop onto the canvas still works across the handle.

### S4 — Style panel fields

- **Scope:**
  - All controls `h-7 text-xs`; `FieldRow` `min-h-7`, caption 88 px kept, reset keeps its reserved 24 px slot; reset and swatches get `Tooltip`.
  - `SegmentedField` → `ToggleGroup type="single" size="sm"`; root keeps `id`, `role="group"` (Radix default) and `aria-labelledby={labelledBy}`; icon items keep `aria-label` + tooltip; ignore empty value; `fill` → items `flex-1`.
  - `SelectField` and the `UnitField` unit picker → `Select` (`SelectTrigger id={id} size="sm"`). Radix forbids `value=""` on items: map "ระบบ (ค่าเริ่มต้น)" and weight "—" to a sentinel (`"__default"`, `"__unset"`) and translate at the edge. Font items render in their own family (preview). Disabled "กำหนดเอง" item stays disabled.
  - `OpacityField` range → `Slider min={0} max={100} step={5}`: `onPointerDown` on root = `beginHistoryGroup` (runs before Radix's own handler), `onValueChange` → `slide.schedule`, `onValueCommit` → `endDrag` (flush + revert-if-unchanged + end group). `aria-label={label}` goes on `SliderThumb` (root label is not propagated).
  - `ColorField`: swatch becomes a `PopoverTrigger` (22 px chip, checker when transparent). Popover (`w-56`, `align="start"`): preset grid (keep roving tabindex code), hex `Input` (same validation and `aria-describedby` error), **เลือกจากระบบ…** button wrapping the native `input[type=color]`, and **โปร่งใส** toggle where allowed. Inline hex input stays in the row for fast typing. Inline preset footer moves into the popover (PM may keep it inline; §7).
  - `BoxSpacingField` link toggle → `Toggle size="sm"` (`aria-pressed` preserved); side captions `text-[11px]`.
  - **เปิดแท็บใหม่** checkbox → `Switch id="pf-newtab"` (FieldRow `<label htmlFor>` still names it).
  - Section headers keep own disclosure button; restyle to `h-8` row, chevron 14 px, **รีเซ็ต** stays ghost `xs`.
- **Files:** `components/editor/StylePanel.tsx`, `style/FieldRow.tsx`, `style/SegmentedField.tsx`, `style/SelectField.tsx`, `style/UnitField.tsx`, `style/OpacityField.tsx`, `style/ColorField.tsx`, `style/BoxSpacingField.tsx`, `style/NumberField.tsx` (classes only), `style/TextPropField.tsx` (classes only).
- **Risk:** medium–high (most behavior-sensitive slice; undo grouping, keyboard). Can be split S4a (toggle-group, switch, sizes) / S4b (select, slider) / S4c (color popover).
- **Accept:**
  - [ ] One opacity drag = one undo step; drag back to start = no undo step and no dirty (as today).
  - [ ] Opacity keyboard arrows still write and coalesce as before (per `COALESCE_MS`).
  - [ ] Selecting a font/weight/unit writes exactly once per choice; opening/closing without choosing writes nothing.
  - [ ] "ระบบ (ค่าเริ่มต้น)" still removes `fontFamily`; unit "auto → px" pending-input flow unchanged.
  - [ ] Segmented fields: one Tab stop, arrows move, active click is a no-op, `aria-labelledby` points at the `FieldRow` caption.
  - [ ] Color: preset click = one undo step; invalid hex shows the same Thai error and `aria-invalid`; Esc in the hex input restores the draft first (popover stays open), second Esc closes.
  - [ ] Locked node: every control disabled, resets hidden (as today).
  - [ ] Canvas shortcuts never fire while a Select/Popover/Slider has focus.
  - [ ] No saved-document diff vs today for the same edits (sparse `node.style`).

### S5 — Layers + palette polish

- **Scope:**
  - Rows `h-7 text-[13px]`, icon 14 px, depth guides via a repeating 1 px background on the indent (CSS only), selected inset bar (§1.1), locked rows keep `opacity-60` + small `Lock` icon.
  - `ContextMenu` per row (`ContextMenuTrigger asChild` on the existing `<button role="option">`). Right-click first selects the row. Items (existing ops only): **แก้ไขข้อความ** `Enter` (text nodes, not locked) · **เลื่อนขึ้น** / **เลื่อนลง** (`moveNodeInDocument` within parent) · separator · **ลบ** `Delete` (`removeNode`, disabled on root/locked). Delete must reuse the same code path as the keyboard handler (factor a shared helper out of `DesignCanvas.tsx`) so selection fallback and focus restore match. Duplicate / hide / lock are **out of scope** (no doc-op today).
  - Palette tiles: `Tooltip` with name + hint **คลิกเพื่อแทรก · ลากไปวางบนผืนผ้าใบ**; keep `draggable`, `aria-label`, native DnD; tooltip closes on pointerdown so it never covers the drag. Disabled tiles keep `title` fallback (Radix tooltips do not fire on disabled buttons).
  - Empty "ไม่มีเลเยอร์" → `Empty` (compact).
  - Optional (behavior change, PM approval): real roving tabindex in the listbox (selected row `tabIndex=0`, others `-1`, focus follows ↑/↓ selection). Today every row is a Tab stop.
- **Files:** `components/editor/LayersPanel.tsx`, `components/editor/ElementPalette.tsx`, `components/editor/DesignCanvas.tsx` (extract delete/move helper only; keyboard semantics unchanged).
- **Risk:** medium (context-menu focus return, shared delete path).
- **Accept:**
  - [ ] `role="listbox"`, `role="option"`, `aria-selected`, `data-kbd-scope="layers"`, `data-layer-row` all intact.
  - [ ] After a context-menu action, focus returns to a row inside the layers scope and ↑/↓/Delete/Enter/Esc still work immediately.
  - [ ] Context menu opens with the keyboard Menu key / Shift+F10 on a focused row.
  - [ ] Menu actions create exactly one undo step each.
  - [ ] Palette click-insert and drag-insert unchanged.

### S6 — Project list

- **Scope:** header `h-14` with small app mark + **Web Builder** + primary **สร้างโปรเจกต์** (`Plus` icon). `ProjectCard` → `Card` with a muted `aspect-video` media placeholder, name `text-sm font-medium`, relative time `text-xs`; keep the **separate** primary open button (full-card) and the `DropdownMenu` (**เปิด / ลบ**) exactly as structured today (a11y note in the code). First load (`loading && projects.length === 0`) → 4–8 `Skeleton` cards, shown after 150 ms to avoid flashes. `ProjectEmptyState` → `Empty` (same copy, `FolderOpen`). `DeleteProjectDialog` → `AlertDialog` (Cancel focused by default, **ลบ** destructive; keep open while `busy`, so **ลบ** is a plain `Button`, not `AlertDialogAction`). `NewProjectDialog` uses `Label`. Error banner → `Alert variant="destructive"`.
- **Files:** `pages/ProjectListPage.tsx`, `components/projects/ProjectCard.tsx`, `ProjectEmptyState.tsx`, `DeleteProjectDialog.tsx`, `NewProjectDialog.tsx`.
- **Risk:** low.
- **Accept:**
  - [ ] Card open via click and Enter; menu via its own button; no nested-interactive warnings.
  - [ ] Delete: Esc/Cancel closes; overlay click does **not** close; focus returns to the card menu button.
  - [ ] Skeleton never flashes on fast loads; empty state appears only when `!loading && projects.length === 0` (as today).

### S7 — Toasts + dialogs

- **Scope:**
  - `lib/toast.ts` keeps `toast.success/error/info` signatures; implementation calls `sonner` (`toast.success`, `toast.error` with `duration` 4 s/7 s, `visibleToasts={3}`, `position="bottom-right"`, `closeButton`, close label **ปิดการแจ้งเตือน**). Replace `<Toaster />` in `App.tsx` with the sonner `Toaster`; delete `ui/toaster.tsx` and the Zustand store only after parity is verified.
  - Save failure already toasts on leave (`EditorPage.saveAndLeave`); also toast **บันทึกไม่สำเร็จ** on a manual save failure. Manual save success: no toast (the button state is the feedback).
  - `UnsavedChangesDialog` → `AlertDialog`, same three buttons and copy; initial focus is **ยกเลิก** (PM decision 2026-09-28: the safe choice, not บันทึก); buttons are plain `Button`s so the dialog stays open while saving.
  - **Undo guard:** in the `DesignCanvas` undo/redo listener, return early when a modal is open (`document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')`) or focus is inside a Radix menu/popover content. Prevents invisible document changes behind dialogs.
- **Files:** `lib/toast.ts`, `App.tsx`, `components/ui/toaster.tsx` (removed at the end), `components/editor/UnsavedChangesDialog.tsx`, `pages/EditorPage.tsx`, `components/editor/DesignCanvas.tsx` (guard only).
- **Risk:** medium (toast a11y parity; guard must not block normal undo).
- **Accept:**
  - [ ] Export success/failure, empty-text info, save-and-leave failure toasts all appear with the same Thai text.
  - [ ] Errors are announced assertively, others politely (sonner uses a live region; verify with Orca).
  - [ ] Unsaved dialog: Esc = ยกเลิก, overlay click does nothing, Save keeps dialog open with spinner until done.
  - [ ] Ctrl+Z does nothing while any dialog is open; works normally right after it closes.

### S8 — Command palette, dark mode, optional menubar

- **Scope:**
  - `CommandDialog` on **Ctrl+K** (lazy chunk). Groups: **คำสั่ง** (บันทึก, ส่งออก, สลับโหมด, กลับไปรายการโปรเจกต์, เลิกทำ, ทำซ้ำ), **เพิ่มองค์ประกอบ** (8 palette types, same insert logic as `ElementPalette.add`), **เลเยอร์** (search by `nodeDisplayName`, select on Enter), **มุมมอง** (แผงเลเยอร์, ธีม). English `keywords` on items for mixed typing. Items show `Kbd` hints. Ctrl+K is ignored while inline editing (`editingNodeId`) and while a dialog is open. Closing returns focus to the previously focused element.
  - Dark mode per §1.9 (theme store, no-flash script, `.theme-light` canvas scope, sonner `theme` from store).
  - Optional `Menubar` (ไฟล์ / แก้ไข / มุมมอง) left of the title, same actions as the palette.
- **Files:** new `components/editor/CommandPalette.tsx`, new `lib/theme.ts` (or a slice in `editor-store.ts`), `EditorPage.tsx`, `App.tsx`, `index.html`, `src/index.css` (`.theme-light`), `DesignCanvas.tsx` (wrap page card), `ui/sonner.tsx`; optional `src-tauri/capabilities/default.json` (`core:window:allow-set-theme`).
- **Risk:** medium (new global shortcut; dark mode touches many surfaces).
- **Accept:**
  - [ ] Ctrl+K opens in Design and Preview on the editor; not on the project list (v1); never while typing inline.
  - [ ] Startup JS unchanged by cmdk (lazy chunk only).
  - [ ] Theme `system` follows the OS switch live; choice persists; no light flash on start in dark.
  - [ ] Canvas page and Preview iframe stay light in dark mode; all panels/dialogs/menus/toasts readable (contrast ≥ 4.5:1 for text).

---

## 5. Constraints

### 5.1 Performance

- No `framer-motion`, no extra icon packs, no animation libs; `tw-animate-css` only (§1.7).
- Lazy-load `cmdk`. Do not wrap panels in `ScrollArea`.
- Tooltips: a single provider; no tooltip on every layer row (use the row text; `title` only when truncated if needed).
- Resizable: verify no per-frame React work in canvas during drags (S3).
- Popover/Select content is portaled and unmounted when closed (Radix default); do not force-mount.

### 5.2 Schema / data

- No new document fields. Layout widths and theme live in `localStorage`, never in `PageDocument` or SQLite.
- Context-menu actions use existing `document-ops.ts` functions only.

### 5.3 Accessibility to keep (checklist for every slice)

| Pattern | Where | Must stay |
|---------|-------|-----------|
| Listbox layers | `LayersPanel.tsx` | `role="listbox"` + `aria-label="เลเยอร์"`, rows `role="option"` + `aria-selected`, `data-kbd-scope`/`data-layer-row` hooks used by `isCanvasShortcutFocus()` |
| Roving tabindex | `ColorField.tsx` presets | One Tab stop, ←/→/↑/↓/Home/End. Move the code into the popover as is. |
| `role="group"` + `aria-labelledby` | `SegmentedField`, `BoxSpacingField` sides, `ModeSwitch` (`aria-label`) | Radix ToggleGroup root renders `role="group"`; pass `aria-labelledby`/`aria-label` through. |
| `aria-describedby` / `aria-invalid` | `ColorField` hex input | Same ids and error text. |
| Label association | `FieldRow` `<label htmlFor>` vs `<span id>` for groups | Radix `SelectTrigger`, `Switch`, `SliderThumb`/inputs must carry the `id` the label points at. |
| Disclosure | Style section headers | `aria-expanded` + `aria-controls` kept (own button, not Collapsible). |
| Live regions | Toasts | Errors assertive, others polite. |
| Canvas focus scope | `DesignCanvas` `tabIndex={0}` `aria-label="ผืนผ้าใบ"` | Unchanged. |

---

## 6. Keyboard map (unchanged + additive)

| Keys | Scope | Status |
|------|-------|--------|
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Window, not native text / inline edit | Unchanged; **new guard** while a dialog/menu is open (S7) |
| Delete / Backspace, Enter, Esc, ↑/↓ | Canvas or layers scope only | Unchanged |
| ←/→ | Toggle groups, color presets, slider | Radix roving / slider (new for toggles) |
| Menu key / Shift+F10 | Focused layer row | New (context menu) |
| Ctrl+K | Editor | New, optional (S8) |
| Ctrl+S | — | **Not added** in this spec. If PM wants it: save when dirty, `preventDefault`, works from any focus except inline edit. |

---

## 7. Behavior changes (review with PM before DEV starts)

1. **Resizable panes persist widths** (S3): panel sizes survive restart via `localStorage`. The layers pane can be collapsed by dragging below its minimum; the new top bar toggle drives the existing but unused `isSidebarOpen`.
2. **Two extra Tab stops** (S3): each resize handle is focusable.
3. **Toggle groups change semantics and Tab order** (S2, S4): Radix `ToggleGroup type="single"` items expose `role="radio"` + `aria-checked` inside `role="group"` instead of `aria-pressed` buttons; one Tab stop plus arrow keys instead of one stop per option. Clicking the active option no longer "re-selects" (ignored).
4. **Radix Select vs native `<select>`** (S4): trigger is a button (`role="combobox"`); ↑/↓ on a closed trigger **opens** the list instead of changing the value immediately; the value is written once on selection (native `onChange` could write on each arrow press on some platforms → fewer undo steps now). Typeahead still works. Empty-string values need sentinels. The list is themed instead of a GTK popup.
5. **Slider pointer capture** (S4): Radix captures the pointer, so the drag keeps tracking outside the control and `onValueCommit` reliably ends the history group (fixes a possible missed `pointerup` on the native range). One drag = one undo step must hold; keyboard arrows commit per step and rely on key coalescing, like today. PageUp/PageDown/Home/End now step by 10 / jump to ends.
6. **Color picking moves into a popover** (S4): presets are one click further away (PM can keep the inline row). The GTK system color dialog is still reachable via **เลือกจากระบบ…**. First Esc in the popover's hex field reverts the draft; second Esc closes.
7. **Radix focus management vs canvas key listeners** (S2–S8): menus, popovers, selects and dialogs move focus into portaled content and restore it on close. Node shortcuts are inert meanwhile (they require canvas/layers focus). Focus returns to the trigger; after a context-menu action on a deleted row, focus must be restored into the layers scope (same rAF fallback as the Delete key).
8. **Undo blocked while a dialog/menu is open** (S7): today Ctrl+Z can change the document behind `UnsavedChangesDialog`, `DeleteProjectDialog` or an open dropdown.
9. **Unsaved-changes and delete dialogs become AlertDialogs** (S6, S7): clicking the overlay no longer cancels; Esc still cancels. Delete keeps Cancel focused; Unsaved initial focus is **ยกเลิก** (PM decision 2026-09-28, the safe choice).
10. **Sonner replaces the custom toaster** (S7): same texts and timings; adds hover-to-pause and swipe-dismiss; stack animation. Manual save failure now also toasts (banner stays).
11. **Right-click on a layer selects it** and opens a menu (S5). New actions **เลื่อนขึ้น/เลื่อนลง** reorder via the menu (previously only drag on canvas).
12. **Optional roving tabindex in layers** (S5): if accepted, only the selected row is a Tab stop and focus follows ↑/↓. Today every row is a Tab stop and focus does not follow selection.
13. **Denser controls** (S0/S4): 28 px instead of 32 px in the Style panel; text sizes 10 px → 11 px for Thai.
14. **Dark mode** (S8): app chrome follows the OS by default once shipped; canvas page stays light by design.
15. **Ctrl+K** (S8): new global shortcut in the editor.
16. **Preview device picker** (S2b): Preview is no longer capped at 768 px wide; device presets use a fixed-height, internally scrolling frame; the device choice persists app-wide. See DEVICE-PREVIEW-SPEC §11.

---

## 8. Out of scope

- Canvas rendering (`node-view.tsx`), selection colors on canvas, compiler/preview output, schema, `defaults.rs`.
- New document operations (duplicate, hide, lock toggles, rename project from the list), project thumbnails, search/sort on the project list.
- Layer tree expand/collapse (`Collapsible`), drag-to-reorder inside the layers panel.
- Custom HSV color picker (spec forbids color libs; native picker remains).
- Native Tauri app menus.

---

## 9. Copy sheet (new strings only; existing Thai labels unchanged)

| Key | Thai |
|-----|------|
| Save: clean | บันทึกแล้ว |
| Save: saving | กำลังบันทึก… |
| Save failed (manual) | บันทึกไม่สำเร็จ |
| Layers pane toggle | แสดง/ซ่อนแผงเลเยอร์ |
| Resize handle label | ปรับขนาดแผง |
| Palette tooltip hint | คลิกเพื่อแทรก · ลากไปวางบนผืนผ้าใบ |
| Context: edit text | แก้ไขข้อความ |
| Context: move up / down | เลื่อนขึ้น / เลื่อนลง |
| Context: delete | ลบ |
| Color popover: system picker | เลือกจากระบบ… |
| Color popover: presets heading | สีสำเร็จรูป |
| Undo / Redo (menus, palette) | เลิกทำ / ทำซ้ำ |
| Command palette placeholder | ค้นหาคำสั่งหรือเลเยอร์… |
| Command palette empty | ไม่พบคำสั่ง |
| Command groups | คำสั่ง · เพิ่มองค์ประกอบ · เลเยอร์ · มุมมอง |
| Theme | ธีม: ตามระบบ / สว่าง / มืด |
| Menubar (optional) | ไฟล์ · แก้ไข · มุมมอง |

---

## 10. Acceptance (whole refresh)

- [ ] Every slice's checklist passes; `bun run build` clean; no TypeScript `any` added in UI wrappers.
- [ ] `src/schema.ts` and `src-tauri/src/defaults.rs` unchanged.
- [ ] All existing Thai labels identical (diff the copy in `EditorTopBar`, `ModeSwitch`, `ElementPalette`, `LayersPanel`, `StylePanel`, `style/*`, `components/projects/*`).
- [ ] Keyboard map §6 verified in Tauri on Linux (WebKitGTK) with Orca spot checks for listbox, toggle groups, selects, dialogs, toasts.
- [ ] Startup JS gz grows ≤ ~60 KB; idle CPU ≈ 0 with the editor open; no animation runs while idle.
- [ ] Same edits produce byte-identical saved documents before/after the refresh.
