# Phase 4 — Section templates and responsive styles

**Product:** Web Builder (Tauri desktop)
**Date:** 2026-09-29
**Status:** Spec only. DEV does not start until the user has seen the summary. This task does not change `src/schema.ts` or `src-tauri/src/defaults.rs`.
**Scope:** End-user page sections a visitor sees, and optional per-breakpoint styles on those nodes. Not more app chrome.

App chrome stays in `docs/UI-REFRESH-SHADCN.md`. The style panel's base fields stay in `docs/STYLE-PANEL-SPEC.md`. Device frames stay in `docs/DEVICE-PREVIEW-SPEC.md`.

---

## What this phase is

A visitor-facing page is a tree of existing nodes. This phase adds two things on top of that tree: a way to insert a small section in one step, and a way for one node to carry a few style overrides that apply only at narrower frames or on an unfolded foldable.

Neither feature is new chrome. The left pane, top bar, and style panel keep the shells they have.

## Non-goals

- No new app chrome, and no extension of `docs/UI-REFRESH-SHADCN.md`.
- No animation timeline.
- No freeform CSS editor.
- No rewrite of saved documents on open.
- The menubar stays out.

---

## 1. Section templates

A template is an insert action. It creates a small tree of existing PageDocument nodes in one undo step. It is not a saved type. After insert, the tree is ordinary nodes. Re-opening a document does not remember which template was used.

The document field is `version`. Saved files store the number `1`. Specs call that contract schema v1.1; `1.1` is not the JSON value. The first template slice does not write a new `version` and does not add fields.

### First set

Five templates. No new schema. Every node is a kind the add palette already inserts (`PALETTE_TYPES` in `src/lib/document-ops.ts`). The palette labels are `ส่วน`, `กล่อง`, `หัวข้อ`, `ข้อความ`, `รูปภาพ`, `ปุ่ม`, `ลิงก์`, `ช่องว่าง`. `หน้า` is the page root and is not inserted. There is no icon kind.

A "box" in the list below is a `container` (`กล่อง`). A section is `display: block` and has no `direction` prop, so a side-by-side row is a `container` with `direction: "row"`. That prop already exists. It is not a style key.

Each template has a Thai name, a one-line description, and short Thai placeholder copy. Style, when set, uses only keys that exist on `StyleProps` today (listed in section 2). Container `direction`, `gap`, `align`, and `justify` may be set because they already live on container props. Omit any style key that still matches the type default. Each tree is under 15 nodes.

1. **แนะนำ** — a hero: one section, one heading, one text, one button. Four nodes. Heading level 1, content `ยินดีต้อนรับ`. Text `แนะนำตัวสั้น ๆ`. Button label `เริ่มต้น`. Section `textAlign` `center`.
2. **ข้อความและรูป** — a split: a section, a row container, and two boxes. One box holds an image (empty asset id, same as a palette image). The other holds a heading `เรื่องราว` and text `ข้อความคู่กับรูป`. Seven nodes.
3. **ชวนทำ** — a call to action: one section, one heading, one text, one button. Four nodes. Heading `พร้อมหรือยัง`, text `ชวนให้ลงมือทำ`, button `ติดต่อ`.
4. **จุดเด่น** — features, no icons: a section, a heading `จุดเด่น`, a row container, and three boxes. Each box is a heading plus text: `เร็ว` / `โหลดไม่นาน`, `ชัด` / `อ่านง่าย`, `ใช้งานง่าย` / `แก้ได้ทันที`. Twelve nodes.
5. **ท้ายหน้า** — a footer: a section, text `© 2026`, and a row container of three links (`หน้าแรก`, `เกี่ยวกับ`, `ติดต่อ`, each `href` `#`). Six nodes.

Insert at the end of the page. If a section is selected, or the selection is inside a section, insert after that section instead (as the next child of the page, not inside the section). This is not the palette's `resolveInsertTarget`, which appends inside a selected container.

One history entry. Ctrl+Z removes the whole tree. After insert, focus the new heading (the first heading in the tree).

### Picker

Two entry points, no new panel.

- A command-palette group `เทมเพลต`, beside the existing groups `คำสั่ง`, `เพิ่มองค์ประกอบ`, `เลเยอร์`, and `มุมมอง`. Each item is the Thai template name plus its one-line description.
- A `เทมเพลต` control in the existing add area of the left pane (the `เพิ่ม` block in `ElementPalette`, inside the layers pane). One control, not an eighth palette tile.

The add tiles are `h-12` (48px) in a four-column grid, with `text-[11px]` labels. They are not 28px, and this slice does not resize them. The `เทมเพลต` control is a separate full-width row at `h-7` (28px), the same control height as style fields and the top bar, sitting under that grid.

The empty-page hint may offer **แนะนำ** as the primary action. It must still show `ไม่มีเลเยอร์` when the page root has no children. That string is the empty title in the layers list today; do not replace it.

### Later schema, not in the first template slice

Icon, shadow, and hover do not exist, so they are not available to templates and they are not part of the breakpoint work below.

- **Icon.** No icon node kind and no icon property on any node. Proposed later: an optional icon on a feature item, or a new node kind. Not in the first five templates.
- **Shadow.** `StyleProps` has no shadow key and no `boxShadow`. Proposed later: one optional shadow string on `StyleProps`. Until that exists, templates must not invent it.
- **Hover.** There is no hover style map. A button hover color would be a new optional map on the button, not a key that exists today.

Those three stay in section 4, slice P4-S6. They are not smuggled into `styleBreakpoints`.

---

## 2. Per-breakpoint styles

`docs/DEVICE-PREVIEW-SPEC.md` §12 defers this work. Two constraints from that spec are binding here:

> Device presets stay app-side (`src/lib/devices.ts`); only breakpoint thresholds would live in the document.

> Foldable-aware output (Viewport Segments CSS) would be a compiler feature. The hinge overlay stays a visual aid.

And §9, which the fold rule must not pretend away:

> **No Viewport Segments:** `env(viewport-segment-*)` and `@media (horizontal-viewport-segments: 2)` are not supported by the host engines in an iframe. The hinge line is visual only.

§12 also sketched `activeBreakpoint = breakpointFor(effectiveWidth)`, with the Design canvas editing that breakpoint and a badge on the toolbar. This phase does not do that. The device picker stays preview chrome. Preset sizes do not move. The style segment and the device frame are separate controls. The Design canvas keeps the desktop layout so the editor does not jump. Preview still needs nothing new to *select* a query: the iframe width already drives `max-width` queries, and switching devices only resizes the iframe.

The same note's compiler half is this section: emit media queries from overrides. Fold-open is the viewport-segments feature that note left to the compiler. The hinge overlay is unchanged and is not published CSS.

Style breakpoints are separate from device frames. The preset CSS px sizes below are the ones in DEVICE-PREVIEW-SPEC §1. That spec does not define threshold numbers; `1024` and `719` are the style breakpoints, not frame sizes.

| Breakpoint | Thai label | Emitted CSS | Preview frames that use it |
|---|---|---|---|
| desktop base | เดสก์ท็อป | no media query | fill, desktop 1920, laptop 1366 |
| tablet | แท็บเล็ต | `@media (max-width: 1024px)` | tablet 820 |
| phone | โทรศัพท์ | `@media (max-width: 719px)` | phone 393, small phone 360, fold closed 412 |
| fold-open | จอพับที่กาง | `@media (horizontal-viewport-segments: 2)` | fold open 750 |

Frame names and sizes, unchanged: `fill` (stage width, auto height), `desktop` 1920×1080 (`เดสก์ท็อป`), `laptop` 1366×768 (`แล็ปท็อป`), `tablet` 820×1180 (`แท็บเล็ต`), `phone` 393×852 (`มือถือ`), `phone-sm` 360×800 (`มือถือเล็ก`), `fold-closed` 412×960 (`จอพับ (พับ)`), `fold-open` 750×832 (`จอพับ (กาง)`). The style-panel words `โทรศัพท์` and `จอพับที่กาง` are new. They do not rename the device picker, which keeps `มือถือ` and `จอพับ (กาง)`.

`fill` has no fixed width. It shows the desktop base only while the stage is wider than 1024px. A narrower stage matches the same queries as any other frame of that width. Do not give `fill` a special exemption inside the stylesheet.

Desktop is the base because existing documents have one style object. Emitting that style with no query keeps them identical.

**Cascade.** Each breakpoint stores only keys that differ from the base. Phone does not inherit tablet. If phone omits a key, the base value is used even when tablet set that key.

**Unfolded foldable.** It is not a width. 750px matches the tablet query (`max-width: 1024px`) and does not match the phone query. The phone cutoff is 719px so this 750px frame stays on the tablet query. A cutoff of 767px would also match it. 719px still covers the folded frame at 412px. `fold-open` is only `horizontal-viewport-segments: 2` (two side-by-side segments). If the browser has no viewport segments, width queries apply and 750px gets the tablet overrides. Do not add a width hack that would also restyle tablets. Inside today's Preview iframe, §9 applies: the segments query does not match, so the 750px fold-open frame shows tablet overrides. The device spec's hinge overlay stays preview chrome, outside the iframe, not published CSS.

### Data shape

Described only. No edit is specified here.

On the node, next to the existing `style` object, an optional sparse map `styleBreakpoints`. Each of `tablet`, `phone`, and `foldOpen` is a partial of `StyleProps`. Only keys that exist on `StyleProps` today are legal:

`display`, `width`, `height`, `minHeight`, `maxWidth`, `margin`, `padding`, `backgroundColor`, `color`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `textAlign`, `borderRadius`, `borderWidth`, `borderColor`, `borderStyle`, `opacity`, `overflow`.

Container `direction`, `gap`, `align`, and `justify` are props, not `StyleProps`. They are not breakpoint keys. Omit `styleBreakpoints` when empty. Do not write empty objects for a breakpoint that has no keys.

### Editor

- Style panel segmented control `เดสก์ท็อป` / `แท็บเล็ต` / `โทรศัพท์` / `จอพับ`, one row, 28px (`h-7`), `text-[11px]` minimum. Same pattern as `SegmentedField`: one tab stop, arrow keys move focus and do not write, Space/Enter select. The style panel is `w-72`, so the four labels share that width.
- Desktop edits write the base `style`, exactly as today.
- Other breakpoints write only changed keys into that override.
- A control with no override shows the base value without storing a copy. Overridden fields get a small dot, the same idea as the existing override dot. Reset label `ใช้ค่าหลัก` clears that one property on the active breakpoint. It does not reuse `คืนค่าเริ่มต้น`, which still resets a base field to the type default.
- Switching the style segment does not switch the preview device. The device picker still owns the frame. The panel may say which breakpoint the current frame uses.
- The Design canvas keeps the desktop layout so the editor does not jump. The breakpoint is visible in Preview via the device frame.
- One undo per change. A no-op does not dirty the document. Locked nodes disable overrides too.

### Compiler

Today `compiler.rs` emits one stylesheet and no media queries: a preflight, one rule per used node type from type defaults (`.t-section` and the rest), one `.t-hN` font-size rule per heading level used, and a per-node class `nN` only for declarations that differ from that type or level default. `decls` maps `StyleProps` onto CSS properties. Container flex values come from props on the container rule. The viewport meta stays `width=device-width, initial-scale=1`.

Matching that emitter:

- Base declarations stay where they are now (type rules, heading-level rules, and the sparse `nN` rule for the base style).
- One query per non-empty breakpoint, containing only that breakpoint's declarations, on the same node selector.
- Order: base, tablet (`max-width: 1024px`), phone (`max-width: 719px`), fold-open (`horizontal-viewport-segments: 2`). Under 719px both tablet and phone match, and phone wins. If fold-open also matches, it wins because it is last.
- An empty override emits nothing.
- Compile input grows only by the optional field. Switching preview device must not recompile. The srcDoc already contains every query; the iframe width selects the width queries. The segments query is selected by the browser, not by the frame width.
- Leave the viewport meta as it is.

### CPU and RAM

Compile once. Breakpoint switching is a view over data, not a compile. A device switch does not compile. No cloned document per breakpoint. No extra process. No per-frame measurement for this feature. A template insert is one store write.

---

## 3. Migration

- The loader keeps accepting the current document forever: `version` `1` (schema v1.1 in the specs).
- New fields are optional. A document with no `styleBreakpoints` compiles to one style and no media queries, identical to today.
- Do not rewrite on open. Do not bump `version` on open.
- On save, if nothing new is set, keep `version` `1` and do not add empty objects.
- On save, if any breakpoint override is present, write the next document version. The stored field is the integer `version`. The current value is `1`, so the next value is `2`. Specs may call that generation schema v1.2, the step after schema v1.1. Do not write `1.2` into `version`: `schema.ts` types it as the literal `1` today, and `defaults.rs` stores it as `u32`. This app reads both `1` and `2`. Older builds are not required to.
- Templates do not migrate stored documents.
- `defaults.rs` is unchanged until the slice that implements the field. This spec does not change it. `schema.ts` is unchanged by this spec as well.
- Round-trip: open a `version` `1` document, change nothing, save, and the version, nodes, and styles are unchanged.

---

## 4. Slices

**P4-S1 Templates, no schema change.**

- Five Thai templates: `แนะนำ`, `ข้อความและรูป`, `ชวนทำ`, `จุดเด่น`, `ท้ายหน้า`.
- Insert is one undo, and Ctrl+Z removes the whole tree.
- Nodes are ordinary palette kinds (`section`, `container`, `heading`, `text`, `image`, `button`, `link`).
- Each template is under 15 nodes.
- An empty document still opens.
- `schema.ts` is untouched.
- Thai labels, 11px minimum type, 28px for the new `เทมเพลต` control. Palette tiles stay `h-12`.

**P4-S2 Optional breakpoint map only.**

- A phone override on one property leaves the base `style` unchanged.
- An empty override is not stored.
- Reload keeps a real override.
- A `version` `1` file with no overrides saves without a version bump.
- No icon, shadow, or hover field in this slice.

**P4-S3 Style panel control.**

- Four Thai segments: `เดสก์ท็อป`, `แท็บเล็ต`, `โทรศัพท์`, `จอพับ`.
- Overridden fields show a dot. `ใช้ค่าหลัก` clears that one property.
- A no-op does not dirty the document.
- Locked nodes disable overrides.
- The Design canvas does not relayout when the segment changes.

**P4-S4 Compiler queries.**

- Phone rules only inside `max-width: 719px`.
- Tablet rules only inside `max-width: 1024px`.
- The base has no query.
- An empty override emits nothing.
- A `version` `1` document's compiled CSS has no extra queries versus today's compiler.
- A preview device switch does not compile again.

**P4-S5 Fold-open.**

- `foldOpen` rules only under `horizontal-viewport-segments: 2`.
- A 750px frame without that feature uses tablet rules.
- The device-spec hinge overlay is unchanged.

**P4-S6 Deferred icons, shadow, and hover.** Not started unless the user asks.

- Optional icon (no node kind and no icon property today).
- Optional shadow string on `StyleProps` (no shadow key today).
- Optional button hover map, first key a hover color (no hover map today).

---

## How this relates

`DEVICE-PREVIEW-SPEC.md` §12 is fulfilled by section 2. Preset sizes stay. The hinge overlay stays preview chrome. `UI-REFRESH-SHADCN.md` is not extended. `STYLE-PANEL-SPEC.md` still describes the base panel; this adds the breakpoint control on top, with `ใช้ค่าหลัก` distinct from `คืนค่าเริ่มต้น`.
