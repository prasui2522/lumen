# Phase 11 — Complete component set, style system, presets, blocks, motion

**Product:** Web Builder (Tauri desktop)
**Status:** approved 2026-10-26 (D1–D10 all option a). DEV starts with sub-phase A.
**Gate:** DEV does not touch `schema.ts`, `defaults.rs` or `compiler.rs` before sub-phase A step A1.1 is approved.
**Checked on:** 2026-10-26 against `src/schema.ts` (mtime 2026-10-05), `src-tauri/src/defaults.rs` (2026-10-05), `src-tauri/src/compiler.rs` (1292 lines), `export.rs`, `src/components/editor/*`, `src/lib/*`, `docs/PHASE-5B/6/6A/6B/7/9/10-SPEC.md`, `docs/STYLE-PANEL-SPEC.md`, `docs/RAM-BASELINE.md`, `docs/FOLLOWUPS.md`, plus the public shadcn docs index and licence pages read on 2026-10-26.
**Language:** this document is English. Thai appears only in §8 (new UI strings, keyed `T01…`) and where an existing string is quoted. Steps refer to strings by key, so every user-visible Thai string has exactly one home. Names of types, props, files and sections are English.
**Not in this phase:** Next.js project export (later), forms that submit, backend, a project-level design-token system. **Vite project export moved to Phase 12** (2026-11-03; ส่งออก is no longer HTML-zip-primary). **A4 resumed 2026-11-04** after Phase 12 v1 acceptance (`list` shipped as A4.1; `table` / `icon` next).

---

## 1. Goals and non-goals

**Goal.** Take the builder from "41 plain node types and 20 style keys" to "a set a designer can build a real marketing site from": every common shadcn component exists as a placeable node, every node can carry shadows, gradients, glass, transforms, hover/press states and entrance motion, and ready-made presets and blocks (hero, pricing, …) drag onto the canvas as ordinary editable nodes.

**Order (PM decision).** A components → B style system → C presets → D blocks → E motion. **Update 2026-11-04:** F2 closes → B0 (§9.B B-prelude, first B slice) → rest of B → PREVIEW-CODE-VIEW S2–S10. §11 D7 (approved, option a) settles the order: strictly A before B, no interleaved style slice.

**Priorities that decide every trade-off below** (user):
1. Stability and low RAM first. Startup loads none of this. New editor code lives in lazy chunks.
2. ~~The export stays a standalone static site: HTML + CSS, **no JS**.~~ **Superseded 2026-11-03:** ส่งออก is Phase 12 Vite+React; in-app Preview may still use HTML compile until rewritten.
3. Schema changes are additive. No version bump unless a real reason is found (§4.3 finds none).
4. Everything is customisable: no hard-wired look; presets and blocks dissolve into normal nodes.
5. UX/UI quality: a user should find, place and tune things without reading docs.

**Non-goals.**
- No React/Radix runtime in the exported site. Components that are interactive in shadcn (dialog open/close, combobox filtering, toast, command palette) are not given fake behaviour; each is either rendered with a CSS-only/native equivalent or kept design-only, honestly labelled (§9 A).
- No locked "block" object. A block is a recipe that inserts nodes.
- No pixel-matching, copy-matching or bundling of any paid product (§2).
- No project-level colour tokens or dark-mode switch for exported sites (decided, §11 D1).
- No JS-driven animation, parallax, autoplay (decided, §11 D2).
- No change to opening files: opening never rewrites a document.

---

## 2. Licence & attribution rule (binding for every step in this spec)

### 2.1 What is allowed, verified 2026-10-26

| Source | Licence (read today) | What Phase 11 may do |
|---|---|---|
| `shadcn-ui/ui` repo, including the free blocks at ui.shadcn.com/blocks | MIT, "Copyright (c) 2023 shadcn". The notice must be included in copies or substantial portions | Adapt structure with attribution recorded (§2.3). The free blocks are app-shell patterns (dashboard with sidebar, sidebar layouts, login/signup, calendar); they are React + Radix + Tailwind and use JS, so "adapting" means re-authoring as static node trees. |
| shadcn/ui components already in the app (`src/components/ui`, 23 files) | MIT (same) | Already shipped as editor chrome. Needs a notice (§2.3) if the app is ever distributed. |
| Lucide icons (planned `icon` node, §9 A4) | ISC "Copyright (c) 2026 Lucide Icons and Contributors"; a listed subset derived from Feather is MIT (Cole Bemis). The copyright and permission notice must appear in all copies | Embed a curated subset as path data. Notice required in the app and in any export that contains an icon (§2.4). |
| shadcndesign.com Pro Blocks, templates and design kit | **Proprietary and paid.** Their licence page (updated 2026-10-17) allows use in the buyer's own end products but forbids redistributing the products themselves, including inside a tool or template, an open-source project, a component library or a marketplace, even free or modified | **Never copy, recreate 1:1, bundle, or reference.** A builder that ships such blocks to its own users is redistribution even if the author bought a licence. |
| Any other template/kit/UI library | Unknown until read | Not used unless its licence is read, recorded in §2.3 and approved by the user. |

Not legal advice. Where the text below says "required" it follows the licence wording above; the one genuinely ambiguous point (exported sites) is settled by the approved §11 D5 (option a).

### 2.2 Block and preset authoring rules (DEV review rule)
1. Every block's structure is **authored from scratch or adapted from an MIT source with a recorded source line.** Nothing else.
2. **No pixel-matching** of any paid product: no copying a paid block's exact proportions, spacing scale, section order, decorative devices or visual signature, and no tracing from screenshots.
3. **No copy strings from paid products**: headlines, button labels, feature names and prices in blocks are generic placeholders written for this app.
4. Only **generic category names** and **common layout patterns** are used: hero, header, features, pricing, FAQ, CTA, testimonials, contact, logo cloud, stats, footer. A "pattern" is something every website has (a centered headline over two buttons); a "design" is a specific composition. Ship patterns, not designs.
5. A reviewer (not the author) ticks the checklist in D10.3 before a block is merged. Blocks that fail are removed, not tweaked.

### 2.3 Where attribution lives
- **`THIRD-PARTY-NOTICES.md`** at the project root, shipped inside the app as a bundled resource and shown in a lazy dialog from an About entry (T167, T168). It contains: the full MIT text for shadcn/ui and, for each MIT-adapted block, one line; the full ISC text for Lucide and the MIT text for the Feather-derived icons; tw-animate-css and other runtime deps' notices as DEV finds them (dependency audit is step D10.4).
- **Per-block `source` field** in the registry JSON (§9 D2): `{kind:"original"}` or `{kind:"mit", project, ref, retrieved}`. A bun test fails the build if `source` is missing, if `kind:"mit"` has no `ref`/`retrieved`, or if a `mit` block is not listed in the notices file.
- **v1 (approved, §11 D4/D5):** every block is `original`. shadcn's free blocks are app shells that this spec does not ship as marketing sections anyway (see §3.6). The `mit` path exists, is tested, and stays unused until the user asks.

### 2.4 Exported sites
- Block structure is re-authored node trees compiled into this app's own HTML/CSS, not shadcn source. With `original` blocks nothing from shadcn is in the export, so no notice is needed for blocks.
- **Icons are different:** an exported page that contains an `icon` node carries Lucide path data, i.e. a copy of ISC-licensed work. Approved (§11 D5 a): the export zip gains one `THIRD-PARTY-NOTICES.txt` **only when an icon is used**, and no visible attribution appears on the page. Whether that is legally sufficient stays outside this spec.

---

## 3. Ground truth from the code (verified 2026-10-26)

### 3.1 Counts
| Fact | Value | Where |
|---|---|---|
| `NodeType` union | 42 including `page` → **41 placeable** | `schema.ts`; `ALL_TYPES: [NodeType; 42]` in `compiler.rs` |
| Core types | 10: section, container, heading, text, image, button, link, spacer, input, switch | |
| `PHASE6B_TYPES` | 31: textarea, kbd, avatar, progress, slider, empty, item, marker, bubble, message, select, radio, toggle, toggleGroup, tabs, inputGroup, inputOtp, accordion, collapsible, breadcrumb, pagination, navigationMenu, menubar, dropdownMenu, dialog, alertDialog, sheet, drawer, popover, tooltip, hoverCard | `schema.ts` |
| Types that hold children | **3** — page, section, container. Every other kind is a leaf with flat props | `getChildren`, `CONTAINER_NODE_TYPES` |
| `StyleProps` keys | exactly **20**: display, width, height, minHeight, maxWidth, margin, padding, backgroundColor, color, fontFamily, fontSize, fontWeight, lineHeight, textAlign, borderRadius, borderWidth, borderColor, borderStyle, opacity, overflow | `schema.ts`; Rust struct `defaults.rs` ~355–398, `is_empty` ~400–423, `overlay_style` ~1047–1108 |
| Style breakpoints | `tablet`, `phone`, `foldOpen`; hold `StyleProps` only | |
| shadcn items installed | 23 in `src/components/ui` (alert-dialog, alert, button, card, context-menu, dialog, dropdown-menu, empty, input, kbd, label, popover, resizable, select, separator, skeleton, slider, sonner, spinner, switch, toggle-group, toggle, tooltip). **These are editor chrome, not placeable nodes.** No table, tabs, chart, carousel or calendar library is installed | |
| shadcn docs index today | 66 entries (Accordion … Typography), including docs-only pages (Typography, Direction, Data Table, Date Picker) | ui.shadcn.com/docs/components, 2026-10-26 |
| Initial JS | 112.05 kB gz. `EditorPage` chunk 69.4 kB gz, `DatabaseMode` 19.7 kB gz, `CommandPalette` 2.9 kB gz, `document-ops` 4.8 kB gz (measured from `dist/assets` on 2026-10-26) | `RAM-BASELINE.md`, `dist/assets` |

### 3.2 How styles are written and emitted today
- **Canvas (Design mode)** renders React inline styles via `node-view.tsx` `styleToCss(resolvedStyle(node))` and **ignores `styleBreakpoints`**; breakpoints show only in Preview/export. Buttons render as `<span>`, links as underlined `<span>`.
- **Compiler** (`compiler.rs`): PREFLIGHT reset, one `.t-<type>` rule per used type (`decls(default_styles)` + `type_extras`), `.nN` classes holding only declarations that differ from the type default (`diff()`), then `@media (max-width:1024px)` (tablet), `@media (max-width:719px)` (phone), `@media (horizontal-viewport-segments: 2)` (foldOpen, last). `decls()` ↔ `styleToCss` is the single TS↔Rust mirror point.
- **Sanitising:** `css_safe()` strips `{ } ; < > \`, control characters and comment markers, but not `url(`: a hand-edited document can put `url(https://…)` in `backgroundColor` (Preview CSP blocks it; export would carry it). Its strip and comment passes also run *before* any check, so `u/**/rl(` becomes `url(` and `//**` leaves a `/*` behind (comment removal is a single pass). Low severity; **fixed in A1.3** (PM decision 2026-10-26, moved from B1.1: the fidelity pass is the first step that ships new compiler CSS, so the sanitiser is hardened first; contract and test table under the A1 fidelity contract in §9).
- **Preview-only CSS:** `PREVIEW_BUTTON_FEEDBACK` = `.t-button{cursor:pointer}.t-button:active{transform:translateY(1px)}` + a reduced-motion override; never in export. It is the only `:active`-like CSS anywhere. There is no `:hover`, `:focus`, transition, shadow or gradient in the compiler.
- **Preview** is a sandboxed iframe (`sandbox="allow-same-origin"`, no `allow-scripts`), `srcdoc` from `compile_preview`, CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data: asset: http://asset.localhost https://asset.localhost`. CSS `:hover`, `:active`, transitions, keyframes and gradients work in it without scripts.
- **Export** (`export.rs`): zip of `index.html`/`<slug>.html` + `styles.css`/`<slug>.css` + `assets/`. Tabs use a radio-input CSS rule; accordion/collapsible/dropdown/popover use `<details>`; switch is a bare checkbox in a `<label>`; dialog/sheet/drawer with `open:false` emit nothing.
- **Typed Rust serde.** `save_project` and `compile_preview` take a typed `PageDocument`. A style key or node-level field not in the Rust struct is **silently dropped on save**; an unknown node `type` fails to deserialize; `version` is read as `u64` unchecked. These facts drive §4 and the B1 parity tests.
- **Colour input:** `ColorField` accepts only `#rgb`, `#rrggbb`, `transparent` (`COLOR_RE`); no alpha.
- **Writes:** `setNodeStyle`/`setNodeBreakpointStyle` (sparse, locked → `null`); one `updateOpenDocument` per user action = one undo step; drags use `beginHistoryGroup/endHistoryGroup`; text bursts coalesce 800 ms; history 100 snapshots.
- **Style panel:** `STYLE_SECTIONS` order เลย์เอาต์ → การแสดงผล → ขนาด → ระยะห่าง → ตัวอักษร → พื้นหลัง → เส้นขอบ; a breakpoint segmented control at the top; body remounts on selection change. Right pane 256–420 px, left 200–360 px, window minimum 960×640.
- **Insertion:** palette click (`insertPaletteNode`), `insertTemplate`/`insertBlock`/`insertPage` (`applyTemplate` at `templateInsertIndex`), native HTML5 drag with `drag-session.ts` payloads `{kind:"new"|"move"}`; ids from `crypto.randomUUID()`.

### 3.3 Palette and Phase 5B blocks today
`ElementPalette.tsx`: a 4-column icon-tile grid of `PALETTE_TYPES` (41) in groups (untitled base, "Text", "Choices", "Disclosure"), dropdowns `เทมเพลต` (5), `บล็อก` (6), `Pages` (Login, Signup); no palette search; `CommandPalette` (Ctrl/Cmd+K) has an `เพิ่มองค์ประกอบ` group. The `switch` tile is labelled "Checkbox". `blocks.ts` holds 6 blocks (การ์ด, แจ้งเตือน, ปุ่มเรียง, ป้าย, เส้นคั่น, ข้อความเรียง) built from container/heading/text/button/spacer with **literal hex colours**; `templates.ts` holds 5 section templates. Phase 11's registry absorbs both (D3).

### 3.4 Corrections to DEV's audit
| DEV's audit says | The code says | Consequence |
|---|---|---|
| 41 placeable types | **Confirmed** (42 − page) | — |
| "61 shadcn ui items" | Not reproducible. 23 installed locally; the live docs index lists 66 entries incl. docs-only pages. The registry is not local | Treat 61 as DEV's count; this spec derives its list from the docs index, not from 61 |
| StyleProps has 20 keys | **Confirmed** | — |
| Box-shadow, backdrop-filter, gradients, per-side borders, transforms, transitions "not possible today" | **Confirmed absent** in schema, Rust, canvas, compiler. Per-corner radius and dashed/dotted borders also absent (`borderStyle` UI offers only none/solid, though the stored type is a free string) | B |
| Hover/focus/active "not possible today" | **Partly wrong.** A hard-coded Preview-only `.t-button:active{transform:translateY(1px)}` exists. There is no user-editable state data, no `:hover`, no `:focus-visible`, and the press feedback is not in export | Keep or scope the legacy rule (B8.3); user-editable states are still missing |
| Missing: real card/badge/alert node types | **Right, with a stopgap**: card/alert/badge are Phase 5B *blocks* built from container+text with literal colours, not node types | A2 adds real types; D3 retires the 5B blocks into the registry |
| Missing: shadcn-style checkbox/switch | Existing `switch` is a bare `<input type=checkbox>` (compiler comment: "No thumb and no transition"); its tile is labelled "Checkbox". There is **no separate `checkbox` type and no toggle look** | A3 |
| Missing: skeleton, spinner, scroll-area, … | `skeleton`, `spinner`, `resizable`, `context-menu`, `card`, `alert` exist **as editor chrome** (`src/components/ui`), not placeable | Reusable as visual reference only |
| *Not in the audit:* **export fidelity of existing 6b kinds** | Several Phase 6b kinds export as bare text in one `<div>` with no inner tags and no per-type CSS (Empty, Item, Message, Dialog, Tooltip, HoverCard confirmed by reading the compiler; the canvas view `phase6b-view.tsx` is equally bare and inert). "Complete the set" is hollow if a placed `Dialog` is two lines of text | **A1 — fidelity pass** (new batch) |
| *Not in the audit:* **icons** | No icon node anywhere; Phase 5B/6/6A/7 specs repeatedly say "no icon". Feature cards, pricing check-lists, buttons with arrows, testimonial stars all need icons | **A4 `icon`** (approved, §11 D8) |
| *Not in the audit:* **lists** | No list node; Phase 5B blocks note "no bullets because that key does not exist". Pricing and feature blocks need real lists | **A4 `list`** (approved, §11 D8) |
| *Not in the audit:* **separator** | The divider is a 1px `spacer` with a background | A2 `separator` |
| Earlier phases | Phase 6/6A/6B specs explicitly deferred table, chart, calendar, carousel, sidebar, spinner, skeleton, toast, resizable, scroll area, aspect ratio, command, combobox, context menu; "Form, Field, Questionnaire" "when forms are built" | These gaps are planned, not oversights; A closes them |

### 3.5 Two gaps that shape the plan
1. **The canvas is not responsive and not stateful.** Design mode shows base styles only. Breakpoints are checked in Preview. The same is true for hover/active/motion: the Design canvas can *force-display* a state on the selected node (B7), real hover/press/animation is verified in Preview (an iframe where CSS works but scripts do not).
2. **Two mirrors must stay equal.** `styleToCss` (TS, canvas) and `decls` (Rust, Preview/export). Every new key is implemented twice. §4.5 adds golden fixtures that both sides must satisfy, so they cannot drift silently.

### 3.6 What ui.shadcn.com/blocks contains
Read 2026-10-26: dashboard-with-sidebar, sidebar layouts, login layouts and similar app shells. **No marketing sections** (hero, pricing, FAQ, …) exist there, so the marketing categories in D are authored from scratch regardless of licence; the MIT route could only supply app-shell structure (§11 D4 add-on).

---

## 4. Schema, defaults and compiler change summary (all sub-phases)

### 4.1 New node kinds (A) — 18, all additive
Every kind needs: TS `NodeType` + `NodeProps` variant; Rust `NodeType` + `NodeProps` variant (internally tagged, `#[serde(tag="type")]`); `ALL_TYPES` (`[NodeType; 42]` → `[NodeType; 60]`); `type_name`; `default_styles`; a compiler render arm; `PALETTE_TYPES` (41 → 59); `NODE_TYPE_LABEL`; icon tile; `FIELDS` entries; `createNode`; `canInsertInto`; and, if it holds children, `CONTAINER_NODE_TYPES` + `getChildren` + the Rust `children()` accessor.

| Kind (`type`) | Props beyond `style` | Children | Batch |
|---|---|---|---|
| `card` | container layout props (`direction?`, `gap?`, `align?`, `justify?`) | yes, free-form | A2 |
| `alert` | container layout props | yes | A2 |
| `badge` | `label` | no | A2 |
| `separator` | `orientation: "horizontal"\|"vertical"` | no | A2 |
| `skeleton` | none (shape = width/height/radius) | no | A2 |
| `spinner` | `size` (px, 12–64) | no | A2 |
| `aspectRatio` | container layout props + `ratio` (`"16/9"`, `"4/3"`, `"1/1"`, `"3/2"`, `"21/9"`) | yes | A2 |
| `scrollArea` | container layout props + `orientation: "vertical"\|"horizontal"\|"both"` + `label?` (accessible name) | yes | A2 |
| `buttonGroup` | container layout props (default row, gap 0) | yes (buttons) | A2 |
| `checkbox` | `label`, `checked` | no | A3 |
| `field` | `label`, `description?`, `error?` + container layout props | yes (the control) | A3 |
| `nativeSelect` | `label?`, `options: string[]`, `value?` | no | A3 |
| `table` | `columns: string[]`, `rows: string[][]`, `caption?`, `headerRow`, `striped` | no | A4 |
| `list` | `items: string[]`, `ordered`, `marker: "disc"\|"decimal"\|"check"\|"none"` | no | A4 |
| `icon` | `name`, `label?`, `size`, `strokeWidth` | no | A4 |
| `carousel` | container layout props + `slidesPerView` (1–4) | yes (slides) | A5 |
| `chart` | `kind: "bar"\|"line"\|"area"`, `categories`, `series[{name,values,color}]`, `caption` | no | A5 |
| `calendar` | `year`, `month`, `selectedDay?`, `weekStart: 0\|1`, `era: "be"\|"ce"` | no | A5 |

Additive prop on an existing kind: `input.suggestions?: string[]` (A3; exported as a native `<datalist>`).
Existing kinds whose **props** are untouched in A1 (fidelity pass changes markup/CSS, not data).

### 4.2 New style keys (B) — 9 flat optional keys on `StyleProps`
All sit in the same struct as the existing 20, so they work in base styles **and** in `styleBreakpoints` with no extra plumbing. Values are **structured data compiled to CSS in Rust**, never raw CSS strings.

| Key | TS shape (all subfields optional unless stated) | CSS emitted | Caps / clamps (Rust and TS both) |
|---|---|---|---|
| `boxShadow` | `{x,y,blur,spread,color,inset?}[]` | `box-shadow` | ≤ 6 layers; x,y ±200; blur 0–200; spread ±100; colour hex3/4/6/8 |
| `backgroundGradient` | `{kind:"linear"\|"radial"\|"conic", angle?, stops:{color,at}[]}` | `background-image` (over `background-color`) | 2–8 stops; `at` 0–100; angle 0–360 |
| `textGradient` | same shape as `backgroundGradient` | `background-image` + `-webkit-background-clip:text;background-clip:text;color:transparent` | exclusive with `backgroundGradient` on one node |
| `filter` | `{blur,brightness,contrast,saturate,grayscale,hueRotate}` | `filter` | blur 0–40 px; brightness/contrast/saturate 0–300 %; grayscale 0–100 %; hue 0–360 |
| `backdropFilter` | `{blur,saturate,brightness}` | `backdrop-filter` + `-webkit-backdrop-filter` | blur 0–40 px; others 0–300 % |
| `borderSides` | `{t,r,b,l}` each `{width?,color?,style?: "solid"\|"dashed"\|"dotted"\|"none"}` | `border-top/right/bottom/left` after the uniform border | width 0–20 |
| `borderRadiusCorners` | `{tl,tr,br,bl}` numbers | `border-*-*-radius` after `border-radius` | 0–400 |
| `transform` | `{translateX,translateY,scale,scaleX,scaleY,rotate,skewX,skewY,origin}` | `transform` (fixed order: translate, rotate, scale, skew) + `transform-origin` | translate ±1000 px; scale 0–5; rotate/skew ±360; origin one of 9 keywords |
| `transition` | `{durationMs, delayMs, easing, property}` | `transition-property/-duration/-timing-function/-delay` longhands | duration 0–2000; delay 0–2000; easing one of `ease, ease-in, ease-out, ease-in-out, linear, spring` or `cubic-bezier` (4 numbers, x in 0–1); `property: "paint"` only in v1 (= background-color, color, border-color, box-shadow, opacity, transform, filter, backdrop-filter; never layout) |

**defaults.rs / `is_empty` note (applies to every row above).** Each key needs, in Rust: (a) an `Option<…>` field on `StyleProps` following the struct's existing serde attributes (camelCase name, skipped when `None`); (b) a line in `StyleProps::is_empty()` (otherwise a breakpoint override that holds *only* this key is judged empty and `drop_empty` deletes it); (c) a line in `overlay_style` (otherwise the value is lost when defaults are overlaid); (d) a branch in `decls()` with a typed validator (never `css_safe` on structured data); and in TS: (e) `StyleProps` field, (f) `styleToCss` branch, (g) an entry in a new exported `STYLE_KEYS` list that the parity test reads (§4.5). None of the nine appears in `default_styles()`; defaults stay as they are, which keeps A independent of B. An empty array/object is normalised to "unset" by TS setters and treated as unset by Rust.

Also additive, no Rust change: `ColorField` accepts `#rgba` and `#rrggbbaa` (stored lowercase 8-digit hex); `borderStyle` UI gains dashed/dotted (the stored type is already a free string).

### 4.3 New node-level fields (B, E)
| Field | Shape | Emitted as |
|---|---|---|
| `Node.states?` (B7) | `{hover?, active?, focusVisible?}` each a style subset limited to **paint keys**: `backgroundColor, color, borderColor, opacity, boxShadow, backgroundGradient, textGradient, filter, backdropFilter, transform` | `:hover` (inside `@media (hover:hover)`), `:active`, `:focus-visible` rules after the node's base rule |
| `Node.motion?` (E1) | `{entrance?: {preset, trigger:"load"\|"view", durationMs, delayMs, easing}}` | `@keyframes` + `animation` (and `animation-timeline` inside `@supports`) |

Rust: `Option<NodeStates>` / `Option<NodeMotion>` on `Node` with `skip_serializing_if`; empty ones are dropped by `normalize_page_nodes`. TS: `cleanNodes` in `breakpoints.ts` drops empty ones, like it does for `styleBreakpoints`.

### 4.4 Document version statement
**No new document version and no bump of an existing one.**
- Reason 1: Rust reads `version` as a `u64` and never checks it, so a bump would not stop an older build from opening a newer file and silently dropping data (§4.6). A number cannot protect what does not read it.
- Reason 2: version 5 already means "two or more pages"; a "6" would break the ordering rule (v1–4 single page, v5 multi-page).
- The existing ladder is preserved and extended only by marker rules: any of the 18 new kinds counts like a Phase 6b kind (single page → **4**), implemented as a second predicate `isVersion4Kind` beside `isPhase6bType` in TS and in `is_phase6b` in Rust (the UI routing that uses `isPhase6bType` is untouched). A node that carries `states` or `motion` counts like a breakpoint override (tier **2**). New style keys add no marker, like `opacity`. Two or more pages are still **5**.
- Opening a file never rewrites it; only an explicit save writes the (possibly higher) marker. Test: open → no write; save of an unchanged v1 doc stays v1.
- Update the schema comment that says breakpoints hold "not … shadow, or hover": breakpoint overrides may now hold the nine style keys; states and motion are node-level, not per-breakpoint (§9 B7).

### 4.5 Parity and safety tests (DEV adds these in the first step that needs them)
1. **Key parity (bun):** reads `STYLE_KEYS` and regex-scans `defaults.rs` for each key's snake_case field in the struct, in `is_empty` and in `overlay_style`; fails if any is missing. Same for node-level fields and `NodeType` variants vs `ALL_TYPES`.
2. **Round-trip (cargo test):** a fixture document containing **every** new key, node type, `states` and `motion` deserializes, serializes, and equals the input (after key sort). This is the guard against the silent-drop bug.
3. **Golden CSS fixtures:** `fixtures/style/*.json` (input style) ↔ `*.css` (expected declarations). Rust `decls` and the TS `styleToCss` serializer are each tested against the same files (bun test and cargo test). Colours are compared after lowercase; the TS side maps camelCase names.
4. **Compiler goldens:** per new node kind, the exact HTML + CSS for a representative node, and a negative test: no `<script`, no `on…=` attribute, no `javascript:`, no `url(` outside `data:`/asset paths in any output.
5. **Hostile input:** NaN, huge numbers, 100 shadow layers, a `url(` colour, a `}` inside a colour string → dropped or clamped, output still valid CSS, no panic.

### 4.6 Downgrade hazard (accepted, documented)
A Phase 10 build opening a Phase 11 file: unknown node kinds fail to open (clear error); unknown style keys, `states` and `motion` are dropped on its next save. The app is single-user desktop and no downgrade path exists, so the plan accepts it. Mitigation that costs nothing: the release note says "files saved with Phase 11 features should not be edited in older builds". Not mitigated: none possible retroactively (the older build never checks).

### 4.7 Other contract changes
- `PREVIEW_BUTTON_FEEDBACK` is scoped to buttons without user states (B8.3).
- New SQLite table `library_items` (B-independent, C6) for user-saved presets; the document and the project row are unchanged.
- Export zip gains `THIRD-PARTY-NOTICES.txt` only when an `icon` node is present (§2.4, approved §11 D5).

---

## 5. Performance and RAM plan

### 5.1 Budgets (proposals; B10, A-end, C8 and D10 replace them with measured numbers)
| Item | Budget | Check |
|---|---|---|
| Initial JS, gzip | **≤ 112.55 kB** (baseline 112.05 + 0.5 for all of Phase 11: type unions, constants, `STYLE_KEYS`) | `vite build --manifest`; sum the gz of the entry's static import graph |
| Anything new loaded at startup | **none**: registries, icon paths, chart/calendar renderers, preset data, block data, motion presets are not in the entry graph and have no `whenIdle` preload | `rg` the entry chunk and its static imports for the chunk names, as Phase 10 did |
| `EditorPage` chunk (lazy) growth | A ≤ +14 kB gz, B ≤ +10 kB gz, C ≤ +3 kB gz, D ≤ +6 kB gz (UI only), E ≤ +3 kB gz | manifest diff per sub-phase |
| Own lazy chunks | presets data ≤ 6 kB gz; block registry ≤ 30 kB gz; icon paths ≤ 12 kB gz; chart+calendar renderers ≤ 8 kB gz | manifest |
| RAM (PSS, median of 4 runs) | measured **from the state just before entering the feature** (PM reference): A: a doc with one of each new kind ≤ +2 MB over a doc with the same node count of old kinds; B: 50 nodes with 3-layer shadows + 6 backdrop blurs ≤ +8 MB over the same 50 nodes without; D: opening the Blocks panel ≤ +4 MB, 30 s after closing ≤ +2 MB; E: Preview with 30 animated nodes ≤ +3 MB | RAM-BASELINE method |

These numbers are **not measured**; there is no baseline for effects in the repo. B10 and the per-batch checks turn them into measured limits and the spec is amended, not silently relaxed.

### 5.2 RAM-BASELINE method, reused unchanged
Release build + `vite build`; PSS (acceptance) and RSS summed from `/proc/<pid>/smaps_rollup` over `webapp-project`, `WebKitWebProcess`, `WebKitNetworkProcess`; 5 samples 2 s apart after settling, median; 4 runs from fresh seeded data copies, median over runs; private Xvfb 1280×800 software GL, `GDK_BACKEND=x11`, a11y bus off. Timeline: launch, settle 20 s → open project 8 s → feature → settle 10 s → leave, wait 30 s. Every feature has a **control run** doing the same without the feature. Reference today: editor before DB 205.1 MB PSS; DB open 217.0 (+9.9); 30 s after leave 219.3 (+12.3); control run 199.5. Raw logs to `agent-tools/p11/<step>-ram/`.
**State in every report:** software GL only compares *with vs control*. Compositing cost of `backdrop-filter`, `filter` and large shadows on a real GPU is unproven and listed under "only the real app proves".

### 5.3 Cost model for the effects (why the caps exist)
- `backdrop-filter` and `filter: blur()` allocate an offscreen layer per element, sized to the element, and blur cost grows with radius. Cap blur at 40 px; warn above **6** such nodes per page.
- A shadow with blur ≤ 200 px is rasterised once per layer but repaints on scroll in some WebKit paths; cap 6 layers per node, blur 200 px; warn when the sum of blur radii on a page exceeds **1200 px** or any single page node has blur > 100 px.
- `transform`/`opacity` animations run on the compositor; layout properties never animate (the `transition` property list excludes them, motion presets use transform/opacity only).
- Animated nodes: warn above **30** animated nodes per page.
- **Per-page warning rule:** counts are computed only when a heavy key is written or a page opens in Design (one O(n) pass, never per frame). The warning is inline, non-blocking, polite (`announce`), keys T115–T117 in §8, shown on the control that crossed the threshold and once in the Preview toolbar status line for that page.

### 5.4 Lazy-chunk plan
`blocks-registry`, `blocks-flyout`, `presets-registry`, `preset-picker`, `icon-paths`, `chart-render`, `calendar-render`, `table-editor`, `motion-panel`, `effects-panels` (shadow/gradient/filter/transform/transition editors), all via `lazyNamed`, none with `whenIdle` preload. Chart/calendar views load on first render of such a node (fixed-size placeholder until then, no layout jump). Acceptance each: `rg` on `dist/assets` shows the chunk exists and is absent from the entry graph.

---

## 6. Accessibility and focus rules (carried over from Phases 9–10, extended)

1. **Focus never lands on body.** Every new control that can disappear (a removed shadow layer row, a deleted gradient stop, a closed flyout, a deleted table row/column, an applied preset's picker) moves focus in a layout effect to the nearest surviving sibling or the control that opened it. FOLLOWUPS' known gaps (9) are not made worse; DEV adds a headless "focus never on body" check to each new UI step.
2. **Live region:** all announcements use the single `useEditorStore.announce` polite region in `EditorPage`; no new live regions. Announce: state switch, preset applied, block inserted, search result count, replay played, warnings.
3. **Focus ring:** full alpha, 2 px, contrast ≥ 3:1 against both adjacent colours. **Locked or disabled rows keep the ring at full strength.** Known open item #1 (`PagesPanel.tsx:215`, `LayersPanel.tsx:328`: `opacity-60` on the row dims the ring to ~2.37:1) must not be copied into any new list: use a dimmed *content* wrapper inside the row, never `opacity` on the row that owns the ring. DEV may fix #1 as a side task in B8; it is not required.
4. **Contrast:** text 4.5:1, UI components and focus 3:1, measured on the final composited colour for solid colours. With alpha colours the backdrop is unknown, so the panel shows no contrast verdict for translucent colours (documented, not guessed); built-in presets and blocks are verified on their intended background (D10.3).
5. **Keyboard operation of drag-and-drop.** Every drag source has a non-drag equivalent: palette tiles (click inserts; existing), blocks (`แทรก` button + position menu, T-keys §8), presets (click applies). A block card is one Tab stop; Enter/Space activates the primary insert; the menu opens with Enter on the ⋯ button or Shift+F10. Arrow keys move among cards in the grid (roving tabindex, like Layers). The canvas drop indicator is not the only feedback: insertion is announced.
6. **Reduced motion:** all Phase 11 transitions/animations obey `prefers-reduced-motion: reduce` in the editor chrome (`motion-reduce:` variants, the Phase 8 pattern) and in the **export** (§7.4).
7. **Forced colours:** where a state's focus ring is a box-shadow, export adds a `forced-colors: active` outline fallback (§7.3).
8. **Labels:** every icon-only button has an `aria-label` from §8; every toggle exposes pressed state; segmented controls use the existing `ToggleGroup`.
9. **Esc/Enter/Tab:** Esc closes the flyout/popover and restores focus to its trigger; Esc inside a numeric field reverts the group (existing `revertHistoryGroup`); Enter commits; no focus trap in the non-modal flyout.
10. **Preview is not keyboard-explorable by design** (sandboxed, inert links); state/animation behaviour that needs a pointer is checked there with a pointer.

---

## 7. Export rules

### 7.1 Baseline
**Update 2026-11-03:** product ส่งออก is **Phase 12 Vite + React project zip** (`docs/PHASE-12-SPEC.md`). The HTML/CSS compiler (`compile_export` / Preview) remains for in-app Preview and goldens. Next.js stays later. A4 resumed 2026-11-04 after Phase 12 v1 was accepted.

**B-prelude for export (2026-11-04):** both pipelines take B's style CSS from ONE Rust generator and must keep the at-rules through minification; see §9.B "B-prelude" (P1 shared generator, P2 minification survival). This replaces the minification line removed on 2026-11-03.

### 7.2 How new CSS is emitted
Order inside each page's CSS: PREFLIGHT → type rules (`.t-<type>`, including the new kinds' defaults and `type_extras`) → node rules `.nN` (existing declarations + new-key declarations, only when they differ from the type default) → **state rules** (`@media (hover:hover){.nN:hover{…}}`, then `.nN:focus-visible{…}`, then `.nN:active{…}` — active last so it wins) → **keyframes** (`@keyframes nN-in{…}` once per distinct preset/params) → breakpoint blocks (tablet, phone, foldOpen — unchanged order) → `@media (prefers-reduced-motion: reduce)` overrides → `@media (forced-colors: active)` fallbacks. A node needs a class if it has any of base diff, states or motion. Nodes with states get one extra class `fx` (used only to scope the legacy Preview feedback, B8.3).

Specificity note: `.nN:hover` (0,2,0) beats a breakpoint rule `.nN` (0,1,0). So if a node sets `backgroundColor` in its tablet override **and** in `states.hover`, hover wins on a hover-capable tablet. This is documented in the panel (T119) and in §10; v1 states apply at all widths.

### 7.3 No JS
No `<script>` in any output and no event-handler attributes, enforced by a negative test on every new kind (§4.5). Behaviour that shadcn does with JS is mapped as in §9 A (native elements, `<details>`, radio-input CSS, scroll-snap, `<datalist>`, static SVG). `:focus-visible` states are emitted only for focusable elements (linked buttons, links, inputs, textarea, selects, checkbox/switch). Where a state's ring is a shadow: `@media (forced-colors:active){.nN:focus-visible{outline:2px solid CanvasText}}`. Text-gradient nodes also get `@media (forced-colors:active){.nN{color:CanvasText;background:none}}` (forced colours remove `background-image`, which would leave `color:transparent` text invisible).

### 7.4 Reduced motion
`@media (prefers-reduced-motion: reduce)` emits, for every node with transition/states/motion: `transition:none`; `animation:none` (content then appears in its final state, never hidden); and for state rules that set `transform`, a rule restoring the base transform (or `none`). Colour, shadow and opacity state changes stay (instant). Static base transforms are not motion and are kept. This generalises the existing Preview rule `.t-button:active{transform:none}` under reduce.

### 7.5 Honest limits (also printed in the panel where relevant)
- `:active` on a non-interactive `<span>` works on desktop browsers; iOS Safari does not fire it without a touch handler. Unlinked buttons export as `<span>` (Phase 9 decision). Linked buttons export as `<a href>` where it works everywhere. The 3D-button acceptance test therefore uses a linked button; unlinked is documented as "desktop only". Changing unlinked buttons to `<button>` is not proposed (Phase 9 reasoned a focusable do-nothing button is worse).
- Gradients cannot transition (a hover gradient swap snaps). Colour/shadow/transform/opacity/filter do transition.
- `transform` has no effect on `display:inline`. The compiler emits `display:inline-block` for a node whose resolved display is `inline` and that has a transform or a transform state (hint T105). Documented, tested.
- Scroll-driven animation and `backdrop-filter` depend on the visitor's browser (§9 E).
- (Low) The 2px focus ring (`outline-offset` 2px) is clipped at the viewport edge on full-width nodes (table region, any node at a page edge with 0 page padding). Seen in the F2.1 pass. See FOLLOWUPS 72; revisit in B.

---

## 8. Thai UI labels (every new user-visible string)

Rule: Thai for all chrome, errors, hints, announcements and aria-labels; component names stay English (shadcn names) and palette group headings stay English (Layout, Text & media, Forms, Data, Navigation, Disclosure, Overlays, Feedback). Strings with `{x}` are templates. Reused existing strings are marked ↺. Steps and sections elsewhere cite only the key.

**Components and palette**
T01 `ค้นหาองค์ประกอบ` (search field label/placeholder) · T02 `ไม่พบองค์ประกอบ` · T03 `พบ {n} รายการ` (announce) · T04 `ขยายกลุ่ม {name}` · T05 `ยุบกลุ่ม {name}`
T10 `อัตราส่วน` · T11 `ชื่อสำหรับโปรแกรมอ่านหน้าจอ` · T12 `ทั้งสองแนว` · T13 `คุณสมบัติ` (Style panel section heading for the A2 kind fields) · T14 `ตั้งความสูงเพื่อให้เลื่อนได้` (scrollArea hint when it has no height)
T20 `ติ๊กอยู่` · T21 `ป้ายกำกับ` ↺ · T22 `ตัวเลือก (หนึ่งบรรทัดต่อหนึ่งตัวเลือก)` · T23 `ตัวเลือกคำแนะนำ`
T24 `รายการ (หนึ่งบรรทัดต่อหนึ่งข้อ)` · T25 `เรียงลำดับ` · T26 `เครื่องหมายนำหน้า` · T27 `จุด` · T28 `ติ๊กถูก`
T29 `แก้ไขตาราง` · T29a `แถวหัวตาราง` · T29b `แถบสลับสี` · T29c `คำบรรยายตาราง` · T30 `เพิ่มแถว` · T31 `เพิ่มคอลัมน์` · T32 `ลบแถว` · T33 `ลบคอลัมน์` · T34 `ตารางใหญ่สุด 20 คอลัมน์ 100 แถว` · T35 `ตารางเต็มแล้ว`
T36 `ค้นหาไอคอน` · T37 `ขนาดไอคอน` · T38 `ความหนาเส้น` · T38a `ชื่อไอคอน` · T38b `คำอธิบายไอคอน (เว้นว่างถ้าเป็นของตกแต่ง)`
T39 `เลื่อนด้วยการปัดหรือปุ่มลูกศร ไม่มีปุ่มถัดไปหรือเล่นอัตโนมัติ` · T40 `จำนวนสไลด์ต่อหน้า`
T41 `ชนิดกราฟ` · T42 `แท่ง` · T43 `เส้น` · T44 `พื้นที่` · T45 `ข้อมูลกราฟ` · T45a `ชื่อหมวด` · T46 `ชื่อชุดข้อมูล` · T47 `เพิ่มชุดข้อมูล` · T47a `ค่า` · T48 `คำอธิบายกราฟ (สำหรับผู้ใช้โปรแกรมอ่านหน้าจอ)`
T49 `ปี` · T50 `เดือน` · T51 `วันที่เลือก` · T52 `เริ่มสัปดาห์วัน` · T53 `อาทิตย์` / `จันทร์` · T54 `ปี พ.ศ.` (Thai month and weekday names are generated by the app, not stored)

**Style system**
T55 `ไล่สี` · T56 `ความโปร่งของสี` · T57 `เงา` · T58 `ฟิลเตอร์` · T59 `การแปลง` · T60 `การเปลี่ยนผ่าน` · T60a `เอฟเฟกต์` (section title)
T61 `สถานะ` · T62 `ปกติ` · T63 `ชี้เมาส์` · T64 `กดค้าง` · T65 `โฟกัส` (aria-label `โฟกัสด้วยคีย์บอร์ด`)
T66 `สถานะใช้กับทุกขนาดหน้าจอ จึงล็อกจุดพักที่เดสก์ท็อป` · T67 `สถานะนี้เปลี่ยนได้เฉพาะสี เงา ความทึบ ฟิลเตอร์ และการเคลื่อนย้าย` · T68 `โฟกัสด้วยคีย์บอร์ดใช้ได้กับปุ่มที่มีลิงก์ ลิงก์ และช่องกรอกเท่านั้น` · T69 `รูปแบบสีไม่ถูกต้อง (#rgb, #rrggbb, #rrggbbaa, transparent)`
T70 `เพิ่มเงา` · T71 `ลบเงา` · T72 `เงาชั้นที่ {n}` · T73 `แนวนอน` · T74 `แนวตั้ง` · T75 `เบลอ` · T76 `กระจาย` · T76a `สี` · T77 `เงาด้านใน` · T78 `เลื่อนชั้นขึ้น` · T79 `เลื่อนชั้นลง` · T79a `ใช้เงาได้สูงสุด 6 ชั้น`
T80 `ใช้ได้อย่างใดอย่างหนึ่ง: ไล่สีพื้นหลังหรือไล่สีตัวอักษร` · T81 `เส้นตรง` · T82 `วงกลม` · T83 `กรวย` · T84 `มุม` · T85 `จุดสี` · T86 `เพิ่มจุดสี` · T87 `ลบจุดสี` · T88 `ตำแหน่ง` · T89 `ไล่สีที่ตัวอักษร`
T90 `เส้นขอบแยกด้าน` · T91 `มุมโค้งแยกมุม` · T92 `บนซ้าย` · T93 `บนขวา` · T94 `ล่างขวา` · T95 `ล่างซ้าย` · T96 `เส้นประ` · T97 `จุด` (border style) — the side names บน/ขวา/ล่าง/ซ้าย and `แยกแต่ละด้าน` are existing ↺
T98 `เลื่อนแนวนอน` · T99 `เลื่อนแนวตั้ง` · T100 `ขยาย` · T101 `หมุน` · T102 `เอียงแนวนอน` · T103 `เอียงแนวตั้ง` · T104 `จุดหมุน` · T105 `องค์ประกอบแบบอินไลน์จะถูกส่งออกเป็นอินไลน์บล็อกเพื่อให้การแปลงทำงาน`
T106 `ระยะเวลา` · T107 `หน่วงเวลา` · T108 `จังหวะ` · T108a easing options `ค่าเริ่มต้น`, `เร่งเข้า`, `เร่งออก`, `เร่งเข้า-ออก`, `คงที่`, `เด้ง` (= `cubic-bezier(.34,1.56,.64,1)`) · T108b `ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวจะไม่เห็นการเลื่อนย้ายและการเปลี่ยนผ่าน`
T109 `ความสว่าง` · T110 `คอนทราสต์` · T111 `ความอิ่มสี` · T112 `ขาวดำ` · T113 `เบลอฉากหลัง` · T114 `ฉากหลังเบลอเปลืองหน่วยความจำ ใช้เท่าที่จำเป็น`
T115 `หน้านี้ใช้เอฟเฟกต์เบลอ {n} จุด อาจทำให้เครื่องช้าลง แนะนำไม่เกิน {max} จุด` · T116 `เงาในหน้านี้ใหญ่และซ้อนกันมาก อาจทำให้เครื่องช้าลง` · T117 `หน้านี้มีองค์ประกอบที่เคลื่อนไหว {n} จุด แนะนำไม่เกิน {max} จุด`
T118 `ล้างสถานะนี้` · T119 `สถานะทำงานทุกขนาดหน้าจอ และอาจทับค่าของจุดพักแท็บเล็ตหรือโทรศัพท์`

**Presets** — T120 `พรีเซ็ต` · T121 `ใช้พรีเซ็ต {name} แล้ว` · T122 `บันทึกเป็นพรีเซ็ต` · T123 `ชื่อพรีเซ็ต` · T124 `บันทึกพรีเซ็ตแล้ว` · T125 `ลบพรีเซ็ต {name}?` · T126 `พรีเซ็ตของฉัน` · T127 `ค้นหาพรีเซ็ต` · T128 `ปุ่ม 3 มิติ` · T129 `การ์ดกระจกฝ้า` · T130 `การ์ดเงานุ่ม` · T131 `ปุ่มไล่สี` · T132 `กรอบเรืองแสง` · T133 `เอฟเฟกต์กระจกจะเห็นชัดเมื่ออยู่บนพื้นหลังที่มีสีหรือรูปภาพ` · T134 `ลบพรีเซ็ตแล้ว` · T135 `ไม่พบพรีเซ็ต` · T136 `พรีเซ็ตนี้ใช้กับองค์ประกอบนี้ไม่ได้`

**Blocks** — T140 `ค้นหาบล็อก` · T141 `แทรก` · T142 `แทรกท้ายหน้า` · T143 `แทรกหลังส่วนที่เลือก` · T144 `แทรกในองค์ประกอบที่เลือก` · T145 `แทรกบล็อก {name} แล้ว` · T146 `บล็อกนี้ใช้ไม่ได้` · T147 `ลากไปวางบนผืนผ้าใบ หรือกดแทรก` · T148 `ไม่พบบล็อก` · T149 `ปิดแผงบล็อก` · T150 `โครงร่างของบล็อก {name}` · T151 `หน้าถูกล็อก จึงแทรกไม่ได้` · T152 `ตัวเลือกการแทรก` · T153 `หมวดบล็อก`
Categories: T154 `ทั้งหมด` · T155 `แถบหัวเว็บ` (header) · T156 `ส่วนแนะนำ` (hero) · T157 `จุดเด่น` (features) · T158 `ราคา` (pricing) · T159 `เสียงจากลูกค้า` (testimonials) · T160 `คำถามที่พบบ่อย` (FAQ) · T161 `ชวนทำ` (CTA) · T162 `ท้ายหน้า` (footer) · T163 `ติดต่อ` (contact) · T164 `โลโก้พันธมิตร` (logo cloud) · T165 `ตัวเลขเด่น` (stats) · T166 `องค์ประกอบ` (elements)
T167 `เกี่ยวกับ` · T168 `ประกาศบุคคลที่สาม`

**Motion** — T170 `การเคลื่อนไหว` · T171 `เอฟเฟกต์ตอนเข้า` · T172 `ไม่มี` · T173 `ค่อย ๆ ปรากฏ` · T174 `เลื่อนขึ้น` · T175 `เลื่อนลง` · T176 `เลื่อนจากซ้าย` · T177 `เลื่อนจากขวา` · T178 `ขยายเข้า` · T179 `เริ่มเมื่อ` · T180 `โหลดหน้า` · T181 `เลื่อนมาถึง` · T182 `เล่นตัวอย่าง` · T183 `เล่นตัวอย่างแล้ว` · T184 `ระบบตั้งค่าลดการเคลื่อนไหวไว้ จึงไม่เล่นตัวอย่าง` · T185 `เบราว์เซอร์ที่ไม่รองรับจะแสดงเนื้อหาปกติโดยไม่มีแอนิเมชัน` · T186 `ตัวอย่างการเลื่อนมาถึงดูได้ในโหมดตัวอย่างเท่านั้น`

Other reused strings ↺ (not new): `คืนค่าเริ่มต้น`, `รีเซ็ต`, `ใช้ค่าหลัก`, `ช่องไฟ`, `บล็อก`, `เทมเพลต`, `ผืนผ้าใบ`, `ตกลง`. Where a step says "initial focus on Cancel" the existing cancel string is reused.

---

## 9. Sub-phases

Conventions for every step table: **DEV** implements one step at a time; **Acceptance** is checkable without opinion; "T##" keys are in §8. Every step that adds UI also passes the "focus never on body" check (§6.1) and one-step undo. Every step that touches `schema.ts`/`defaults.rs`/`compiler.rs` runs the §4.5 tests it introduced or affects. **GUI CHECK PLAN** splits what Designer proves headlessly (Playwright against the Vite app with Tauri IPC mocked and `compile_preview` answered from output captured on a real build) from what only the real WebKitGTK app can prove.

### 9.A Missing components (batches A1–A5)

**Goal.** A complete placeable set where each node looks like its shadcn counterpart in idle state, exports honest static HTML/CSS, and can be restyled by the user.
**Scope.** Palette groups + search; fidelity pass on existing kinds; 18 new kinds (§4.1); `input.suggestions`.
**Out of scope.** Shadows, hover/focus polish, gradients (B); variants like "destructive" (those are presets, C); form submit; any JS behaviour; sidebar, command, context-menu, resizable, toast (deferred, decided §11 D3).
**Data/schema.** §4.1 only. No new style key, no `states`, no version change beyond the marker (§4.4). `default_styles` for new kinds use the existing 20 keys and literal hex (no tokens).
**UX.** Palette: 59 tiles in eight groups with a search field above (T01–T05). Group headings stay English like today (Layout, Text & media, Forms, Data, Navigation, Disclosure, Overlays, Feedback; the old "Text"/"Choices" groups dissolve into these). Tile labels remain English shadcn names; tooltip keeps the existing insert/drag hint. New kinds get the same Style-panel sections as their nearest existing kind (`FIELDS` lists extended: container-like kinds join `direction/gap/align/justify`; `height` is added for `scrollArea`; `icon` gets colour/size/opacity/margin). Content-heavy props (table, list, chart, calendar, suggestions) are edited in a panel section or lazy dialog, never inline on the canvas.
**Export.** Per kind below. **Honesty rule:** a kind whose shadcn behaviour needs JS exports its static or native-element form and the Style panel shows a one-line note (T-keys) saying what the visitor will and will not get.
**Budget.** §5.1 A rows. Placing one of each of the 18 kinds on a page: ≤ +2 MB PSS vs 18 old-kind nodes.

#### A1 — Palette and fidelity of existing kinds
| Step | Work | Acceptance |
|---|---|---|
| A1.1 | `PALETTE_META` (type → group, keywords incl. Thai + English synonyms) in the editor chunk; group headings; collapsible groups (session state like `collapsedStyleSections`); search field T01 filtering label+keywords; empty state T02; result count announced T03; groups collapse/expand labels T04/T05 | Typing "btn"/"ปุ่ม"/"modal" finds Button/Dialog; Esc in the field clears it; 41 tiles all reachable; no tile lost; Tab order = field → groups → tiles; at 200 px pane width tiles do not overlap (4 columns) |
| A1.2 | **Audit.** For the 31 Phase 6b kinds + switch/input/button/link, paste each kind's current `compile_preview` HTML+CSS and the canvas look into a table in `HANDOFF-PAUSE.md` (pass/gap, target) | 35 rows; each has real output pasted, not memory; Designer approves the targets before A1.3 |
| A1.3 | Compiler: (a) **`css_safe` hardening** (moved here from B1.1, PM 2026-10-26; contract and test table below); (b) give every "gap" kind real inner tags and per-type CSS (contract below). Do (a) first, in its own commit | (a) All 39 `css_safe` cases below pass as a cargo unit test; a document with `url(…)` in `backgroundColor` compiles to CSS with no `url(` (any case). (b) Golden HTML/CSS per kind; no `<script`; headings inside overlays are `h2`/`h3` not bare text; `cargo test` green; existing documents still open and still save byte-identical when untouched |
| A1.4 | Canvas views (`phase6b-view.tsx`) match the compiled look for the same kinds, via shared constants (no second set of magic numbers) | Mock: side-by-side canvas vs captured Preview screenshot of each kind within a visual tolerance (≤ 4 % pixel diff, same box sizes ±1 px) |
| A1.5 | Relabel the `switch` tile/type label to "Switch" (label only; `checkbox` arrives in A3) | `NODE_TYPE_LABEL.switch` ≠ "Checkbox"; no document changes |

*A1.1 notes (Designer GUI check, 2026-10-26).* Group collapse state is **session-only** (a zustand store like `collapsedStyleSections`; it survives Design/Preview switches and resets on reload), which matches this spec. Tile labels are truncated with an ellipsis at narrow pane widths (200–240 px); this is accepted because the full name is in the tile's `aria-label` and its tooltip.

*Fidelity contract (applies to each gap kind; exact props are whatever the kind already has).* Title and body get their own tags: `h3`/`p` for empty and item; `h2`/`p` inside dialog-like panels; **message is `<div><strong>sender</strong><p>text</p></div>`** (a chat sender is not a section heading, so no `h3`), with `strong` as `display:block;font-weight:600;font-size:14px` and the same bubble look and `align` rule as bubble (`width:fit-content`; `margin-left:auto` for `align:end`; no `text-align:right`); an empty sender or text omits its tag. Panel kinds have border `#e2e8f0`, radius 12 and bg `#ffffff`, with padding by kind: **empty, dialog, alertDialog, sheet, drawer 24; popover and hoverCard 16 (shadcn p-4); item `paddingTop`/`paddingBottom` 12 and `paddingLeft`/`paddingRight` 16, with a 4px gap between its `h3` and `p`** (existing StyleProps keys only, via `default_styles`/`type_extras`; the item has no size prop, so there is no 8/12 variant). Sheet keeps only its content-facing border (`right` → `border-left`, `left` → `border-right`, 1px `#e2e8f0`, radius 0) and drawer only `border-top` with radius `12px 12px 0 0`. alertDialog is `role="alertdialog"` and its confirm and cancel stay real `<button type="button">` elements (not `span`: an alertdialog needs a focusable control); confirm is bg `#0f172a` with white text, cancel is outline. Tooltip is a compact dark pill (bg `#0f172a`, colour `#ffffff`, radius 6, padding 6/10, font 13, always visible) linked to its label by `aria-describedby`; `role="dialog"`/`aria-label` only where the kind is a visible in-page panel with a non-empty title (never `aria-modal`); kinds with `open:false` keep emitting nothing. Re-exporting an old document now yields better markup; stored documents are untouched (called out in §10).

**A1.3 general rules (apply to every gap kind; DEV and Designer review against these).**
- **G1.** The `node_class` diff base includes `type_extras` (today it diffs `resolved_style` against `default_styles` only), and an explicit `node.style` key wins over the type look in both the canvas and the export.
- **G2.** New looks are literal hex longhand declarations added through `type_extras`; no `var(`, no gradient, no `url(`, no `!important`.
- **G3.** An empty title or body omits its tag (no empty `h2`, `h3`, `strong` or `p`).
- **G4.** A control with no visible label (select, slider, progress, inputGroup, inputOtp, radio) gets `aria-label` = `esc(node.name)` when the name is non-empty; no new prop or key.
- **G5.** `ul`/`ol` with `list-style:none` also get `role="list"` (WebKit drops list semantics otherwise). Hand-built controls (toggle, toggleGroup, radio, tabs, switch) keep a visible `:focus-visible` outline in the literal colour `#0077c2`. Ids used for `for` and `aria-describedby` come from a per-document deterministic counter, so goldens are stable.
- **G6.** No `role` of `tab`, `tablist`, `tabpanel`, `menubar` or `menu` in the export: static ARIA state would be wrong once the user interacts (tabs, menubar and toggleGroup stay native radio / `details` patterns).

**A1.3 `css_safe` hardening (moved from B1.1, PM decision 2026-10-26).** `css_safe` handles every free-text style value (the 20 existing keys, per-node overrides, breakpoint overrides). New contract, steps in this order:
1. A value containing `\` is **rejected** (today the character is dropped, so `u\72l(` becomes `u72l(`; rejecting is simpler and safer than decoding CSS escapes, and no legitimate value needs a backslash).
2. Strip `{ } ; < >` and control characters, as today. This also defeats HTML-entity tricks, because the `;` goes: `&#117;rl(` becomes `&#117rl(`, which no parser reads as `url(`.
3. Remove `/*` and `*/` **repeatedly until neither is left** (today: one pass).
4. Trim, then test an ASCII-lowercased copy of the *cleaned* string. **Reject** if it contains `url(`, `image-set(` (so also `-webkit-image-set(`), `expression(`, `@import`, `javascript:`, or `behavior` followed by optional spaces and `:`. Also reject `-moz-binding`, `vbscript:` (same family) and `gradient(` (A1 emits and accepts literal colours only; gradients arrive in B1 through a typed validator, never through `css_safe`).

*Reject* means `css_safe` returns `""`; `decls()` already omits empty values, so the declaration is dropped, the CSS stays valid and nothing panics. Anything else is returned unchanged apart from the trim. Because the denylist runs on the cleaned string, no combination of strips and comment removal can produce a blocked token. Deliberately **not** blocked: `var(` (no tokens in this phase, §11 D1; instead a golden-grep test asserts that no CSS the compiler itself emits in A1 contains `var(`), `calc(`, `min(`, `max(`, `clamp(`, `rgb(`/`rgba(` in modern or legacy syntax, quoted font names. `ur l(` and `&#117rl(` are not function tokens and pass.

*Acceptance (cargo unit test, one `assert_eq!(css_safe(input), expected)` per row, plus the integration checks under the table).* "Today" is the verbatim output of the current `css_safe` (compiler.rs, md5 0f691ba2, measured 2026-10-26); "A1.3" is the required result. `""` = rejected, declaration dropped.

| # | Input | Today | A1.3 required |
|---|---|---|---|
| 1 | `url(https://evil.test/p.png)` | `url(https://evil.test/p.png)` | `""` (dropped) |
| 2 | `URL(https://evil.test/p.png)` | `URL(https://evil.test/p.png)` | `""` (dropped) |
| 3 | `UrL( 'x' )` | `UrL( 'x' )` | `""` (dropped) |
| 4 | `u\72l(https://evil.test/p.png)` | `u72l(https://evil.test/p.png)` | `""` (dropped) |
| 5 | `u/**/rl(https://evil.test/p.png)` | `url(https://evil.test/p.png)` | `""` (dropped) |
| 6 | `u;rl(https://evil.test/p.png)` | `url(https://evil.test/p.png)` | `""` (dropped) |
| 7 | `u<TAB>rl(https://evil.test/p.png)` | `url(https://evil.test/p.png)` | `""` (dropped) |
| 8 | `red//**` | `red/*` | `red` |
| 9 | `@import url(x.css)` | `@import url(x.css)` | `""` (dropped) |
| 10 | `@import "x.css"` | `@import "x.css"` | `""` (dropped) |
| 11 | `expression(alert(1))` | `expression(alert(1))` | `""` (dropped) |
| 12 | `ExPrEsSiOn(1)` | `ExPrEsSiOn(1)` | `""` (dropped) |
| 13 | `expr/**/ession(1)` | `expression(1)` | `""` (dropped) |
| 14 | `behavior:url(x.htc)` | `behavior:url(x.htc)` | `""` (dropped) |
| 15 | `behavior : x` | `behavior : x` | `""` (dropped) |
| 16 | `image-set("a.png" 1x)` | `image-set("a.png" 1x)` | `""` (dropped) |
| 17 | `-webkit-image-set("a.png" 1x)` | `-webkit-image-set("a.png" 1x)` | `""` (dropped) |
| 18 | `javascript:alert(1)` | `javascript:alert(1)` | `""` (dropped) |
| 19 | `JaVaScRiPt:alert(1)` | `JaVaScRiPt:alert(1)` | `""` (dropped) |
| 20 | `-moz-binding:x` | `-moz-binding:x` | `""` (dropped) |
| 21 | `vbscript:x` | `vbscript:x` | `""` (dropped) |
| 22 | `linear-gradient(#fff, #000)` | `linear-gradient(#fff, #000)` | `""` (dropped) |
| 23 | `radial-gradient(#fff, #000)` | `radial-gradient(#fff, #000)` | `""` (dropped) |
| 24 | `&#117;rl(x)` | `&#117rl(x)` | `&#117rl(x)` |
| 25 | `ur l(x)` | `ur l(x)` | `ur l(x)` |
| 26 | `rgb(0 0 0 / 50%)` | `rgb(0 0 0 / 50%)` | `rgb(0 0 0 / 50%)` |
| 27 | `rgba(15, 23, 42, 0.5)` | `rgba(15, 23, 42, 0.5)` | `rgba(15, 23, 42, 0.5)` |
| 28 | `#0EA5E9` | `#0EA5E9` | `#0EA5E9` |
| 29 | `transparent` | `transparent` | `transparent` |
| 30 | `currentColor` | `currentColor` | `currentColor` |
| 31 | `calc(100% - 16px)` | `calc(100% - 16px)` | `calc(100% - 16px)` |
| 32 | `min(100%, 600px)` | `min(100%, 600px)` | `min(100%, 600px)` |
| 33 | `clamp(1rem, 2vw, 2rem)` | `clamp(1rem, 2vw, 2rem)` | `clamp(1rem, 2vw, 2rem)` |
| 34 | `"Noto Sans Thai", ui-sans-serif, system-ui` | `"Noto Sans Thai", ui-sans-serif, system-ui` | `"Noto Sans Thai", ui-sans-serif, system-ui` |
| 35 | `"Curl Sans", sans-serif` | `"Curl Sans", sans-serif` | `"Curl Sans", sans-serif` |
| 36 | `var(--x)` | `var(--x)` | `var(--x)` |
| 37 | `  red  ` | `red` | `red` |
| 38 | `red;}</style><script>` | `red/stylescript` | `red/stylescript` |
| 39 | `red/*x*/` | `redx` | `redx` |

Integration checks: (i) a document with `url(https://evil.test/x.png)` in `backgroundColor`, `color` and a breakpoint override compiles through `compile_preview` and `compile_export` to CSS in which a case-insensitive search for `url(`, `image-set(`, `expression(`, `@import`, `javascript:`, `behavior` finds nothing; (ii) every existing compiler golden is byte-identical before and after the hardening step (it must not change any legitimate output); (iii) a document saved untouched stays byte-identical (the hardening runs only at compile time, never on save); (iv) no `var(` and no `gradient(` in any A1 golden CSS. A reference implementation of steps 1–4 that passes all 39 rows exists at `/home/webdev/.cache/designer-p11/css_probe.rs` (Designer scratch, outside the project; DEV writes the real one).


#### A2 — Static surfaces and feedback (high)
| Kind | Export markup and no-JS note | Palette · keywords | Defaults (existing keys only) |
|---|---|---|---|
| `card` | `<div class="t-card">` + children | Layout · card, panel, box | bg `#ffffff`, border 1px solid `#e2e8f0`, radius 12, padding 24, column, gap 16 |
| `alert` | `<div role="note" class="t-alert">` + children (user adds icon/heading/text). Not `role="alert"`: a static page must not announce on load | Feedback · alert, notice, banner | bg `#f8fafc`, border `#e2e8f0`, radius 8, padding 16, gap 8 |
| `badge` | `<span class="t-badge">label</span>` | Text & media · badge, tag, chip | inline-flex, font 12/500, padding 2/10, radius 200, bg `#0f172a`, colour `#ffffff` (16:1; the sky default fails AA) |
| `separator` | horizontal `<hr>`; vertical `<div role="separator" aria-orientation="vertical">` | Layout · divider, line, rule | horizontal: height 1, width 100%, bg `#e2e8f0`; vertical: width 1, align-self stretch |
| `skeleton` | `<div class="t-skeleton" aria-hidden="true">` static (no pulse; decided §11 D9) | Data · skeleton, placeholder | bg `#e2e8f0`, radius 6, height 16, width 100% |
| `spinner` | inline SVG arc, `role="status"`, name from `aria-label`, CSS spin; `prefers-reduced-motion` → static. The one allowed infinite loop (decided §11 D9) | Data · spinner, loading | size prop 24, colour `#0f172a` |
| `aspectRatio` | `<div class="t-aspectRatio">` with `aspect-ratio`; direct children get `width/height:100%` via a descendant rule | Layout · ratio, 16:9, frame | width 100%, overflow hidden |
| `scrollArea` | `<div class="t-scrollArea" role="region" aria-label tabindex="0">`, native overflow | Layout · scroll, overflow | overflow auto; needs a `height`/`maxWidth` to scroll (panel hint) |
| `buttonGroup` | `<div role="group" class="t-buttonGroup">`; the **compiler** writes per-child corner declarations so only outer corners round, using each child's own radius value, so a child's override still wins | Layout · button group, segmented | row, gap 0 |

| Step | Work | Acceptance |
|---|---|---|
| A2.1 | Plumbing for the 9 kinds: TS/Rust enums, `ALL_TYPES`, version marker, round-trip fixture | Key-parity + round-trip tests green; v1 doc stays v1 until a new kind is placed, then saves as 4 |
| A2.2 | Container-like kinds: `getChildren`, `canInsertInto`, drop rules, Layers tree, layout props | Drag a heading into a card; undo removes it; drop into `badge` refused with the existing "no" cursor |
| A2.3 | Compiler arms + defaults + goldens for card, alert, badge, separator | Golden files; `<hr>` has no children |
| A2.4 | Compiler arms for skeleton, spinner, aspectRatio, scrollArea, buttonGroup (incl. synthetic corners) | Group of 3 buttons: first has left radius only, last right only, middle none; a child with radius 20 gets 20 on its outer corners |
| A2.5 | Canvas views + palette tiles + `FIELDS` + panel notes (ratio T10, accessible-name field T11 for scrollArea/spinner, orientation reuses T73/T74 plus T12) | Each kind placeable by click and drag, selectable, restylable, deletable; scrollArea keeps the canvas drag working (it scrolls with wheel, not drag) |

#### A3 — Forms (high, one medium item)
| Kind | Export markup and no-JS note | Palette · keywords | Defaults |
|---|---|---|---|
| `checkbox` | `<label class="t-checkbox"><input type="checkbox" [checked]><span>label</span></label>`; box drawn with `appearance:none` + a `data:` SVG check on `:checked` | Forms · checkbox, tick | 16px box, border 1px `#94a3b8`, radius 4, checked bg `#0f172a` |
| `switch` (restyle) | `<label class="t-switch"><input type="checkbox" class="sw"><span class="sw-track"><span class="sw-thumb"></span></span><span>label</span></label>`; real toggle look, `:checked` moves the thumb, input visually hidden but focusable, ring on the track | Forms · switch, toggle | track 40×22, off `#cbd5e1`, on `#0f172a`, thumb white; **changes how existing switches export** (visual upgrade; §10) |
| `field` | `<div class="t-field"><label for="fN">…</label>{control}<p id="fN-d">desc</p><p id="fN-e">error</p></div>`. If the first child is input/textarea/checkbox/nativeSelect the compiler adds `id`, `for` and `aria-describedby`; if not, the label is a `<span>` (never an orphan `<label>`). Not a `<form>` (Phase 7: no form element) | Forms · field, label, form row | column, gap 6; label 14/500; description `#64748b` 14; error `#b91c1c` 14 |
| `nativeSelect` | `<select>` with `<option>`; `value` → `selected`. Real, working, browser-styled popup. **Dropped if A1.2 shows the existing `select` already exports a native `<select>`** (then it is renamed/relabelled instead) | Forms · select, dropdown | same as input |
| `input.suggestions` | `<input list="dlN"><datalist id="dlN">…`: native autocomplete, not the shadcn look (this is the honest "combobox") | prop on Input | — |

| Step | Work | Acceptance |
|---|---|---|
| A3.1 | `checkbox` kind (TS, Rust, canvas, compiler, panel `ติ๊กอยู่` T20, label T21) | Canvas click selects and does not toggle (existing rule); export checked/unchecked goldens; Space toggles in a real browser (real-app check) |
| A3.2 | Switch restyle in canvas and export, shared constants | Old v3/v4 switch docs open unchanged; Preview shows the toggle; two switches independent |
| A3.3 | `field` kind + id/for/describedby pairing | Golden for each first-child case; axe-style check: every `<label>` has a target |
| A3.4 | A1.2 outcome on `select`; `nativeSelect` or relabel; options editor = one option per line (T22) | Options with `<`/`&` escaped; 100-option cap enforced |
| A3.5 | `input.suggestions` prop + panel field T23 | `<datalist>` ids unique per page; empty list emits nothing |

#### A4 — Table, list, icon (high; needed by blocks)
| Kind | Export markup and no-JS note | Palette · keywords |
|---|---|---|
| `table` | `<div class="t-tablewrap" role="region" aria-label tabindex="0">` (horizontal scroll on narrow screens) + `<table><caption><thead><tr><th scope="col">…<tbody>`; text-only cells (rich cells deferred); striped via `tbody tr:nth-child(even)`; node `padding` = cell padding, node border keys = outer frame | Data · table, grid, rows |
| `list` | `<ul>`/`<ol>`; `check` marker via `::before` with a masked `data:` SVG (`-webkit-mask` + `mask`), `none` for plain lists | Text & media · list, bullets, checklist |
| `icon` | inline `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` (decorative) or `role="img" aria-label` when `label` is set; colour = text colour; curated ≈ 80 Lucide icons as path data in the `icon-paths` chunk | Text & media · icon, symbol, arrow, check, star |

| Step | Work | Acceptance |
|---|---|---|
| A4.1 | `list` kind + items editor (T24, one item per line, ≤ 50) + marker segmented (T25–T28) | Goldens for 4 markers; marker `check` has no text glyph dependency |
| A4.2 | `table` kind + compiler + canvas view | 20×100 table renders; wrapper scrolls; caption optional; striped toggle |
| A4.3 | Table editor dialog (lazy `table-editor`): grid of inputs, Tab/Shift+Tab/Enter navigation, add/remove row/column (T29–T33, options T29a–T29c), paste of tab-separated text fills cells, caps T34/T35, one undo step on commit | Keyboard-only edit of a 3×3 table; paste 5×4 TSV fills; 21st column refused with T35; focus never on body after removing a row |
| A4.4 | `icon-paths` chunk (≈ 80 icons, path data only, generated once from the Lucide package at authoring time, listed in the notices file) | Chunk ≤ 12 kB gz; absent from entry graph; each icon golden-tested for valid SVG |
| A4.5 | `icon` kind + picker popover (search T36, grid roving focus, selection announces name) + size/stroke props (T37, T38) | Placing an icon needs no network; changing colour via text colour works; empty `label` → `aria-hidden` |
| A4.6 | Export notice file when an icon is present (approved §11 D5) | Zip contains `THIRD-PARTY-NOTICES.txt` iff an icon node exists on any page |

#### A5 — Medium components that are realistic without JS
| Kind | Export | Palette · keywords |
|---|---|---|
| `carousel` | `<div class="t-carousel" role="region" aria-roledescription="carousel" tabindex="0">`: flex row, `overflow-x:auto`, `scroll-snap-type:x mandatory`; each direct child gets `flex:0 0 calc((100% - gap·(n−1))/n)` and `scroll-snap-align:start` (n = `slidesPerView`). **No arrows, dots or autoplay** (they need JS); visitors swipe/scroll or use arrow keys when focused. Panel note T39 | Data · carousel, slider, gallery |
| `chart` | static inline SVG (bar, line, area) with `role="img"`, `<title>`, `<desc>` listing every value; fills `100%` width on a 600×300 viewBox; ≤ 12 categories × ≤ 3 series; colours editable per series. No tooltips/hover (JS) | Data · chart, graph, bar, line |
| `calendar` | `<table class="t-calendar">` static month grid with `<caption>`, `th scope="col"`, today-style highlight on `selectedDay` via `aria-current="date"`; Thai month/weekday names generated in Rust and TS from one golden table; no navigation | Data · calendar, month, date |

| Step | Work | Acceptance |
|---|---|---|
| A5.1 | `carousel` kind (children = slides), compiler maths, panel field T40 | n=1,2,3 goldens; snaps in a real browser; scroll-snap works inside Preview |
| A5.2 | **Cut line.** Everything below is dropped first if budget or RAM fails | — |
| A5.3 | `chart` data model + SVG renderer in `chart-render` chunk (TS and Rust from shared golden SVG fixtures) | Same SVG string from both sides for 3 fixtures; chunk lazy; missing/NaN values skip safely |
| A5.4 | Chart editor (lazy): kind T41–T44, categories/series grid (T45–T47), caption T48 | Keyboard-only edit; undo = one step per commit |
| A5.5 | `calendar` kind + renderer + panel (T49–T54) | Month length/leap-year goldens (Feb 2028 = 29); BE/CE header; weekStart 0/1 |
| A5.6 | Batch RAM + chunk check | Meets §5.1 A rows or the spec is amended with the measured number |

**GUI CHECK PLAN (A).**
*Designer, headless with mocks:* palette grouping/search/keyboard; placing, selecting, dragging into/out of each container-like kind; Style panel sections per kind; table/list/chart/calendar editors incl. keyboard-only and undo; canvas rendering of every kind; announcements; locked-page behaviour; no console errors; focus-not-on-body after every removal; screenshot diffs canvas vs captured Preview HTML.
*Only the real app proves:* the Rust-compiled HTML/CSS inside the Preview iframe, scroll-snap and `<datalist>` behaviour in WebKitGTK, `:checked` toggling, save → reopen round trip through rusqlite with every new kind (no dropped fields), export zip contents and a clean open of the exported site in a normal browser, RAM deltas.

---

### 9.B Style system

**Goal.** Make shadows, alpha colours, gradients, glass, per-side borders/corners, transforms, transitions and hover/active/focus states ordinary, undoable, exportable style data.
**Scope.** The nine keys (§4.2), `Node.states` (§4.3), the style-panel UX, canvas forced-state preview, compiler emission, perf warnings, the 3D press-button acceptance.
**Out of scope.** Presets (C); motion keyframes (E); per-breakpoint states; container queries; CSS variables/tokens; `disabled` state (no node has a disabled prop, so the state is unreachable); `:focus-within`; `filter: drop-shadow`.
**Data model decision: flat keys + a node-level `states` map.** Flat keys keep the 20 existing keys, breakpoints and sparse normalisation working unchanged and let breakpoint overrides carry the new keys for free. A single `states: {hover, active, focusVisible}` map (not `hoverBackgroundColor`-style flat keys) avoids tripling every key, keeps states paint-only by construction, and mirrors `styleBreakpoints`.
**Why states are paint-only.** No layout, size, spacing or typography key is allowed inside a state: a hover that changes padding shifts neighbours, and `:active` layout shifts cause missed clicks. Allowed: `backgroundColor, color, borderColor, opacity, boxShadow, backgroundGradient, textGradient, filter, backdropFilter, transform` (hint T67).
**Compiler emission.** See §7.2. `decls()` grows the new keys; a new `state_decls()` filters through the allowlist (defence in depth: the Rust side drops disallowed keys even if a file carries them); `@media (hover:hover)` wraps hover only, so touch devices never stick in hover; focus-visible/active are not wrapped. A node's state rules always follow its base rule.
**Panel UX (progressive disclosure, STYLE-PANEL-SPEC order kept).** Existing sections keep their order. New rows are added **inside** the section they belong to and start collapsed: `ไล่สี` (T55) in พื้นหลัง (with an alpha slider T56 on every colour field); per-side borders and per-corner radius in เส้นขอบ using the existing "แยกแต่ละด้าน" pattern; one new section **เอฟเฟกต์** after เส้นขอบ with four collapsed sub-groups: เงา, ฟิลเตอร์, การแปลง, การเปลี่ยนผ่าน (T57–T60). A section header shows an override dot when any of its keys is set. A **state switcher** (T61–T65, `ToggleGroup`, visible labels ปกติ/ชี้เมาส์/กดค้าง/โฟกัส, full name as `aria-label`) sits under the breakpoint control. Choosing a non-normal state: (a) forces and locks the breakpoint control to เดสก์ท็อป (T66, announced), (b) restricts the visible fields to the allowlist (T67), (c) writes go to `states.<name>` through `setNodeStates` (one history entry per commit, group per drag), (d) the canvas **force-displays** that state on the selected node only, inline, with `transition:none`, (e) resets to ปกติ on selection change and when leaving Design. Focus state is offered only for focusable kinds (T68). The canvas never reacts to real hover; real hover/press/focus is checked in Preview.
**Export / perf.** §7 and §5.3. Budget §5.1 B rows.

#### B-prelude — one style-CSS source for Preview, static export and the Phase 12 Vite export (added 2026-11-04; delivered as slice B0, first B slice, right after F2 closes)

**P1. One shared CSS generator, in Rust.** A single function (working name `style_css(doc) -> String` in `compiler.rs` or a new `style_css.rs`) produces ALL of B's style CSS: the state rules (`:hover` wrapped in `@media (hover:hover)`, `:focus-visible`, `:active`; `:disabled` only if a later step makes it reachable — §9.B "Out of scope" still excludes it), `@keyframes`, the `@media (prefers-reduced-motion: reduce)` overrides (§7.4), the `@media (forced-colors: active)` fallbacks (§7.3), and the `kind-looks.json` a2 / a3 sections. `compile_export` / Preview call it, and the Phase 12 Vite export writes its output into the zip as a generated file `src/styles/site.css` (the template has no `src/styles/` today; it has one hand-written `src/index.css` with `@import "tailwindcss"`, imported by `main.tsx`), imported once by the template (for example from `main.tsx` after `index.css`). It is generated per document like `src/data/site.json` (`zip_put` in `export.rs`), never hand-maintained and never a copy in the template.
- Selector contract: the generated CSS targets the same hooks in both outputs. The Vite renderer must put the static export's hooks (`.t-<type>`, the per-node class or a `data-wb-*` attribute, as `data-wb-bp` already does) on each node root, and state declarations must win over the renderer's inline `style` (PM ruling 2026-11-04: move the stated keys off inline style; `!important` only as a last resort — see rulings below; tested).
- The runtime TS breakpoint generator (`breakpointCss` in `export-templates/vite-react/src/lib/style.ts`, F2 D8) is a second CSS source. It moves into the Rust generator (PM ruling 2026-11-04 below): one generator, no exception.
- Acceptance: (a) a test that compiles one fixture both ways and finds the generator's block **byte-identical** in the static `styles.css` and in the zip's `src/styles/site.css`; (b) the Vite-built CSS (`dist/assets/*.css`) still contains every rule of that block (same selectors and declarations; whitespace, order inside a rule and colour notation may change); (c) base-defaults parity is not part of P1 — see FOLLOWUPS 92 (item 2, one shared base-defaults source).

**P2. At-rules survive minification in both pipelines** (restores the 2026-10 requirement removed from §7.1 on 2026-11-03). `@supports`, `@media (hover:hover)`, `@keyframes`, `@media (prefers-reduced-motion: reduce)` and `@media (forced-colors: active)` must survive (1) the static export / Preview CSS path and (2) the Vite build (Tailwind v4 `@tailwindcss/vite` + its Lightning CSS optimisation and Vite's CSS minifier). Acceptance: a test builds the B fixture in both pipelines and greps the built CSS for each at-rule and for at least one rule inside each (prefix rewriting such as `-webkit-` additions is allowed; dropping or merging away a block is a failure).
**PM rulings 2026-11-04 (user-approved spec be2587a6).**
- **B0 = P1 + P2**, the first B slice, right after F2 closes. Project order: F2 closes → B0 → rest of sub-phase B → PREVIEW-CODE-VIEW S2–S10 (PREVIEW-CODE-VIEW-SPEC §11).
- **Breakpoint CSS moves into the Rust generator.** `breakpointCss` (template `src/lib/style.ts`) is retired; its output comes from the same Rust function and is written into the generated `src/styles/site.css`. One generator, no exception.
- **Vite renderer hooks:** each node root carries the static per-node class (`.nN`) or a `data-wb-*` attribute that the generated CSS targets. Keys that have states (and breakpoint overrides) leave the inline `style`, so class rules win by normal cascade. `!important` only as a last resort, each use listed in a test.
- **`:disabled` stays out of scope** (§9.B Out of scope unchanged; P1's ":disabled only if a later step makes it reachable" means not in B).

| Step | Work | Acceptance |
|---|---|---|
| B1.1 | Hardening: add `css_color()` validator (hex3/4/6/8, `transparent`, `currentColor`) used by all **new** colour-bearing keys (the `css_safe` hardening for `url(`, `expression(`, `@import` etc. moved to A1.3, PM 2026-10-26; B1.1 only reuses it) | Hostile fixtures (§4.5.5) pass; existing 20-key output unchanged on every existing golden |
| B1.2 | Plumbing for `boxShadow` end to end (TS, Rust struct + `is_empty` + `overlay_style`, `decls`, `styleToCss`, `STYLE_KEYS`, golden fixtures, round-trip) | Parity + round-trip + golden tests green; a breakpoint override holding only `boxShadow` survives save and reopen (the `is_empty` trap) |
| B2.1 | Alpha colour: `ColorField` accepts `#rgba`/`#rrggbbaa`, adds the alpha slider (T56) and error T69; transparent chip unchanged | Keyboard-operable; typed 8-digit hex accepted; existing 6-digit behaviour and tests unchanged; value stored lowercase |
| B2.2 | Shadow editor (lazy `effects-panels`): layers list, add/remove (T70–T72), fields x/y/blur/spread (T73–T76) colour, inset (T77); drag-reorder not needed (up/down buttons T78/T79) | Removing a layer keeps focus on neighbour; 7th layer refused with message; slider drag = one undo step |
| B3.1 | `backgroundGradient` + `textGradient` plumbing and compile (linear/radial/conic) | Goldens per kind; stops sorted by `at` at compile time; both set on one node → gradient wins as background, text gradient dropped with panel message T80; text-gradient node has the forced-colors fallback (§7.3) |
| B3.2 | Gradient editor: kind (T81–T83), angle T84, stops list with colour+position (T85–T88), text-fill toggle T89 | 2-stop minimum enforced; keyboard add/remove stop; preview bar is an inline-styled div (no canvas, no images) |
| B4.1 | `borderSides`, `borderRadiusCorners`, dashed/dotted (T90–T97 incl. corner names) | Uniform border + one side override compiles with side after uniform; corners override only set corners; existing `borderRadius` docs unchanged |
| B5.1 | `transform` + `transition` plumbing, inline→inline-block rule, UI rows (T98–T108) | Transform order fixed (translate, rotate, scale, skew); `.t-link` with rotate gets `display:inline-block`; transition emits longhands; `property:"paint"` list excludes layout |
| B6.1 | `filter` + `backdropFilter` plumbing and UI (T109–T114) with prefixed backdrop declaration | Both unprefixed and `-webkit-` emitted; blur capped 40 |
| B6.2 | Per-page perf warnings (§5.3) T115–T117 | Adding the 7th backdrop blur shows T115 once, announced; Preview toolbar shows the page count; no per-frame work (headless trace) |
| B7.1 | `Node.states` data model: TS type, `setNodeStates` (allowlist, sparse, locked → null), Rust struct + normalisation, `cleanNodes`, version tier 2 | Writing a disallowed key is refused in TS and dropped in Rust; empty `states` removed on save |
| B7.2 | Compiler: state rules, `@media (hover:hover)` wrapper, reduced-motion and forced-colors fallbacks, class `fx` | Golden for hover+active+focus-visible; order hover → focus-visible → active; `focus-visible` emitted only for focusable output elements |
| B7.3 | Canvas force-display of the selected node's chosen state (inline merge, `transition:none`) | Switching state changes the selected node's look only; neighbours unchanged; switching back restores exactly |
| B8.1 | State switcher UI + breakpoint lock + allowlist-filtered fields + announcements | Choose ชี้เมาส์ on tablet segment → segment becomes เดสก์ท็อป, announced; Esc/selection change returns to ปกติ |
| B8.2 | Reset affordances: per-field ↺ (existing pattern), per-state T118 `ล้างสถานะนี้`, undo | Clearing the last key removes the state object (not an empty `{}`) |
| B8.3 | Scope legacy Preview feedback to `.t-button:not(.fx):active`; assert Preview ≡ export for all user rules | A button with an `active` state shows only the user's rule in Preview; a plain button keeps the legacy 1px press in Preview only |
| B9.1 | **Worked example** (below) as an automated acceptance test | See below |
| B10.1 | RAM measurement per §5.2 for shadows, blur, gradients, transforms; set final thresholds; real-GPU note | Table appended to `RAM-BASELINE.md` style doc by DEV; thresholds amended in §5.1/§5.3 |

**Worked example and acceptance test (B9.1): 3D press-down button.** A linked button with: base `boxShadow [{0,6,0,0,#0369a1},{0,10,12,0,#00000033}]`; `transition {120 ms, ease-out, delay 0, paint}`; `states.hover {backgroundColor:#38bdf8, transform:{translateY:-1}}`; `states.active {transform:{translateY:5}, boxShadow [{0,1,0,0,#0369a1},{0,2,4,0,#00000033}]}`. The invariant that makes it read as a key sinking: **translateY(d) + shadow-y(6−d)** keeps the lower edge fixed (5 + 1 = 6). Expected compiled CSS for node `n3` (declaration order may differ; the set may not):
`.n3{box-shadow:0 6px 0 0 #0369a1,0 10px 12px 0 #00000033;transition-property:background-color,color,border-color,box-shadow,opacity,transform,filter,backdrop-filter;transition-duration:120ms;transition-timing-function:ease-out;transition-delay:0ms}`
`@media (hover:hover){.n3:hover{background-color:#38bdf8;transform:translateY(-1px)}}`
`.n3:active{transform:translateY(5px);box-shadow:0 1px 0 0 #0369a1,0 2px 4px 0 #00000033}`
`@media (prefers-reduced-motion:reduce){.n3{transition:none}.n3:hover,.n3:active{transform:none}}`
Acceptance: (1) cargo golden equals the above; (2) the TS serializer equals the same declarations for the base and each state; (3) save → reopen → identical JSON; (4) one undo reverts the whole preset-less edit session of each field, not partial; (5) Preview with a real pointer: hover raises 1 px, mouse-down sinks 5 px and the visible shadow shrinks, release returns within ~120 ms (measured by two screenshots 200 ms apart); (6) with the OS reduced-motion setting on, the button does not move but the shadow still shrinks; (7) export HTML contains no `<script`; (8) unlinked variant documented "desktop only" (§7.5).

**GUI CHECK PLAN (B).**
*Designer, headless with mocks:* every editor: add/remove/reorder layers, stops, sides; alpha slider and hex entry; state switcher incl. breakpoint lock and announcements; force-displayed state on the canvas; undo/redo granularity; locked nodes inert; warnings appear once and announce; keyboard-only operation of each editor; focus-not-on-body; TS serializer vs golden fixtures.
*Only the real app proves:* Rust compiler output, real `:hover`/`:active`/`:focus-visible` inside the Preview iframe, transition timing, `backdrop-filter` in WebKitGTK 2.52 (support and look), scroll-linked and text-gradient rendering, forced-colors and reduced-motion media behaviour (needs OS setting), save/reopen with typed serde (dropped-key check), RAM/CPU on software GL **and** a real GPU.

---

### 9.C Presets

**Goal.** One click applies a complete look (3D button, glass card, …) that is afterwards just ordinary editable style.
**Scope.** A preset registry (data, lazy), apply engine, picker UI in the Style panel, five built-ins (neumorphic is not shipped), user-saved presets (approved, §11 D6), thumbnails.
**Out of scope.** Preset "variants" as live props (a preset is a one-time merge, no link back); presets for breakpoints; theme packs; sharing/importing presets between machines; user-saved *blocks* (D6).
**Data.** A preset is JSON in a registry file, not code: `{formatVersion:1, id, name (Thai), nameEn, category:"button"|"card"|"surface", appliesTo:NodeType[], style:StylePropsSubset, states?, transition inside style, source:{kind:"original"}}`. Rust validates built-ins and user presets with the **same** validators as documents (§4.2 clamps), so a preset can never write what a document could not. Registry loaded by dynamic import on first picker open; user presets by `library_list("preset")`.
**Apply semantics.** Merge into the node's **base** style and `states`: keys named by the preset overwrite, other keys are untouched; breakpoint overrides are untouched; locked node or unsupported kind → refused with T136. One `updateOpenDocument` = one undo step; announce T121; focus returns to the picker button. Every preset that sets a background also sets `color`, and a test asserts text contrast ≥ 4.5:1 in each state on opaque backgrounds (glass: asserted on its documented backdrop).
**UX.** A `พรีเซ็ต` button (T120) at the top of the Style panel for kinds in some preset's `appliesTo`. It opens a popover (not a modal) with a search field (T127), the built-ins, and `พรีเซ็ตของฉัน` (T126). Each entry is a card: thumbnail + name; Enter or click applies; no hover-apply (no accidental change). Below a node's header, "บันทึกเป็นพรีเซ็ต" (T122) opens a one-field name dialog (T123, initial focus on the field, Enter saves, Esc cancels) and saves the node's current **paint + effect keys, states, transition** (never size/spacing/text, so a saved preset cannot drag layout along).
**Export.** None specific: after apply, a preset is plain style/state data and compiles like hand-set values.
**Budget.** Presets chunk ≤ 6 kB gz, picker ≤ 3 kB gz; thumbnails ≤ 12 live DOM nodes at a time; no images, no canvas, no network.

Built-in list (all `original`, names via T128–T132):
| Id | Applies to | Recipe |
|---|---|---|
| `button-3d` | button, link | bg `#0369a1`, colour `#ffffff`, radius 12, shadow `0 6px 0 #0c4a6e, 0 10px 12px #00000033`, transition 120 ms ease-out; hover: `translateY(-1)` + `brightness(1.08)`; active: `translateY(5)` + shadow `0 1px 0 #0c4a6e, 0 2px 4px #00000033` |
| `card-glass` | container, card, section | bg `#ffffff2e`, border 1px `#ffffff4d`, backdrop blur 16 + saturate 140 %, shadow `0 8px 32px #0000001f`, radius 16. Only reads well on a coloured/image background (T133 note shown under it) |
| `card-soft` | container, card | bg `#ffffff`, shadow `0 1px 2px #0000000d, 0 8px 24px #0000001a`, radius 16, border 1px `#f1f5f9` |
| `button-gradient` | button, link | linear 135° `#0369a1 → #4338ca`, text `#ffffff` (both stops ≥ 4.5:1 against white; C5 asserts it); hover `brightness(1.08)`; active `translateY(1)` |
| `outline-glow` | button, link, container, card | transparent bg, border 2px `#0369a1`, colour `#0369a1`; hover shadow `0 0 0 4px #0ea5e933`; focus-visible same ring plus 2 px solid outline |
| `neumorphic` | container, card | **Not shipped (decided, §11 D6 note).** Soft low-contrast edges fail the 3:1 non-text rule for controls; it would be reconsidered only as a non-interactive card if a later review finds a version that passes. |

| Step | Work | Acceptance |
|---|---|---|
| C1 | Registry format + Rust/TS validators + bun lint (`source`, `appliesTo` known, no key outside StyleProps/states allowlist) | Lint fails on a preset with a layout key in `states` or an unknown type |
| C2 | Apply engine `applyPreset(doc,nodeId,preset)` in `document-ops` | Merge semantics unit tests; locked → null; one undo step reverts all keys |
| C3 | Picker UI (lazy `preset-picker`): popover, search, keyboard roving, announce, empty state T135 | Open with Enter; arrows move; Esc closes and returns focus to `พรีเซ็ต`; focus never on body |
| C4 | Built-ins `button-3d`, `card-glass` (+ contrast tests) | Apply to a fresh linked button then compare compiled CSS to the B9.1 shape (same structure, preset values); glass shows T133 |
| C5 | `card-soft`, `button-gradient`, `outline-glow` | Contrast tests green in all states; each applies to every kind in `appliesTo` |
| C6 | Rust: table `library_items(kind TEXT, id TEXT PRIMARY KEY, name TEXT, json TEXT, created_at INTEGER)` via `CREATE TABLE IF NOT EXISTS`; commands `library_list`, `library_put`, `library_delete`; json ≤ 16 kB, ≤ 200 rows, validated | Fresh DB and existing DB both open; hostile json rejected; no change to project rows; round-trip test |
| C7 | Save-as-preset dialog (T122–T124), delete with confirm (T125, T134; initial focus on Cancel, Phase 9 pattern), user presets shown in the picker | Save then apply to another node of another project; delete announces; locked or non-paint nodes save only paint/effect keys |
| C8 | Thumbnails and RAM check | ≤ 12 DOM thumbnails; backdrop-filter replaced by a static tint in thumbs; opening the picker adds ≤ +1 MB PSS vs control; chunk sizes within §5.1 |

**GUI CHECK PLAN (C).** *Designer headless:* picker open/search/keyboard, apply + one-step undo + announce, save/delete flows with a mocked `library_*`, locked-node refusal, thumbnails render without console errors, focus. *Real app only:* typed-serde round trip of presets through `library_put/list`, real SQLite file behaviour (fresh and existing DB), Preview rendering of glass/3D results, RAM.

---

### 9.D Blocks and sections

**Goal.** A Blocks panel with categories; drag (or insert) a ready-made section; it lands as ordinary nodes the user restyles freely. Marketing categories are authored from scratch under §2.2.
**Scope.** Block format, registry, insert engine, flyout UI, drag + non-drag insertion, migration of the 6 Phase 5B blocks and 5 templates, v1 content, notices file.
**Out of scope.** User-saved blocks (not in v1, decided §11 D6: asset ids are project-bound and extracting a subtree needs image stripping); locked/linked blocks; fetching blocks from a network; app-shell (sidebar/dashboard) blocks (not in v1, §11 D4); block animation (E adds motion data later; blocks may carry `motion` once E ships).
**Data (block format, v1).**
```
{ formatVersion: 1, id, category, scope: "page"|"inline", name, nameEn, keywords: string[],
  source: {kind:"original"} | {kind:"mit", project, ref, retrieved},
  thumb: [ {x,y,w,h,tone}… ≤ 12 ],          // hand-authored wireframe rectangles
  root: "<localId>",
  nodes: { "<localId>": {type, name?, props, style, states?, motion?, styleBreakpoints?} } }
```
Children are referenced by `localId` inside `props`. On insert every id is replaced by `crypto.randomUUID()` and references are remapped. Validation is all-or-nothing: ≤ 200 nodes, known types only (existing + A), every reference resolves, no cycles, no network URLs, no asset ids (images are empty-`src` placeholders), strings clamped; failure → T146, nothing inserted. A bun lint test runs it over the whole registry and requires `source`.
**Insertion rules.** `page` blocks go through `templateInsertIndex` (end of page, or after the selected top-level section); dropping anywhere on the canvas snaps to the nearest **top-level** slot by pointer Y (indicator line shown). `inline` blocks use `resolveInsertTarget`/drop slots like palette nodes and may land in containers/cards. One document write = **one undo step** (the `applyTemplate` pattern). After insert: select the root, `setFocusLayerId`, scroll into view, announce T145. A locked page disables insertion (T151, disabled buttons keep full-strength rings, §6.3). `DragPayload` gains `{kind:"block", blockId}` and a new MIME `application/x-webapp-block` (so existing drop handlers ignore it safely until D5 wires it).
**Responsive.** Each page block ships tablet/phone `styleBreakpoints` where needed (stack columns, reduce font sizes, hide nothing), checked in Preview at 1024/719 px; the Design canvas does not show breakpoints (§3.5).
**Colour safety.** Every page block sets `backgroundColor` and `color` on its root so contrast holds on any page background, in literal hex (§11 D1).
**UX.** `BlocksFlyout`: a lazy, **non-modal** panel (`role="dialog" aria-modal="false"`, 340–380 px) overlaying the left of the canvas; opened by the palette `บล็อก` button (the existing dropdown is replaced) and the Ctrl+K group; canvas stays interactive and visible ≥ 360 px at a 960 px window. Top: search (T140). Left: category list (T153–T166). Right: a 2-column grid of cards (wireframe thumb, name, primary `แทรก` T141, a ⋯ menu T152 with T142/T143/T144 explicit positions). Card helper text T147. Esc closes (T149 label on the close button) and returns focus to the opener. Thumbnails are wireframe SVG built from `thumb` (zero images, ≈ 0 RAM); one optional live preview of the focused card may be added in v1.1.
**Export.** Nothing special; blocks are normal nodes. `icon` nodes inside blocks trigger the notices file (§2.4).
**Budget.** Flyout UI ≤ +6 kB gz in a lazy chunk; registry ≤ 30 kB gz in a separate lazy chunk loaded on first open; opening ≤ +4 MB PSS, ≤ +2 MB 30 s after closing.

Categories and v1 count (generic names only): header, hero, features, pricing, testimonials, FAQ, CTA, footer, contact, logo cloud, stats, plus `elements` (the migrated Phase 5B blocks). **v1 (approved, §11 D4 a): 11 marketing categories × 2 variants = 22 blocks, plus the 6 migrated elements and 5 migrated templates folded into matching categories.** Rejected alternatives are kept in §11 D4.

| Step | Work | Acceptance |
|---|---|---|
| D1 | Format types (TS+JSON schema), validator, `THIRD-PARTY-NOTICES.md` (shadcn MIT text, Lucide ISC, Feather MIT) + About dialog (T167, T168) | Lint test; notices file bundled as a resource; dialog is lazy; Esc closes |
| D2 | Insert engine `insertBlock(doc, selection, block, position)` with id regeneration, remap, validation, locked check | Unit tests: ids unique and not equal to registry ids; references remapped; invalid block inserts nothing; one undo step; page lock refuses |
| D3 | Migrate 6 blocks and 5 templates into the registry, same trees | Inserted structure equals today's (deep-equal after id normalisation); old dropdown entries still work until D4 replaces them |
| D4 | Flyout shell: lazy chunk, categories, search (announce count), wireframe thumbs, empty state T148 | Opens ≤ 150 ms after first chunk load in mock; no entry-graph reference; Esc/restore focus |
| D5 | Drag from card to canvas (new payload, top-level snapping indicator) + `แทรก` button + ⋯ menu + keyboard (Enter inserts after selection) | Same result by drag, button, menu and keyboard; announce T145; insertion with a locked selection refused T151 |
| D6 | Author batch 1: header, hero, footer, CTA (2 each) | Each passes the D10 checklist and contrast; Preview at 1024/719 px has no horizontal scroll |
| D7 | Author batch 2: features, pricing, FAQ (2 each); FAQ uses `accordion`, pricing uses `list` + `icon` | Same |
| D8 | Author batch 3: testimonials, contact, logo cloud, stats (2 each); images are placeholders, logo cloud uses neutral boxes with generic names | Same; no network URL in any block |
| D9 | Wire Ctrl+K group, palette button, deprecate the old dropdowns | Command palette lists blocks lazily; no duplicate entries |
| D10 | Review and measurement: (1) every block ticked on the checklist below; (2) licence audit of `source` lines; (3) notices cover every dependency DEV can find in `package.json`/`Cargo.toml` that ships in the app; (4) RAM and chunk numbers | Reviewer ≠ author signs each block; RAM within §5.1 D rows or spec amended |

**D10 review checklist (per block):** authored from scratch or `mit` with `source.ref` recorded; no composition lifted from a paid product (spacing system, section order, decorative devices); all strings generic and written for this app; Thai default copy readable; alt text empty for placeholders; colours literal with ≥ 4.5:1 text contrast; touch targets ≥ 24 px; node count ≤ 60 (soft); responsive overrides present; headings in order (`h1` only in hero).

**GUI CHECK PLAN (D).** *Designer headless:* flyout open/close/focus, category/search, card keyboard, insert by all four routes with one undo each, id uniqueness after double insert, locked page, drag indicator snapping, announcements, wireframe rendering, console cleanliness, the lint test. *Real app only:* Preview of each block at 1024/719 px (compiled CSS), native drag from a webview card to the canvas in WebKitGTK (HTML5 DnD quirks), save/reopen of a page full of blocks, RAM, flyout over a 960 px window.

---

### 9.E Motion

**Goal.** Entrance animations and hover transitions that work in a static export, with a clear boundary around what cannot work.
**Scope.** `Node.motion.entrance`, keyframe emission, `view()` scroll-triggered entrance with a never-invisible fallback, a Motion panel with replay, reduced motion, per-page warning (§5.3). Hover/press transitions already come from B.
**Out of scope (needs JS or breaks accessibility):** IntersectionObserver reveals, JS parallax, carousel autoplay, infinite looping effects (except `spinner`), animated layout properties, page transitions, Lottie/video.
**Presets (v1):** fade, slide up/down/left/right (24 px), scale-in (0.96→1); transform and opacity only; duration 100–2000 ms, delay 0–2000 ms, easing from the B list.
**Triggers.** `load`: `animation: nN-in <dur> <easing> <delay> backwards` — `backwards` keeps the element in its "from" state during delay and the final state afterwards, so no `forwards` needed. `view`: `animation-timeline: view(); animation-range: entry 0% entry 60%` **entirely inside** `@supports (animation-timeline: view())`, with the "from" state only inside that block. A browser that lacks support never sees a hidden initial state: content simply shows. Test: strip the `@supports` block → page fully visible.
**Reduced motion:** `@media (prefers-reduced-motion: reduce){.nN{animation:none}}`; content shows in its final state.
**Never invisible / layout stable:** opacity+transform only; the element's box is unchanged (no layout shift); no `display:none` start state.
**Panel UX.** Last section `การเคลื่อนไหว` (T170), collapsed. Effect select (T171–T178), trigger (T179–T181), duration/delay (existing T106/T107 strings), easing (T108), a `เล่นตัวอย่าง` button (T182). Replay: applies a transient inline animation to the **selected canvas node only**, removed on `animationend`; one node at a time; if the OS prefers reduced motion it does not play and says T184; announces T183. The canvas never autoplays anything. `view` triggers cannot be judged in Design: panel note T186. T185 shows when `view` is chosen.
**Script decision (approved, §11 D2 a): no script ever.** Rejected alternatives, kept for the record, if IntersectionObserver reveal were ever wanted: B) a ≈ 400-byte inline script emitted only for pages that use it, which cannot be previewed (Preview has no `allow-scripts`, CSP unchanged) so the Preview would show a different result than the export, or C) a per-project opt-in toggle, default off. Neither is specified in steps; if ever reopened, a follow-up spec is needed because it changes the export's "no JS" guarantee and the CSP story.
**Budget.** Motion panel ≤ +3 kB gz (lazy); Preview with 30 animated nodes ≤ +3 MB PSS; warn above 30 animated nodes (T117).

| Step | Work | Acceptance |
|---|---|---|
| E1 | `Node.motion` data model (TS, Rust, `cleanNodes`, normalisation, parity/round-trip); version tier 2 | Round-trip fixture; empty `motion` dropped; clamps tested |
| E2 | Compiler: keyframes for 6 presets, `load` trigger, reduced-motion override, dedupe of identical keyframes | Goldens; `animation-fill-mode:backwards` present; no `forwards`; no `<script` |
| E3 | `view` trigger inside `@supports` with the fallback test | Goldens; stripping the `@supports` block leaves no `opacity:0` outside it |
| E4 | Motion panel UI (lazy `motion-panel`) with fields and notes T185/T186 | Keyboard-complete; one undo per commit; panel hidden for kinds that cannot animate (none excluded in v1) |
| E5 | Replay button on the canvas (transient style, `animationend` cleanup, reduced-motion refusal) | Replay twice quickly = one animation; node style unchanged after; reduced-motion shows T184 |
| E6 | Preview parity and per-page warning (T117) | Preview shows load animations on open; 31st animated node shows T117 once |
| E7 | RAM check with 30 animated nodes; amend thresholds | Within §5.1 E row or amended |
| E8 | *(dropped: §11 D2 approved option a, no script)* | — |

**GUI CHECK PLAN (E).** *Designer headless:* panel, replay on the canvas (CSS animation events work in the headless browser), reduced-motion emulation via Playwright `reducedMotion:"reduce"`, undo, warning, goldens of captured compile output. *Real app only:* Rust-emitted keyframes in Preview, **whether WebKitGTK 2.52.6 supports `animation-timeline: view()`** (unverified; if unsupported the fallback path is what the user sees in the app, while a modern Chromium/Safari visitor sees the animation), real OS reduced-motion behaviour, RAM.

---

## 10. Risks and open questions

| # | Risk / question | Impact | Mitigation / default |
|---|---|---|---|
| 1 | Typed serde silently drops new keys; unknown node kinds fail to open | Data loss that looks like a UI bug | §4.5 tests 1–3 are the first thing each step adds; B1.2 proves the `is_empty` trap with a breakpoint-only override |
| 2 | TS `styleToCss` and Rust `decls` drift | Canvas ≠ Preview | Shared golden fixtures, tested on both sides |
| 3 | Re-exporting an old document now yields different markup (A1 fidelity pass, A3 switch restyle) while the stored file is unchanged | A user sees a changed site after upgrading | Called out in the release note; decided in §11 D8 (a): the pass is in scope |
| 4 | Older builds cannot protect newer files (`version` unchecked) | Silent key loss if someone downgrades | Accepted (§4.6) |
| 5 | Effect RAM/GPU cost unproven; software-GL numbers are comparative only | A heavy page may be slow on a weak GPU | Caps + warnings (§5.3); B10 measurement; real-GPU check listed as unverified |
| 6 | WebKitGTK 2.52.6 support for `animation-timeline: view()` and `backdrop-filter` unverified | Effects absent inside the app's own Preview | Fallbacks never hide content (§9.E); verify in the real app before E3 is accepted |
| 7 | `.nN:hover` beats breakpoint overrides (specificity) | Hover colour wins over a tablet override | v1 states apply at all widths; T119 shown; states × breakpoint matrix deferred |
| 8 | `:active` on unlinked `<span>` buttons on iOS Safari | Press effect missing there | Documented; acceptance uses a linked button |
| 9 | Text gradient in forced-colours mode removes `background-image` and `color:transparent` hides the text | Invisible text for forced-colours users | Emit `@media (forced-colors:active){.nN{color:CanvasText;background:none}}` for text-gradient nodes; asserted in B3.1 |
| 10 | 59 palette tiles | Hard to find things | Groups + search (A1.1); command palette already lists elements |
| 11 | HTML5 drag-and-drop from a card in WebKitGTK may behave differently from Chromium | Block drag unreliable | Non-drag route is first-class (§6.5); real-app drag test in D5 |
| 12 | The per-type export of every Phase 6b kind has not been audited line by line (the six named kinds were confirmed skeletal by reading the compiler) | A1 scope could grow | A1.2 audit comes first and sets the real scope |
| 13 | Whether the existing `select` already exports a native `<select>` | `nativeSelect` may be redundant | A3.4 decides; if redundant it is dropped |
| 14 | Placeable-count claim "61" not reproducible | Scope arithmetic | §3.4; spec derives from the docs index |
| 15 | Calendar default era (BE vs CE) | Wrong year shown to Thai users | BE default with a toggle (approved, §11 D10) |
| 16 | Display names of presets/blocks: Thai primary or English? | Naming consistency | Default Thai name + English keywords for search; component names stay English |
| 17 | Licence reading is not legal advice; exported-site notice for icons | Compliance gap | §11 D5; v1 blocks are `original`, notices file shipped |
| 18 | `css_safe` lets `url(`, `image-set(`, `expression(`, `@import`, `javascript:`, `behavior:` through in the existing 20 keys, and its strip/comment passes can *create* `url(` from `u/**/rl(` | Low (own file) | A1.3 (moved from B1.1, PM 2026-10-26) |

---

## 11. DECISIONS THAT NEED THE USER

Each decision is written so PM can summarise it in Thai: question, options, **recommended default**, what changes if the user picks otherwise. **All ten were approved on 2026-10-26 with option (a); the other options are kept for the record only.**

**D1. Dark mode: tokens or literal colours?**
Status: APPROVED 2026-10-26, option (a) — Literal colours only; no tokens or dark-mode switch in Phase 11.
Today every colour is a literal hex and exported sites have no theming. Blocks set their own text and background colours so they stay readable on any page.
- (a) **Literal colours only — recommended.** Smallest change, no schema impact, matches current behaviour.
- (b) A named swatch list per project (editor convenience; still stores hex).
- (c) Project design tokens compiled to CSS custom properties with an optional dark variant (schema change, migration, export CSS variables, and a visible dark/light switch needs either `prefers-color-scheme` rules or JS). This was deferred before; it is a phase of its own.

**D2. Scripts in the export: never, or a tiny optional reveal script?**
Status: APPROVED 2026-10-26, option (a) — No script in the export, ever.
- (a) **No script, ever — recommended.** Entrance on scroll uses CSS `animation-timeline: view()` where the visitor's browser supports it; elsewhere content simply shows without animation.
- (b) A ≈ 400-byte inline IntersectionObserver script only on pages that use scroll reveal. Works in all browsers, but cannot be previewed (Preview forbids scripts) and breaks the "static, no JS" promise.
- (c) Per-project opt-in toggle, default off (needs a follow-up spec).

**D3. Which medium components to build vs defer?**
Status: APPROVED 2026-10-26, option (a) — Build carousel, chart, calendar; defer command, context-menu, resizable, toast, sidebar-as-node.
- (a) **Build carousel, chart, calendar; defer command, context-menu, resizable, toast, sidebar-as-node — recommended.** The three built ones have honest static forms (scroll-snap, inline SVG, static month grid). The deferred four need JS to mean anything; the Alert node covers static banners and a sidebar arrives as an app-shell block later.
- (b) Same, but also skip `chart` (the largest item; saves roughly a third of batch A5).
- (c) Additionally build design-only visual versions of command/context-menu/resizable (look only, no behaviour). Risk: users expect them to work in the exported site.

**D4. How many blocks in v1?**
Status: APPROVED 2026-10-26, option (a) — 22 blocks (11 categories × 2) plus the 6 migrated elements and 5 migrated templates.
- (a) **22 — 11 categories × 2 variants — recommended**, plus the 6 migrated elements and 5 migrated templates.
- (b) 33 — 11 × 3 (about 50 % more authoring and review).
- (c) 18 — 6 categories × 3 (header, hero, features, pricing, CTA, footer).
- Optional add-on: an "App" category (dashboard/sidebar/login shells adapted from shadcn's free MIT blocks). Needs a sidebar node (deferred in D3), attribution entries (D5). Not in v1.

**D5. Attribution placement.**
Status: APPROVED 2026-10-26, option (a) — App notices file + About dialog + per-block `source`; export gets `THIRD-PARTY-NOTICES.txt` only when an icon is used; no visible credit on pages.
- (a) **App notices file + About dialog + per-block `source` line; export zip gets `THIRD-PARTY-NOTICES.txt` only when an icon is used; no visible credit on pages — recommended.** Covers shadcn (MIT), Lucide (ISC) and Feather-derived icons (MIT).
- (b) App only, nothing in exports. Smaller, but exported pages that embed icon paths would carry an ISC-licensed work without its notice.
- (c) A visible credit line in every exported site. Safest, intrusive, probably unnecessary.
- Open legal point: whether exports of blocks *adapted* from MIT sources need a notice. v1 avoids the question (all blocks `original`). If MIT-adapted blocks are added later, ask for a proper legal opinion if the user distributes the app commercially.

**D6. User-saved presets and blocks in v1?**
Status: APPROVED 2026-10-26, option (a) — User-saved presets yes; user-saved blocks no.
- (a) **Presets yes, blocks no — recommended.** Presets are small paint-only data stored app-wide (new `library_items` table). Blocks need subtree extraction and image/asset handling.
- (b) Neither (smallest).
- (c) Both (adds a subtree-to-block exporter, image stripping, and a second library UI).
- Related: neumorphic preset is not shipped by default (fails 3:1 non-text contrast).

**D7. Order: A before B, or a minimal style slice first?**
Status: APPROVED 2026-10-26, option (a) — Strictly A → B; no B0 slice. *(2026-11-04: the "B0" of the B-prelude is a different thing — the shared CSS generator, P1 + P2 — and is the first B slice; it does not interleave style work into A.)*
No hard dependency exists: A's components use only the existing 20 keys and look plain but correct; native focus outlines remain because PREFLIGHT does not remove them.
- (a) **Strictly A → B — recommended.** Rust enum migration (new kinds) and style migration (new keys) stay separate; the version marker is settled once.
- (b) A "B0" micro-slice before A2: alpha colours, one box-shadow, hover and focus-visible states, so cards/buttons look finished sooner. Cost: B's plumbing is split in two and the `states` model must be settled earlier.

**D8. Items beyond DEV's audit: `icon`, `list`, and the fidelity pass on existing kinds.**
Status: APPROVED 2026-10-26, option (a) — `icon`, `list` and the fidelity pass on existing kinds are all in scope.
- (a) **All three — recommended.** Blocks need icons and real lists; a placed Dialog/Empty/Item should not export as two bare lines.
- (b) `icon` and `list`, skip the fidelity pass (old kinds keep exporting bare markup).
- (c) None (blocks lose icons and lists; pricing/feature blocks degrade).
- Consequence of (a): re-exporting an *old* document gives better markup and CSS; stored data does not change.

**D9. Looping animations.**
Status: APPROVED 2026-10-26, option (a) — Only the spinner loops; the skeleton is static.
- (a) **Only the spinner loops; the skeleton is static — recommended** (continuous motion is a WCAG 2.2.2 concern; the spinner is the loading indicator users expect, and reduced-motion stops it).
- (b) Skeleton also pulses.
- (c) No loops at all (a static spinner on a static page does nothing useful).

**D10. Calendar era default.**
Status: APPROVED 2026-10-26, option (a) — Buddhist era default with a per-node switch to CE.
- (a) **Buddhist era (พ.ศ.) with a per-node switch to CE — recommended** for a Thai interface.
- (b) CE default.

---

## 12. Suggested order of work and rough size

Sizes are relative effort (small / medium / large), no dates. Each sub-phase is independently shippable and ends with the Designer GUI pass, the RAM/chunk check and PM approval before the next starts.

| Order | Sub-phase | Size | Steps | Depends on | Notes |
|---|---|---|---|---|---|
| 1 | A1 Palette + fidelity | small → medium (medium if the A1.2 audit finds many gaps; A1.3 also carries the `css_safe` hardening, about 40 lines of Rust plus the 39-case unit test) | 5 | nothing | A1.1 touches no schema; A1.3 is the first compiler change and starts with the `css_safe` hardening |
| 2 | A2 Surfaces and feedback | medium | 5 | A1 | First Rust enum migration (9 kinds) |
| 3 | A3 Forms | medium | 5 | A2 | Switch restyle changes old exports (§11 D8) |
| 4 | A4 Table, list, icon | large | 6 | A2 | Table editor and icon registry; notices file starts here |
| 5 | A5 Carousel, chart, calendar | large | 6 (cut line at A5.2) | A2 | Chart is the cost (in scope, §11 D3 a) |
| 6 | B Style system | large (the largest) | 17 | A (types exist; none strictly required) | Two mirrors + `states`; B10 measures effects |
| 7 | C Presets | medium | 8 | B | C6 adds the only new SQLite table |
| 8 | D Blocks | large | 10 | A2–A4, B (shadows/states for polish); C optional | Authoring and review dominate |
| 9 | E Motion | medium | 7 (E8 dropped, §11 D2 a) | B (compiler order, easing list) | Real-app check of `animation-timeline` gates E3 |

Gating rules: no sub-phase starts before the previous one's checks pass; every step that changes `schema.ts`/`defaults.rs` lands with its parity and round-trip tests in the same step; the first schema/compiler edit of the phase is A1.3 (compiler only) and A2.1 (schema). If budgets in §5.1 are exceeded, the batch is reduced (A5 cut line first) before a budget is relaxed.
