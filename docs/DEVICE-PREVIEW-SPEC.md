# Web Builder — Device Preview Spec (Part 1)

**Product:** Web Builder (Tauri desktop)
**Scope:** Preview mode only. A device picker for the compiled Preview: presets, rotate, custom size, scale-to-fit, optional hinge line and optional multi-device view.
**Slice:** S2b in `docs/UI-REFRESH-SHADCN.md` (after S2 "Top bar + ModeSwitch"; uses `select`, `toggle-group`, `toggle`, `tooltip` from S1).
**Hard constraints:**
- `src/schema.ts` is **locked**. No document fields. Device choice is an app preference in `localStorage`, never in `PageDocument` or SQLite.
- The compiler and its output do not change. Switching devices **only resizes the iframe**. It never recompiles and never resets `srcDoc`.
- Low CPU/RAM: no device frame images, no animation libs, at most a light CSS bezel. At most 3 iframes, and offscreen frames are blanked.
- Thai-first copy. The existing labels **เดสก์ท็อป / แท็บเล็ต / มือถือ** from `docs/DESIGN-PREVIEW-UX.md` §3.2/§7 are kept as they are.
- Keyboard shortcuts unchanged. No new global shortcut in this slice.

---

## 0. Current Preview code (audit, 2026-09-25)

| Piece | Where | What it does today | Impact on this spec |
|-------|-------|--------------------|---------------------|
| Mode branch | `src/pages/EditorPage.tsx` | `mode === "preview"` renders `<PreviewStage />` full width (side panels unmounted) or "กำลังเปิดโปรเจกต์…" until `documentReady` | Device toolbar shows only in this branch |
| Compile | `src/components/editor/PreviewStage.tsx` → `invoke("compile_preview", { document, projectId })` → `src-tauri/src/commands.rs` `compile_preview` → `compiler.rs` `compile(…, CompileOptions { preview: true, asset_base_url: None })` | Compiles the in-memory document (unsaved edits included). Runs once on entering Preview, then **debounced 200 ms (`RECOMPILE_MS`)** on every `openDocument` change. Stale responses are dropped via the `seq` counter. | No change |
| srcDoc holding | `PreviewStage.tsx`: `const [html, setHtml] = useState<string \| null>(null)` + `htmlRef` | The compiled string lives in state and changes **only when a compile resolves**. The compile effect depends on `[openDocument, compile]` only. | **Effectively memoized**: a device switch re-renders with the same string, so React does not touch the `srcdoc` attribute. Two caveats below. |
| Iframe | `PreviewStage.tsx` | `<iframe title="ตัวอย่างหน้าเว็บ" sandbox="allow-same-origin" srcDoc={html} referrerPolicy="no-referrer" onLoad={measure} />`, no `allow-scripts` | Parent can read `contentDocument` (same origin) with no scripts in the child. Keep the sandbox exactly as it is. |
| Frame size | `PreviewStage.tsx` | Wrapper `w-full max-w-3xl` (**max 768 px wide**) inside `overflow-auto bg-muted/40 p-6`. **Auto-height**: `measure()` sets the frame to `0px`, reads `documentElement.scrollHeight`, sets height (min `MIN_FRAME_PX = 480`). A `ResizeObserver` re-measures when the frame width changes. | Today "Preview" is a 768 px-wide, page-length frame, **narrower than a tablet**. Device presets need a **fixed viewport height** with internal scrolling (§4.2). |
| Compiled page | `src-tauri/src/compiler.rs` | `<meta name="viewport" content="width=device-width, initial-scale=1">`, preview CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data:`, base CSS `html,body{height:100%}` | Inside an iframe the layout viewport is the iframe box. `vw`, `vh`, `%` heights and any future media queries resolve to the device size **if** the frame has a real height. |
| Status UI | `PreviewStage.tsx` | Early returns for empty doc / error (**ลองอีกครั้ง**) / loading (`Loader2` + **กำลังสร้างตัวอย่าง…**) | The toolbar stays visible in these states (disabled while loading/error) |

**Caveats found:**
1. **Auto-height fights device heights.** `measure()` briefly collapses the frame to 0 px, so `html,body{height:100%}` and any `vh` content measure against 0. For device presets the frame must have the device height, and `measure()` must not run. Keep auto-height only for the "เต็มพื้นที่" (fill) mode.
2. **Remount = reparse.** The early-return branches (loading/error/empty) unmount the iframe. The new stage must keep **one stable element tree** across device changes: same component, same `key`, only `style` changes. Never key frames by device id. Otherwise every switch reparses `srcDoc`.
3. Every recompile makes a new string, and each mounted iframe reloads it. That is rare in Preview (the document only changes via undo/redo there), but it multiplies with multi-view (§6).
4. `max-w-3xl` makes the current default narrower than a laptop. This spec replaces it (behavior change B1).
5. `docs/DESIGN-PREVIEW-UX.md` §10 lists "device frame bezels" as out of scope, and §3.2 puts presets in a strip *inside* the stage. This spec overrides both on PM request: a CSS-only bezel is allowed (no images), and the controls go in the S2 top bar, with the in-stage strip as a fallback (§8).

---

## 1. Device presets

All sizes are **CSS px** (layout viewport), portrait for handhelds and landscape for desktop/laptop. "DPR" is informational only: an iframe cannot emulate `devicePixelRatio`, so the host's DPR applies (§9).

| # | Thai label | id | W × H (CSS px) | DPR (real device) | Source |
|---|-----------|----|----------------|-------------------|--------|
| 0 | เต็มพื้นที่ | `fill` | stage width × auto | host | Current behavior, widened (no source; not a device) |
| 1 | เดสก์ท็อป | `desktop` | 1920 × 1080 | 1 | StatCounter desktop screen resolutions, Aug 2026: 1920×1080 = 22.2% (#1). https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide |
| 2 | แล็ปท็อป | `laptop` | 1366 × 768 | 1 | Same StatCounter table: 1366×768 = 5.2%. Alternatives: 1536×864 (6.7%, a 1080p laptop at 125% scaling) and Chrome DevTools "Laptop with MDPI screen" 1280×800. |
| 3 | แท็บเล็ต | `tablet` | 820 × 1180 | 2 | Apple iPad Air 11-inch tech specs: 2360×1640 px panel, 264 ppi, 2× → 1180×820 CSS. https://www.apple.com/ipad-air/specs/ (DevTools "iPad Mini" 768×1024 is the older classic size) |
| 4 | มือถือ | `phone` | 393 × 852 | 3 | Chrome DevTools preset "iPhone 16" 393×852 @3 (`EmulatedDevices.ts`); DeviceAtlas May 2026: 393×852 = iPhone 14 Pro / 15 / 16, 11.9% of iPhone traffic. |
| 5 | มือถือเล็ก | `phone-sm` | 360 × 800 | 2.25 | Chrome DevTools preset "Samsung Galaxy A55" 360×800 @2.25; DeviceAtlas May 2026: 360 px is the most common mobile width (18.2%). |
| 6 | จอพับ (พับ) | `fold-closed` | 412 × 960 | ~2.6–3 | DeviceAtlas May 2026: Galaxy Z Fold7 about 412×960 folded. Cross-check: DevTools "Galaxy Z Fold 6" 412×968 @2.625. |
| 7 | จอพับ (กาง) | `fold-open` | 750 × 832 | ~2.6 | DeviceAtlas May 2026: Galaxy Z Fold7 about 750×832 unfolded. Cross-check: DevTools "Galaxy Z Fold 6" spanned 744×860, hinge at x = 372 (center, 0 px wide). |
| 8 | *(optional, hidden by default)* Pixel Fold (กาง) | `pixel-fold-open` | 836 × 842 | 2.625 | DevTools "Pixel 9 Pro Fold" spanned 836×842, hinge x = 418; folded 412×922. DeviceAtlas reports 444×995 / 755×783 in real traffic, so the sources disagree. Ship only if PM wants a second foldable. |
| — | กำหนดเอง | `custom` | user (240–3840) × (240–3840) | host | §3 |

Sources:
- Chrome DevTools device list: https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/emulation/EmulatedDevices.ts
- DeviceAtlas "Viewport, Resolution, Diagonal Screen Size, and DPI for the Most Popular Smartphones" (18 May 2026): https://deviceatlas.com/blog/viewport-resolution-diagonal-screen-size-and-dpi-most-popular-smartphones

Notes:
- **Why Fold7 and not the user's 344×882 / 673×841:** 344×882 is DevTools' **Galaxy Z Fold 5** (unfolded 690×829). The Fold6/Fold7 generation widened the cover screen to ~412 px. The 2026 **Fold8** line exists, but third-party viewport figures for it conflict and it is not in the DevTools list yet. Revisit when DevTools adds it; only the preset table in `src/lib/devices.ts` changes.
- Desktop/laptop numbers are **screen** sizes. A real browser loses ~80–130 px of height to its toolbars. We use the full screen height (simpler, and the page is scrollable anyway).
- The hinge for `fold-open` is drawn at the horizontal center (x = W/2), per the DevTools foldable model (0-px hinge, centered).
- Default preset: **`fill`** (closest to today, no scaling). The last choice is restored from storage (§7).

---

## 2. Rotate (portrait / landscape)

- A `Toggle` button (lucide `RotateCw`, 16 px), `aria-label="หมุนจอ"`, `aria-pressed` = landscape. Tooltip **แนวตั้ง** / **แนวนอน** (the state it switches to).
- Enabled for `tablet`, `phone`, `phone-sm`, `fold-closed`, `fold-open`, `pixel-fold-open`, `custom`. **Disabled** for `fill`, `desktop`, `laptop` (tooltip **ใช้ได้กับแท็บเล็ต มือถือ และจอพับ**).
- Effect: swap W and H (e.g. phone 852×393; fold-open 832×750 with a **horizontal** hinge at y = H/2). For `custom`, swap the stored W/H values.
- Orientation is one global flag (applies to whichever preset is chosen) and persists (§7).
- Changing orientation resizes the iframe (child relayout). It never recompiles.

---

## 3. Custom size

- Choosing **กำหนดเอง** in the Select reveals two compact numeric inputs `W` × `H` (`Input type="number"`, `h-7 w-16 text-xs`, suffix-free, `aria-label` **ความกว้าง (px)** / **ความสูง (px)**).
- Clamp **240–3840** on both. Commit on Enter or blur. While typing, invalid or out-of-range values are not applied; on commit they are clamped. Esc restores the last committed value. Do **not** reuse `style/NumberField.tsx`: it opens document history groups on focus, and this is not a document edit.
- Editing W or H while a preset is active **switches the Select to กำหนดเอง**, seeding the inputs with the current effective size (rotation applied), then applying the edit.
- Picking a preset afterwards does not erase the custom values; they persist separately and return when **กำหนดเอง** is chosen again.
- When a preset is active, the inputs are replaced by a read-only readout `393 × 852` (`text-xs tabular-nums text-muted-foreground`). Clicking the readout focuses W and switches to custom (same rule as above).

---

## 4. Stage and frame

### 4.1 Layout

- Stage = the current `PreviewStage` scroll container (`flex-1 min-h-0 overflow-auto bg-muted/40`), padding `p-6`, content centered.
- **Device frame** (all presets except `fill`): a sizer `div` (layout size = W·s × H·s, so the stage scrolls correctly) containing an absolutely positioned wrapper at W × H with `transform: scale(s)` and `transform-origin: top left`. The wrapper holds the iframe at `width: W; height: H`.
- **Light bezel (CSS only):** handhelds get `rounded-[20px] ring-1 ring-border bg-background p-2 shadow-sm`, and the iframe gets `rounded-[12px]`. Desktop/laptop get `rounded-md ring-1 ring-border`. No images, no notch or cutouts, no status bar.
- **Label under the frame:** `text-[11px] text-muted-foreground`: **มือถือ · 393 × 852 · 79%**.
- **`fill` mode:** no sizer or scale. The frame is `w-full`, and auto-height uses the existing `measure()` + `ResizeObserver` path. This is today's behavior without the `max-w-3xl` cap (B1).

### 4.2 Fixed viewport height

- Device frames use `height: H` and the compiled page scrolls **inside** the iframe (native scrolling; no scripts needed). `measure()` and its `ResizeObserver` are skipped for device presets. This makes `100%`/`vh` resolve to the device height, as on a real device (B2).

### 4.3 Scale-to-fit and zoom

- Zoom control: `ToggleGroup type="single"` with **พอดี** | **100%** (`aria-label="การย่อขยาย"`), plus a readout `64%` (`text-xs tabular-nums`, `aria-live="off"`).
- **พอดี:** `s = clamp(0.25, min((stageW − 48) / W, (stageH − 48 − labelH) / H), 1)`. Never upscale beyond 100%.
- **100%:** `s = 1`. The stage scrolls in both axes; the frame is centered when smaller than the stage.
- Computation: one `ResizeObserver` on the stage element. Callbacks are coalesced with `requestAnimationFrame`, and `setScale` runs only when `|Δs| > 0.005`. Scale lives in local component state, not a store, so nothing else re-renders.
- A scale change is a compositor-only transform: the child document does **not** relayout on window resize. Only W/H changes relayout the child.
- Disabled (both options) in `fill` mode, where the readout shows **100%**.

### 4.4 Hinge / fold overlay (optional)

- `Toggle` (lucide `SeparatorVertical`, 16 px), `aria-label="แสดงแนวพับ"`, visible only for `fold-open` / `pixel-fold-open`. Default **on** for those presets.
- Rendering: a sibling `div` of the iframe inside the scaled wrapper, `pointer-events-none absolute`. Vertical: `left: W/2 − 1px; top: 0; bottom: 0; width: 2px`. Horizontal when rotated: `top: H/2 − 1px`. Style: `bg-foreground/15` with a 1 px `outline-foreground/30` edge (≈ DevTools hinge colors rgba(38,38,38,.2/.7)).
- It lives **outside** the iframe, never touches `srcDoc` or the compiler, and has no effect on export.

### 4.5 Sketch

Top bar in Preview (S2 layout; the device cluster appears only in Preview):

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [◧] │ โปรเจกต์ › ชื่อโปรเจกต์ │ [📱 มือถือ ▾] 393×852 [⟳] [พอดี|100%] 79% [┆] [⧉] │ [✎ ออกแบบ|👁 ตัวอย่าง] [⇩ ส่งออก] [● บันทึก] │
└───────────────────────────────────────────────────────────────────────────────────────────┘
   ⟳ = หมุนจอ   ┆ = แสดงแนวพับ (foldable open only)   ⧉ = หลายอุปกรณ์
   custom:  [กำหนดเอง ▾] [ 500 ]×[ 900 ] [⟳] ...
```

Stage, single device (fit):

```
┌──────────────────────── stage (bg-muted/40, overflow-auto) ────────────────────────┐
│                                                                                    │
│                               ╭───────────────╮                                    │
│                               │ ┌───────────┐ │  ← CSS bezel (ring-1, p-2)         │
│                               │ │  iframe   │ │                                    │
│                               │ │  393×852  │ │  scaled 79% via transform          │
│                               │ │ (scrolls  │ │                                    │
│                               │ │  inside)  │ │                                    │
│                               │ └───────────┘ │                                    │
│                               ╰───────────────╯                                    │
│                              มือถือ · 393 × 852 · 79%                              │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Foldable open with hinge, and multi-view (3 frames, shared scale):

```
  ╭──────────┬──────────╮        ┌────┐   ┌────────┐   ┌──────────────────┐
  │          ┆          │        │    │   │        │   │                  │
  │  750 ×   ┆   832    │        │ 📱 │   │   ▭    │   │       🖥          │
  │          ┆          │        │    │   │        │   │                  │
  ╰──────────┴──────────╯        └────┘   └────────┘   └──────────────────┘
     ┆ = hinge overlay            มือถือ    แท็บเล็ต       เดสก์ท็อป   · 31%
```

---

## 5. Toolbar placement and controls

- Lives in `EditorTopBar` (S2), rendered **only when `mode === "preview"`**, between the title block and `ModeSwitch`, separated by vertical `Separator`s. Disabled (not hidden) while Preview is loading or in error, so the bar does not jump.
- **Device Select** (`Select`, `SelectTrigger size="sm"`, `w-[150px]`, `aria-label="อุปกรณ์"`): leading lucide icon per item (`Maximize` fill, `Monitor` desktop, `Laptop` laptop, `Tablet` tablet, `Smartphone` phone/phone-sm, `BookOpen` fold-closed/open), label, and dimensions right-aligned in `text-muted-foreground`. Groups: **ทั่วไป** (fill, desktop, laptop) · **มือถือและแท็บเล็ต** · **จอพับ** · separator · **กำหนดเอง**.
- Size readout / custom inputs (§3), rotate `Toggle` (§2), zoom `ToggleGroup` + readout (§4.3), hinge `Toggle` (§4.4), multi-view `Toggle` (§6).
- Icons 16 px in the top bar; controls `h-7`; every icon-only control has a Thai `aria-label` and a `Tooltip`.
- **Narrow windows:** below ~1200 px top-bar width, move zoom, hinge and multi-view into a `DropdownMenu` **ตัวเลือกตัวอย่าง** (`SlidersHorizontal` icon) using `DropdownMenuRadioGroup` / `DropdownMenuCheckboxItem`. The device Select and rotate always stay visible. The window minimum is 960 px (`src-tauri/tauri.conf.json`).
- **Keyboard:** everything is reachable by Tab in visual order. Select: Space/Enter/↑/↓ open, typeahead works on Thai labels. Zoom group: one Tab stop, ←/→. Toggles: Space/Enter. No global shortcuts are added; canvas shortcuts are unmounted in Preview anyway.
- **Focus:** changing device keeps focus on the control. The iframe is not auto-focused.

---

## 6. Multi-device view (optional)

**Recommendation: single device by default. Multi-view off by default, capped at 3 frames, opt-in per session and remembered.**

- **Toggle** **หลายอุปกรณ์** (lucide `Columns3`) switches the stage to a horizontal row of frames. The device Select is then replaced by a `DropdownMenu` **เลือกอุปกรณ์ (สูงสุด 3)** with `DropdownMenuCheckboxItem`s. Once 3 are checked, the rest are disabled. Default set: `phone`, `tablet`, `desktop`. Custom and `fill` are not available in multi-view.
- **Shared scale:** one `s` for all frames so relative sizes stay true: `s = min(1, (stageW − gaps) / ΣW, (stageH − 48 − labelH) / maxH)`, floor 0.2. With 100% zoom the row scrolls horizontally.
- **One string, many documents:** every frame receives the same `html` string from `PreviewStage` state; the JS string is not copied. Each iframe is still a **separate document**: its own parse, style, layout, paint and memory (roughly a few MB to tens of MB each in WebKitGTK depending on content). That cost is why the cap is 3.
- **Pause offscreen frames:** one `IntersectionObserver` (root = stage, `rootMargin: "200px"`) on each frame's sizer. When a frame is not intersecting, render a same-size placeholder (`bg-muted` + label) **instead of the iframe** (unmount → document freed). When it comes back, mount the iframe with the current `html` (one reparse). Prefer this over `content-visibility: auto`: that skips painting but keeps the child document and its memory alive.
- **Recompile while multi-view is on:** only mounted (visible) frames reload. Offscreen frames pick up the new string when they remount.
- Rotate applies to all rotatable frames in the row. The hinge overlay applies to foldable frames.
- Turning multi-view off returns to the last single preset without recompiling.

---

## 7. Persistence

- Key: `localStorage["wb.preview.device.v1"]`, app-wide (not per project, not in the document).
- Shape: `{ preset: DeviceId, landscape: boolean, custom: { w: number, h: number }, zoom: "fit" | "100", hinge: boolean, multi: boolean, multiSet: DeviceId[] }`.
- Read once at startup and validate: unknown preset → `fill`; clamp custom to 240–3840; `multiSet` filtered to known ids and sliced to 3. Write on change (debounce ~250 ms).
- State lives in a small Zustand store (`src/stores/preview-device-store.ts`, optionally with `zustand/middleware` `persist`, which ships with the existing zustand, so no new dep). It must **not** be reset by `editor-store.resetEditorChrome()`.

---

## 8. Files (suggested)

| File | Change |
|------|--------|
| `src/lib/devices.ts` (new) | Preset table from §1 (id, Thai label, icon, w, h, rotatable, foldable, hinge axis), clamps, `effectiveSize(preset, landscape, custom)` |
| `src/stores/preview-device-store.ts` (new) | §7 state + setters |
| `src/components/editor/preview/DeviceToolbar.tsx` (new) | §5 controls (Select, inputs, Toggles, ToggleGroup, overflow menu) |
| `src/components/editor/preview/DeviceStage.tsx` (new) | §4 sizer/scale/bezel/label/hinge, `ResizeObserver` + rAF fit, multi-view row + `IntersectionObserver` |
| `src/components/editor/PreviewStage.tsx` | Keep compile/status logic as is. Replace the single frame markup with `<DeviceStage html={html} />`. Move `measure()` so it runs only in `fill`. Keep `sandbox`, `referrerPolicy`, `title`. |
| `src/components/editor/EditorTopBar.tsx` | Render `<DeviceToolbar />` when `mode === "preview"` |
| `src/stores/editor-store.ts` | None |
| `src-tauri/**`, `src/schema.ts` | **None** |

Fallback placement: if the S2 top bar is too crowded (for example after the optional S8 menubar), render the same `DeviceToolbar` as a 36 px strip at the top of the stage (`border-b bg-background`), which matches the earlier `DESIGN-PREVIEW-UX.md` §3.2 idea. The components are unchanged.

---

## 9. Fidelity limits (state them in a tooltip or docs, not in UI clutter)

- **DPR is not emulated:** the iframe uses the host `devicePixelRatio`, so `resolution` media queries, `srcset` choice and hairline rendering follow the desktop screen.
- **Engine is the host's:** WebKitGTK on Linux (WebView2 on Windows, WKWebView on macOS), not mobile Safari or Chrome.
- **No mobile UA, touch, `hover: none` or `pointer: coarse`:** input media features follow the host mouse.
- **Scrollbars:** classic scrollbars inside a 393 px frame take width that overlay scrollbars on phones do not. Optional, preview-only mitigation: after `load`, the parent injects `<style>html{scrollbar-width:thin}</style>` into `contentDocument` for handheld presets (allowed by the preview CSP `style-src 'unsafe-inline'`; no child scripts; never in export). PM call.
- **No Viewport Segments:** `env(viewport-segment-*)` and `@media (horizontal-viewport-segments: 2)` are not supported by the host engines in an iframe. The hinge line is visual only.
- **Fractional scale** can make text slightly soft in "พอดี". Use **100%** for pixel checks.

---

## 10. Performance rules

1. A device, rotate or custom change sets **only** iframe `width`/`height` (and wrapper scale). No `setHtml`, no `invoke`, no `key` change. Verify with a counter on `compile()` and by watching the iframe `load` event: neither may fire on a device switch.
2. Window or stage resize changes only `transform: scale()`; no child relayout.
3. One `ResizeObserver` for the stage, rAF-coalesced; one `IntersectionObserver` in multi-view.
4. At most 3 iframes mounted; offscreen frames unmounted.
5. No bezel images, no transitions on width/height (an instant resize avoids N relayouts per animation frame); `motion-safe:transition-transform duration-100` on the scale wrapper is allowed.
6. The toolbar reads the device store through narrow selectors so `PreviewStage`'s compile logic does not re-render on zoom changes.

---

## 11. Behavior changes

- **B1:** The default Preview (`fill`) is **no longer capped at 768 px** (`max-w-3xl`); it fills the stage width. Pages look wider than before at the same window size.
- **B2:** Device presets show a **fixed-height viewport with internal scrolling** instead of the page-length auto-height frame. `vh`/`100%` heights now resolve to the device height. `fill` keeps auto-height.
- **B3:** New top-bar controls appear **in Preview only**. The top bar is denser in Preview; on narrow windows secondary controls collapse into an overflow menu.
- **B4:** The device choice, orientation, zoom, hinge and multi-view persist across projects and restarts (`localStorage`), so Preview may open straight at "มือถือ".
- **B5:** A CSS bezel frames handheld presets. This relaxes `DESIGN-PREVIEW-UX.md` §10 "no bezels" (CSS only, no images).
- **B6:** Multi-view mounts up to 3 documents. Frames scrolled out of view are replaced by placeholders and reparse when they return (brief blank).
- **B7:** The loading/error states keep the device toolbar visible but disabled (previously there was no toolbar).

---

## 12. Future (Phase 4, needs schema v1.1 extension; not designed here)

- When the schema gains per-breakpoint style overrides, the **effective device width** from this picker becomes the **active breakpoint** input: `activeBreakpoint = breakpointFor(effectiveWidth)`. The toolbar would show it as a badge, and the Design canvas and Style panel would edit that breakpoint's overrides.
- The compiler would emit `@media (min-width/max-width: …)` blocks from those overrides. Preview needs nothing new, because the iframe width already drives the media queries.
- Foldable-aware output (Viewport Segments CSS) would be a compiler feature. The hinge overlay stays a visual aid.
- Device presets stay app-side (`src/lib/devices.ts`); only breakpoint thresholds would live in the document.

---

## 13. Copy sheet (new strings; existing labels unchanged)

| Key | Thai |
|-----|------|
| Device select label | อุปกรณ์ |
| Fill | เต็มพื้นที่ |
| Desktop / Tablet / Phone | เดสก์ท็อป / แท็บเล็ต / มือถือ *(existing, DESIGN-PREVIEW-UX §7)* |
| Laptop | แล็ปท็อป |
| Small phone | มือถือเล็ก |
| Foldable closed / open | จอพับ (พับ) / จอพับ (กาง) |
| Custom | กำหนดเอง |
| Width / height inputs | ความกว้าง (px) / ความสูง (px) |
| Rotate | หมุนจอ · แนวตั้ง / แนวนอน |
| Rotate disabled hint | ใช้ได้กับแท็บเล็ต มือถือ และจอพับ |
| Zoom group | การย่อขยาย · พอดี / 100% |
| Hinge toggle | แสดงแนวพับ |
| Multi-view toggle | หลายอุปกรณ์ |
| Multi-view picker | เลือกอุปกรณ์ (สูงสุด 3) |
| Overflow menu | ตัวเลือกตัวอย่าง |
| Select groups | ทั่วไป · มือถือและแท็บเล็ต · จอพับ |

---

## 14. Acceptance checklist

1. In Design mode the device toolbar is not rendered. In Preview it appears between the title and `ModeSwitch`.
2. Switching between any two presets does **not** call `compile_preview` and does **not** fire the iframe `load` event (instrumented check), and the iframe DOM node is the same object before and after.
3. Each preset renders the iframe at exactly the §1 CSS size (read `iframe.clientWidth/clientHeight`, which ignores the transform).
4. `fill` fills the stage width, keeps auto-height (min 480 px) and re-measures on window resize, as today minus the 768 px cap.
5. Device presets have a fixed height; the page scrolls inside the frame; `measure()` does not run.
6. Rotate is disabled for fill/desktop/laptop and swaps W/H for the others, including custom. `fold-open` rotated shows a horizontal hinge.
7. Custom W/H clamp to 240–3840 on commit; Esc restores; editing either while on a preset switches the Select to **กำหนดเอง** with values seeded from the current size.
8. **พอดี** never exceeds 100% and never goes below 25% (20% in multi-view); the readout matches the applied scale ±1%. **100%** scrolls the stage in both axes.
9. Window resize in **พอดี** updates the scale within one frame, with no child relayout (Performance panel: no layout inside the iframe document).
10. The hinge toggle appears only for foldable-open presets; the line sits at W/2 (or H/2 rotated), ignores pointer events, and changes nothing in export output.
11. Multi-view is off by default, allows at most 3 devices, uses one shared scale, and unmounts frames scrolled out of view (verify iframe count in the DOM).
12. All choices persist in `localStorage["wb.preview.device.v1"]` and restore after restart. Corrupt or unknown values fall back to `fill` without errors. Nothing is written to the document or SQLite (`dirty` stays false).
13. Every control is keyboard-operable with visible focus and Thai `aria-label`/tooltips; the Select supports typeahead; the zoom group is one Tab stop with ←/→.
14. At window width 960 px the top bar does not overflow; secondary controls are in **ตัวเลือกตัวอย่าง**.
15. `sandbox="allow-same-origin"` (no `allow-scripts`), `referrerPolicy="no-referrer"` and `title="ตัวอย่างหน้าเว็บ"` are unchanged on every frame.
16. Idle CPU ≈ 0 in Preview with 1 or 3 frames; no running animations or observers firing while idle.
17. `src/schema.ts` and `src-tauri/**` unchanged; `bun run build` clean.
