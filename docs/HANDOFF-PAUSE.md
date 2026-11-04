DESIGN.md batch (2026-10-06) done, waiting for Designer. Polish batch passed Designer's check. Phase 8 passed on 2026-10-05.

## 2026-10-06 — DESIGN.md batch (Thai leading, overlay motion-reduce, Ctrl+S check)

No schema/defaults change. No new package.

- **Search field (WCAG 3.2.1, added 2026-10-06):** top-bar search no longer opens the palette on focus (Tab / Shift+Tab / focus restore do nothing). Opens on left click, Enter, Space, or the first printable character, which is carried into the query (`src/lib/search-trigger.ts`, bun-tested); Ctrl/Cmd/Alt combos pass (Ctrl/Cmd+K unchanged). IME: composition runs in the top-bar field (local value), and `compositionend` opens the palette with the composed text; Thai keyboard layouts send direct keys and take the printable path. Paste opens with the pasted text.
- **Seeded palette caret fix (2026-10-06):** typed 'hero' became 'ero' because Radix FocusScope's mount autofocus calls `focusFirst(..., { select: true })`, selecting the seeded first character. `CommandPalette` `onOpenAutoFocus` now preventDefaults and calls `focusCaretAtEnd` (`src/lib/caret.ts`, bun-tested) on the cmdk input, again next frame. Applies to key-seeded, IME-seeded and unseeded opens; close-focus handling unchanged.
- **Warm click-open focus return (2026-10-06):** the search field opened the palette on `pointerdown`, before mousedown moved focus into it; with the chunk loaded the dialog renders synchronously and `useRestoreFocus` captured the previous element (canvas/title/layer row). Cold opens rendered after the lazy load, when focus was already on search. Now opens on `click` (after focus lands), so warm = cold: Esc/plain close and ordinary item picks return to search; เพิ่มหน้า rename and template-insert layer focus unchanged; keyboard opens unchanged.
- **Thai line height:** StylePanel breakpoint labels `leading-none` → `leading-4` (11px text, h-7 row unchanged); `ui/label.tsx` `leading-none` → `leading-5` (only user: ชื่อโปรเจกต์ in NewProjectDialog).
- **Overlay motion-reduce:** `motion-reduce:animate-none!` on dialog / alert-dialog overlays and the content (plus sub-content) of dialog, alert-dialog, popover, dropdown-menu, context-menu, select, tooltip. `!` makes it win regardless of rule order or any non-`:where()` animate class (the built `data-open:animate-in` uses `:where()`, so the existing plain overlay guard already worked; it is now `!` for consistency). Built CSS: `.motion-reduce\:animate-none\!{animation:none!important}` inside `@media (prefers-reduced-motion:reduce)`.
- **Ctrl+S:** not implemented anywhere (no `s` key handler in `src`); UI-REFRESH-SHADCN §7 says "Ctrl+S — Not added", earlier handoff says "No invented Ctrl+S". Not a canvas-focus bug and not a mock artifact — no change; adding it is a PM decision (spec sketch: save when dirty, preventDefault, any focus except dialogs; inline edit commits first).
- **Ctrl/Cmd+S (PM-approved, added 2026-10-06):** window capture keydown in `EditorPage`; decision in `src/lib/save-shortcut.ts` (bun-tested). Always preventDefault; no-op while a dialog/alert-dialog/popover/menu or the Ctrl+K palette is open, on key repeat, when clean, or while a save is in flight (`loading`, same flag that disables the button). Inline edit: blur → same `commitEdit` as Esc (sync store write), focus back to canvas, then dirty check + `saveManual` (same path as บันทึก: aria-live บันทึกแล้ว / failure toast). Shift/Alt variants pass through. **Title field (PM-approved):** with focus in the title input (`data-project-title`), Ctrl/Cmd+S first commits the typed title with the blur rule (`commitProjectTitle`: trim, empty/whitespace → `หน้าใหม่`; blur has no revert/message), via `commitOpenTitle` (typing back to the saved title is not dirty), then the normal dirty check + `saveManual`. Focus stays in the field. **Title blur / Enter (PM-approved):** same `commitProjectTitle` + `commitOpenTitle`, then `saveManual` only if dirty and no save in flight (`titleBlurShouldSave`, bun-tested); a blur with no net change or right after Ctrl/Cmd+S makes no save call.


## 2026-10-06 — Polish batch (implemented, awaiting Designer)

No schema/defaults change. No new package.

- **Reduced motion:** Preview CSS adds `@media (prefers-reduced-motion:reduce){.t-button:active{transform:none}}`; pointer cursor kept. Export CSS unchanged (test asserts no press/reduce CSS in export).
- **Save announcement:** one `sr-only` `role="status"` `aria-live="polite"` region in `EditorPage`; announces `บันทึกแล้ว` after a successful manual save (cleared first so repeats re-announce). Still no success toast.
- **NumberField suffix:** 10px → 11px.
- **Muted text:** light `--muted-foreground` (`:root` and `.theme-light`) → `#6b6b6b`: 4.97:1 on #f7f7f7, 4.89:1 on #f5f5f5. Dark unchanged.
- **Left list:** refreshed below to match the code.
- **Child lock on locked page:** layer-row ล็อก/ปลดล็อก disabled for children when the page root is locked; page-root layer row and page …/context toggles stay enabled.

## Polish batch items (original list)

- Preview button press respects `prefers-reduced-motion`.
- `aria-live` on save success.
- NumberField suffix goes from 10px to 11px.
- Light muted-foreground token changes to about `#6b6b6b`. The old token (≈#737373) measured 4.43:1 and 4.35:1; target is 4.5:1.
- Refresh the stale "Left" list. sonner, alert-dialog, and useBlocker are already done.
- Disable a child layer's ล็อก item on a locked page.

## Deferred

- Button link (href) field in properties.
- Preview page switching.
- Offering to create matching Login/Signup pages.
- Nested paths.
- Favicon GC: a future favicon picker must add `meta.favicon` to the `image_ids` keep-set.
- Project design tokens.


## 2026-10-05 — Phase 8 recheck follow-ups

No schema/defaults change. No new package.

- **Select on open:** `useLayoutEffect` focuses and `select()`s rename/path fields for +, palette, and both menus (removed competing `autoFocus`).
- **Palette เพิ่มหน้า rename:** Keep `pendingPageRenameId` until the rename popover closes so CommandPalette `onCloseAutoFocus` still prevents restoring focus to ออกแบบ.
- **Layout (1100px):** หน้า list `max-h-24` (~3 rows); layers `min-h-32` (~4 rows); Add panel `flex-1 min-h-0 overflow-y-auto` so it scrolls instead of crushing Layers.
- **Switch dirty:** `isProjectDirty` compares meta + all pages (id/name/path/root/nodes refs); open root/nodes ignored. `bun test src/lib/project-pages.test.ts` (3 tests). `tsconfig.json` excludes `src/**/*.test.ts` so `tsc` in build stays clean.
- **Lock control:** ล็อก/ปลดล็อก on page … / context menus and layer row menu (`togglePageRootLocked` / `toggleNodeLocked`); stays enabled on locked pages. Style banner points to those menus.


## 2026-10-05 — Phase 8 Designer recheck fixes

No schema/defaults change. No new package.

- **Popover blocker:** Rename/path from … or context menu armed a pending open; menu `onCloseAutoFocus` now `preventDefault`s and opens the popover after close (Radix focus-return was dismissing it ~200 ms).
- **Focus:** Command palette `เพิ่มหน้า` sets `pendingPageRenameId` (same rename field as +); delete dialog `onCloseAutoFocus` returns focus to the page row after ยกเลิก/confirm.
- **Locked page cascade:** `isContentLocked` — page root lock disables child inline text + Style fields and content mutations; page-list reorder unchanged; per-node lock on unlocked pages unchanged.
- **Empty path:** `setPagePath` rejects blank input as `ว่าง` / `กรุณาใส่เส้นทาง` (normalize no longer turns "" into `/` before that check).
- **หน้า list scroll:** `max-h-[8.75rem]` + own scrollbar so ≥4 pages do not shove เลเยอร์ off an 1100px window.


## 2026-10-05 — Phase 8 Multiple pages

User approved. Spec md5 `12a6bf35e8dda5ba35a039db6a3870f2`. Open questions left out: no Preview link-to-page switching, no offer to create Login/Signup pages, no nested paths.

- **What shipped:** version 5 when two or more pages (`pages` on disk; no top-level root/nodes). One page still saves under versions 1–4. `หน้า` list in Layers + command palette (`หน้า`, `เพิ่มหน้า`). Add / rename / path / reorder / delete each undo; switch is not an undo step. Export: `index.html`+`styles.css`, per-other-page `<slug>.html`+`<slug>.css`, shared `assets/`; matching hrefs rewrite to relative files. Preview compiles the open page; link clicks still do nothing. Asset GC walks all pages' Image and Avatar `AssetRef`s.
- **Favicon note (intentional):** `meta.favicon` has no UI yet, so a favicon-only asset cannot exist. Whoever adds a favicon picker later must add `meta.favicon` to the asset GC keep-set (`image_ids` in `assets.rs`). No code change for favicon in this phase.
- **schema.ts / defaults.rs:** changed for `ProjectPage`, version 5, and dual-format serde / both version writers.
- **Left out:** Preview host-side navigation, auto-create companion pages, nested paths (spec open questions).


## 2026-10-05 — Avatar AssetRef save GC (confirmed + fixed)

Designer claim confirmed. `image_ids` / `gc_unreferenced` walked only `NodeProps::Image`. Avatar's `src: AssetRef` was ignored, so a save deleted that file. Before-fix: `gc_keeps_asset_referenced_only_by_avatar` failed. Fix: match Image and Avatar (same `src` field). Same collector feeds preview/export asset maps. `meta.favicon` still ignored. No schema/defaults change.

- Files: `src-tauri/src/assets.rs`, `src-tauri/src/commands.rs` (comment), `src-tauri/src/compiler_tests.rs` (restored `#[test]` on `width_queries_…` lost by an earlier insert).


## 2026-10-05 — Preview-only button press feedback

Fix B only. No schema/defaults change. No href field, no `<button>` tag, no `:hover`, no sandbox/CSP change.

- Preview CSS (when a button is present): `.t-button{cursor:pointer}.t-button:active{transform:translateY(1px)}`. Export CSS unchanged (byte-identical; `rich_sample_css_and_html` still passes).
- Files: `src-tauri/src/compiler.rs`, `src-tauri/src/compiler_tests.rs`.


## 2026-10-05 — Phase 7 Login and Signup (in progress)

User approved resume. Spec only. No Designer pass. `schema.ts`, `defaults.rs`, and the version writers were not edited. No new kind, package, or version. `bun run tauri dev` was left alone. No git repo.

- **What shipped:** `Pages` group in the Add menu and the command palette with English `Login` and `Signup`. Each insert is one container (not a section), one undo, focus on the heading. Login children: heading `Log in`, text `A short line`, Email/Password inputs, switch `Remember me`, button `Log in`, link `Sign up` → `/signup`. Signup children: heading `Sign up`, text `A short line`, Name/Email/Password inputs (placeholders `ชื่อ`, `อีเมล`, `พาสเวิร์ด`), switch `I agree`, button `Create account`, link `Log in` → `/login`. Existing version rule only: these trees save as version 3 (input + switch), or 4 only if a Phase 6b kind is also present.
- **What did not ship:** form, submit, API, database, Vite export, auth, validation, password type, new schema, Designer pass.
- **Files:** `src/lib/pages.ts` (new), `src/lib/node-actions.ts`, `src/components/editor/ElementPalette.tsx`, `src/components/editor/CommandPalette.tsx`.


# Handoff: paused mid Phase 3b (2026-09-25, ~12:15 ICT)

Paused at the user's request. The work below is in place in the working tree; the project has no git.

## Done
- **Phase 3a (accepted):** `src-tauri/src/compiler.rs` and `compile_preview`; Preview is a sandboxed `srcdoc` iframe; `PreviewStub` has been deleted.
- **GUI fixes 1–10 (accepted):** UnitField, ColorField, NumberField, a11y and currentColor borders.
- **Serde fix (one-time exception to the defaults.rs lock, approved):**
  - `defaults.rs` got explicit camelCase renames: `objectFit` (image) and `openInNewTab` (link). All other props and style structs were audited; those two were the only multi-word fields inside enum variants.
  - The raw-JSON workaround is removed. The `PropsExtras` overlay is gone from `compiler.rs`. `db.rs` and `commands.rs` go through the typed `PageDocument` again: `ProjectWithDocument.document` is a `PageDocument` and `save_project` takes a `PageDocument`.
  - Tests: `typed_roundtrip_is_lossless` (serialize(parse(json)) == json, numbers compared numerically because 16 comes back as 16.0), `open_in_new_tab_and_object_fit_are_typed`, and the db test `camel_case_variant_fields_survive_save_and_open`.
  - md5 of `src-tauri/src/defaults.rs`: **ed2db83cd76c6347655ad87127c70d11** (was 3b55189e…).
  - md5 of `src/schema.ts`: **ff932f14998ca9b2e461a0c989403089** (unchanged).
- **3b export (Rust side):**
  - `src-tauri/src/export.rs`: builds the zip in memory (`index.html` linking `styles.css`, `styles.css`, and `assets/` + `assets/.keep`), writes to a temp file and renames it, and appends `.zip` if missing. Images stay placeholders because there is no asset pipeline.
  - `compiler::compile_export` produces `(html, css)` for that.
  - `commands::export_project(projectId, destPath?, document?)`: uses the in-memory document when passed (the same thing Preview shows); otherwise loads the saved copy from SQLite.
  - Registered in `lib.rs`, along with `tauri_plugin_dialog::init()`.
  - Crates: `zip` 8.6 (`default-features=false`, `features=["deflate-flate2-zlib-rs"]`, so no zopfli) and `tauri-plugin-dialog` 2.
  - Capabilities: `dialog:allow-save` and `core:window:allow-destroy`. The second is needed because `onCloseRequested` closes the window via `destroy()`.
  - Tests: `export_tests.rs` (zip entries, the `styles.css` link, no CSP and real links in export, `.zip` path rules) and `rich_sample_css_and_html` (exact CSS and HTML for a rich doc). The fixture is `src-tauri/src/fixtures/rich_sample.json`.
- **3b frontend** (needs checking in `tauri dev`):
  - **Export:** a ส่งออก button in `EditorTopBar` with a spinner while it runs. `src/lib/export-project.ts` does the save dialog (default name is the sanitised project name + `.zip`); cancelling does nothing. It shows a success toast with the file name and a note when unsaved edits were included, or an error toast.
  - **Preview framing:** matches the canvas width (`max-w-3xl`). The iframe is `sandbox="allow-same-origin"` (no `allow-scripts`) and sets its own height from the content on load and on width change, with a 480 px minimum.
  - **Polish:** the px input gets focus after switching auto → px; the remaining ไม่ได้ตั้งค่า placeholders are now —.
  - **Docs:** `docs/DESIGN-PREVIEW-UX.md` marks Phase 3 preview as shipped and describes export.
- **2c defects:**
  1. Confirm-on-leave: **partly done.** `components/editor/UnsavedChangesDialog.tsx` (currently built on shadcn **dialog**) covers the back button, Tauri window close (`onCloseRequested`) and `beforeunload`. Still open:
     - history back/forward and project switching (see Left);
     - an in-app reload key intercept;
     - migrating it to alert-dialog.
  2. A save clears `histKey` (`saveOpenProject`): **done.**
  3. An opacity-slider drag that ends at its start value reverts the group, so no undo step and no dirty flag: **done** (`OpacityField`).
  4. The selection is stored with each history snapshot (`HistEntry {doc, sel}` in editor-store and `lib/history.ts`): **done.**
  5. Inline edits are trimmed; an empty edit shows a toast.info cue: **done** (`DesignCanvas` `commitEdit`).
  6. Ctrl+Z / Ctrl+Y call preventDefault only when undo()/redo() return true: **done.**
- **Stale-Preview check:**
  - The Vite dev server (pid 11327, from `bun run tauri dev` pid 11262, started 10:48:54, **not started by me**) serves the current `PreviewStage.tsx` (iframe plus `compile_preview`).
  - Nothing in `src` references `PreviewStub`, and there is no mock harness (no mockIPC or mocked invoke) in the repo.
  - Likely cause: that window's JS was loaded before the rewrite or HMR didn't apply. A reload or restart of `tauri dev` should fix it.
  - Note: `tauri dev` also rebuilds and restarts the Rust app whenever `src-tauri` changes. It restarted at 11:07 and 11:18, which also shows the Rust side compiled at that point.

## Left (refreshed 2026-10-06)
- **Done (was listed here):** sonner toasts (`src/lib/toast.ts` wraps `sonner`, `components/ui/sonner.tsx`); `UnsavedChangesDialog` on alert-dialog; `createBrowserRouter` + `useBlocker` in `EditorPage` (history back/forward, project switch); F5 / Ctrl+R intercept while dirty; `allowUnload` flag for intentional reload/close; overlay shortcut guard (`lib/modal.ts` `isOverlayOpen()` / `isEditableInOverlay()`, used by DesignCanvas).
- **Open:** nothing from this old list. Current open work is in the polish batch / Deferred sections at the top.
- Note: a browser/mock run still has no `__TAURI_INTERNALS__`, so no `onCloseRequested`; browsers ignore `beforeunload` without a prior gesture.

## Build and test status
- `bun run build` (tsc + vite) **passed** after all the frontend changes above.
- `cargo test`: **16 passed, 0 failed** before two tiny follow-ups: the fixture moved into `src/fixtures/` (the `include_str!` paths were updated with sed) and the capability JSON change. Neither was re-run because the machine kept dropping offline. Re-run `cargo test` and `cargo check` first thing.
- `cargo check` last showed 1 warning (`Node::is_locked` unused, in `defaults.rs`). `open_db_at` now has `#[allow(dead_code)]`.

## Watch
- `Cargo.toml` and `Cargo.lock` (zip, tauri-plugin-dialog), and `package.json` / `bun.lock` (`@tauri-apps/plugin-dialog`), are changed.
- DB rows saved before 3a's workaround had already lost `openInNewTab`; there's nothing to recover. New saves write f64 numbers as `16.0`, which is harmless for JS.
- Processes: I started no dev servers or watchers. The running `tauri dev` / Vite / app (pids 11262, 11265, 11322, 11325, 11327, and the app binary) were started by someone else and were left running.

**3b DONE (15:16)** — sonner, alert-dialog, useBlocker leave guard, F5/Ctrl+R, overlay shortcut guard; cargo check/test 16/16, bun run build pass.

## Pause 2026-09-25 (15:45) — UI refresh: S0, S1, route-split, S2, S2b done

- **Done:** S0 (tokens/fonts/scrollbars), S1 (shadcn primitives), route-split (lazy pages + lazy dialogs, idle preload), S2 (top bar h-11 + ToggleGroup ModeSwitch + 3-state save), S2b (preview device picker: `lib/devices.ts`, `stores/preview-device-store.ts`, `components/editor/preview/DeviceToolbar.tsx` + `DeviceStage.tsx`).
- **Build:** `bun run build` green, no chunk-size warning. No Rust changes this session (cargo last green: check OK, test 16/16).
- **Initial-load JS:** 580.99 kB / 182.44 kB gz (one chunk, warning) → **353.65 kB / 111.35 kB gz** (entry 106.95 + modulepreload jsx-runtime 4.40). Total JS 645.69 kB / 205.58 kB gz over 11 chunks.
- **Locked files unchanged:** schema.ts ff932f14998ca9b2e461a0c989403089, defaults.rs ed2db83cd76c6347655ad87127c70d11.
- **Unfinished / deferred:** Designer GUI pass for S0–S2b; §9 fidelity-limits tooltip and optional thin-scrollbar injection for handheld frames (PM call); Pixel Fold preset kept hidden; not verified live in `tauri dev` by the executor.
- **Next step: S3 (resizable panes) on Monday.**

## Monday 2026-09-28 — first items: Designer 3b defects D1–D4

- [x] **D1** Preview full-area (fill): no max-w cap; fix the 100vh-hero height feedback loop (13,458px, double scroll) — measure with the frame at stage height + `html{height:auto}`, re-measure on stage width change, few px slack (was 16px short). Device frames and no-recompile on device switch must still hold.
- [x] **D2** (medium) DesignCanvas undo guard: when an overlay is open, preventDefault Ctrl/Cmd+Z / Y / Shift+Z unless the target is an editable field inside the overlay (native undo must not revert a NumberField edit behind a dialog).
- [x] **D3** (low) Alert dialogs return focus on close (onCloseAutoFocus → trigger, else canvas); compatible with lazy mount-on-first-open.
- [x] **D4** (minor) sonner Toaster `containerAriaLabel` in Thai ("การแจ้งเตือน").
- Baseline before fixes: cargo check OK, cargo test 16/16, bun run build green; initial-load JS 111.35 kB gz.
- Fixed 2026-09-28 (see executor report); build green, awaiting Designer GUI pass.

## 2026-09-28 (late morning) — S3 resizable panes done

- **Done:** S3 — `components/editor/EditorPanes.tsx` (new; react-resizable-panels v4 group: layers 200–360 px default 224, collapsible, bound to the top-bar layers toggle; canvas min 360 px; style 256–420 px default 288), `EditorPage.tsx` (design branch uses it), `LayersPanel`/`StylePanel` outer aside fills its pane. Widths persist in `localStorage["wb.editor.layout.v1"]` as px; double-click a handle resets that pane; handles are keyboard-resizable, aria-label "ปรับขนาดแผง".
- **Build:** green, no chunk warning; initial-load JS 111.42 kB gz (unchanged); react-resizable-panels only in the lazy EditorPage chunk. No Rust changes.
- **Not done:** S4 was deliberately not paired (medium–high risk slice; wants its own GUI pass).
- **Next step: S4 (Style panel fields) — consider splitting S4a (toggle-group, switch, sizes) / S4b (select, slider) / S4c (color popover).**

## 2026-09-28 — S4a (Style panel: toggle groups, switch, sizes) done

- **Done:** SegmentedField → Radix ToggleGroup (one Tab stop, arrows move focus only, active-click and arrows never write; icon items keep Thai aria-label + Tooltip); BoxSpacing link → Toggle (view-only, aria-pressed); เปิดแท็บใหม่ → Switch `id="pf-newtab"` (label htmlFor still names it; one write per real change); field reset gets a Tooltip; controls h-7, FieldRow min-h-7, rows space-y-2, section header rows h-8 with 14 px chevrons, sections py-2. No history/undo code touched.
- **Build:** green, no chunk warning; initial-load JS 111.42 kB gz (unchanged); new code only in the lazy EditorPage chunk. No Rust changes.
- **Next step: S4b (SelectField + UnitField unit → Radix Select with sentinels; OpacityField → Slider with history group on pointer-down / commit), then S4c (ColorField popover + swatch tooltips).**

## 2026-09-28 — S4b (Style panel: Radix Select + opacity Slider) done

- **Done:** SelectField (font, weight) → Radix Select; "" option values map to an internal sentinel so callers keep their semantics; font items render in their own family; custom font item stays disabled with its title. UnitField unit picker → the same Select (`aria-label="หน่วย: …"`, 60 px); choosing px from auto keeps focus on the px input. OpacityField → Radix Slider: one undo step per pointer drag (group opens on pointer-down, rAF-coalesced live writes, closes on release/cancel/lost capture), a drag released at its start value or a click without change is reverted (no undo entry, not dirty), keyboard steps write once per key and coalesce by field key; the thumb follows a local draft. `lib/modal.ts` isOverlayOpen now also matches an open Select (item-aligned, no popper wrapper), so canvas shortcuts and native undo are blocked while it's open.
- **Build:** green, no chunk warning; initial-load JS 111.42 kB gz (unchanged); total JS 221.83 → 225.22 kB gz (lazy chunks only). No Rust changes. Headless tests (real CDP pointer/keys) passed for slider grouping and Select Esc/arrows/re-pick/sentinel.
- **Next step: S4c (ColorField popover + swatch tooltips).**

## 2026-09-28 — S4c (ColorField popover + swatch tooltips) done — S4 complete

- **Done:** ColorField swatch chip → PopoverTrigger (22 px, checker when transparent/unparseable, `aria-label="เลือกสี: …"`); inline hex input stays in the row. Popover (`w-56`, align start): **สีสำเร็จรูป** grid (roving tabindex kept; Thai names in Tooltip + aria-label, e.g. "สีพื้นหลัง: ฟ้า (#0ea5e9)"), hex input (same validation/Thai error/aria-describedby; first Esc reverts the draft and keeps it open, next Esc closes), **เลือกจากระบบ…** (opens the native picker, which lives in the row so closing the popover can't drop its events) and **โปร่งใส** Toggle for background only. Native-picker session = one undo step (history group, reverted if it ends on the start color). No new dependency. Preset footer moved into the popover (spec default; PM may ask to keep it inline).
- **Locked-node regression (S4a/b/c):** headless test on locked button + link: every control disabled (12 number, 4 Select, 5 toggle-group items, slider, Switch, colour chips, hex inputs), 0 reset buttons, banner shown, clicks/keys/drags write nothing.
- **Build:** green, no chunk warning; initial-load JS 111.42 kB gz (unchanged); total JS 225.22 → 227.17 kB gz. No Rust changes.
- **Next step: S5 (Layers + palette polish).**

## 2026-09-28 — S5 (Layers + palette polish) done

- **Done:** layer rows h-7 / 13 px, 14 px icons, CSS depth guides, selected inset bar (`--sidebar-primary`), locked rows opacity-60 + Lock icon (+ sr-only "(ล็อก)"), `outline-2` focus ring. Per-row ContextMenu: right-click selects first; **แก้ไขข้อความ** (Enter) · **เลื่อนขึ้น** · **เลื่อนลง** · **ลบ** (Delete), disabled where the doc-op would refuse (root/locked/edge). Menu key / Shift+F10 open it at the row; focus returns to the selected row after every action. Delete/move/edit live in new `lib/node-actions.ts`; the canvas Delete key uses the same `deleteNodeAction` (same fallback + focus restore). Palette tiles: Tooltip (name + **คลิกเพื่อแทรก · ลากไปวางบนผืนผ้าใบ**), closes on pointerdown; disabled tiles keep `title`. Empty layers → compact `Empty`. Palette caption row h-10 = Style header (aligned).
- **Not done (by design):** optional roving tabindex in layers (needs PM approval, §7 #12); duplicate/hide/lock menu items (no doc-ops).
- **Build:** green, no chunk warning; initial-load JS 111.41 kB gz; total JS 227.17 → 229.52 kB gz. No Rust changes. S6 not paired (S5 was medium; kept separate for the GUI pass).
- **Next step: S6 (Project list).**

## 2026-09-28 — Designer combined-pass fix batch (items 2–9) done

- Designer pass: 3b PASS; S0–S1, S2, S2b PASS_WITH_GAPS (all low). Fixed: (2) ToggleGroup root focus → checked item (shared `ui/toggle-group.tsx`: ModeSwitch, zoom, SegmentedField); (3) compact top bar keeps the zoom % readout; (4) Preview title span: aria-label removed; (5) `lib/lazy.ts` renders the resolved component directly (no Suspense reveal throttle; preloaded dialog first open 309 → 7 ms headless) — dialogs and pages; (6) palette tiles use the shadcn focus-visible ring; (7) PreviewStage compile deduped by document object (StrictMode: 1 call on entering Preview; edits still recompile; retry forces); (8) unit Select 68 px ("auto" fits); (9) PM-approved roving tabindex in layers: one Tab stop (selected row, else first), ↑/↓ tree order, Home/End, ← parent (no collapse), focus follows selection (Esc/undo/menu), Delete lands on the next row. Unsaved dialog initial focus unchanged (ยกเลิก).
- **Build:** green, no chunk warning; initial-load JS 111.45 kB gz (+0.04, the lazy.ts direct-render wrapper lives in the entry). No Rust changes.

## 2026-09-29 — S6 (Project list) done

- **Confirmed on disk first:** fix-batch items 2–9 are present (ToggleGroup root onFocus, lazy.ts direct render, PreviewStage lastDoc dedupe, unit Select 68 px, layers roving tabindex). Nothing missing.
- **Done:** header h-14 with a small app mark + **Web Builder** + primary **สร้างโปรเจกต์** (Plus). ProjectCard → Card: muted aspect-video placeholder, name text-sm font-medium, relative time text-xs; the full-card open button and the **เปิด / ลบ** menu stay sibling controls (no nested buttons). First load (`loading && projects.length === 0`) shows 6 Skeleton cards only after 150 ms. Empty state → Empty (same copy, FolderOpen), only when `!loading && projects.length === 0`. Error banner → Alert variant="destructive". NewProjectDialog label → Label. DeleteProjectDialog was already an AlertDialog; **ลบ** is now a plain destructive Button so the dialog stays open while busy (Cancel keeps initial focus; overlay click does not close; focus returns to the card's menu button, or to **สร้างโปรเจกต์** when the card is gone).
- **Build:** green, no chunk warning; initial-load JS 111.45 → 111.44 kB gz; total JS 229.93 → 231.39 kB gz, all in the lazy ProjectListPage chunk. No Rust changes.
- **Next step: S7 (Toasts + dialogs).** Not started.

## 2026-09-29 — S7 (toasts + dialogs) applied

- Machine was unreachable when S7 was first built. Sources still matched S6; patch applied atomically. Build green, no chunk warning. Initial-load JS 111.44 → 111.46 kB gz. Total JS 231.39 → 231.54 kB gz. No Rust.
- `lib/toast.ts`: success/info 4 s, error 7 s. Manual save failure toasts **บันทึกไม่สำเร็จ** (success does not). Leave-failure keeps the longer toast. Toaster: bottom-right, 3 visible, close button **ปิดการแจ้งเตือน**, theme still light (S8).
- UnsavedChangesDialog: plain Buttons, stays open while saving, **บันทึก** focused. Delete **ลบ** and the D2 undo guard were already done and were not touched. Pane layout not touched.
- Checksums: schema.ts ff932f14998ca9b2e461a0c989403089, defaults.rs ed2db83cd76c6347655ad87127c70d11.
- **Next was S8.** Not started. A fix batch landed instead (see below).

## 2026-09-29 — fix batch after S7 (S8 not started)

S8 was built on the box earlier and never copied here. Those edits were reverted; this tree is S7 plus the six fixes below. No `cmdk`, no theme module, no command palette.

- **1. Pane widths** (`EditorPanes.tsx`). Saved only on pointerup, keyup and double-click, from the panel DOM width. Not on window reflow, not while the layers pane is collapsed, not while a toggle is expanding it back. Headless check: storage stayed `304/300` when the group was squeezed (DOM became 196/353/251); ArrowRight wrote the new DOM width (304 → 359), not the previous one.
- **2. Segmented Enter** (`SegmentedField.tsx`). Enter on the focused item selects it. Radix still selects on Space via `onValueChange`. Headless: Enter on **บี** changed the value.
- **3. Opacity drag** (`OpacityField.tsx`, `nodeId` from `StylePanel.tsx`). During a pointer drag the canvas node gets a preview `style.opacity` only. pointerup writes the document once (one undo step). A drag that ends where it started does not write, so it does not dirty. Keyboard steps still commit per key.
- **4. NodeView** (`node-view.tsx`). Wrapped in `memo`. The inline-edit Escape handler was not changed.
- **5. Empty layers** (`LayersPanel.tsx`). **ไม่มีเลเยอร์** when the page root has no children. The page row still shows (a valid page always has it).
- **6. เปิดแท็บใหม่** (`switch.tsx` size `lg`, used only there). Track is 28px tall (`h-7`) and 40px wide, thumb 20px, in the existing `min-h-7` row.
- Colour presets stay in the popover. Pane layout keys and running processes were not touched.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.46 kB gz (entry `index-5hWhHyRS.js` 107.06 + `jsx-runtime` 4.40). Total JS 231.54 → 231.99 kB gz (editor chunk). No Rust.
- Checksums: schema.ts ff932f14998ca9b2e461a0c989403089, defaults.rs ed2db83cd76c6347655ad87127c70d11.
- **Stopped.** S8 not started.

## 2026-09-29 — fix batch items 7–9

S8 still not started.

- **7. Failed project list** (`ProjectListPage.tsx`). Empty state requires `!error` as well as `projects.length === 0 && !loading`. A failed `list_projects` keeps the red alert only. No retry button (ปิด stays). Headless: alert text present, **ยังไม่มีโปรเจกต์** absent, no ลองใหม่.
- **8. Blank project name** (`NewProjectDialog.tsx`). `name.trim()` empty marks the input `aria-invalid`, shows **กรุณาใส่ชื่อโปรเจกต์** (`text-[11px] text-destructive`, same pattern as the color error), and does not create. No fallback to **หน้าใหม่**. Headless: spaces → invalid + that message, create not called.
- **9. Unsaved dialog focus** (`UnsavedChangesDialog.tsx`). Initial focus is **ยกเลิก** again. Still plain buttons, stays open while saving, Esc / ยกเลิก cancel, overlay does not close. Headless: focused element text was ยกเลิก.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.46 kB gz (entry `index-eJOmmzGN.js` 107.06 + `jsx-runtime` 4.40). Total JS 231.99 → 232.15 kB gz (new-project dialog chunk). No Rust. Pane layout and running processes not touched.
- Checksums: schema.ts ff932f14998ca9b2e461a0c989403089, defaults.rs ed2db83cd76c6347655ad87127c70d11.
- **Stopped.** S8 not started.

## 2026-09-29 — S8 (command palette + dark mode) — last UI-refresh slice

Fix batch 1–9 is unchanged (pane persist, segmented Enter, opacity preview, memo NodeView, empty layers, switch `lg`, list `!error`, blank names, unsaved focus on **ยกเลิก**).

- **Palette** (`CommandPalette.tsx`, opened from `EditorPage.tsx` on Ctrl/Cmd+K only, not preloaded). Groups: **คำสั่ง** (บันทึก, ส่งออก, สลับโหมด, กลับไปรายการโปรเจกต์, เลิกทำ, ทำซ้ำ), **เพิ่มองค์ประกอบ** (same insert as the palette), **เลเยอร์** (display name, select on Enter), **มุมมอง** (แผงเลเยอร์, ธีม: ตามระบบ / สว่าง / มืด). English keywords. Kbd on เลิกทำ (Ctrl Z) and ทำซ้ำ (Ctrl Shift Z). No invented Ctrl+S. Placeholder **ค้นหาคำสั่งหรือเลเยอร์…**, empty **ไม่พบคำสั่ง**. Ignored while inline-editing and while a dialog/menu is open. Close restores focus. Not on the project list. Headless: groups and placeholder correct; **ธีม: มืด** set `wb.theme=dark`, added `.dark`, closed the palette, and did not hang; **สว่าง** cleared the class; Ctrl+K on the project list did nothing.
- **Dark mode** (`lib/theme.ts`, `main.tsx`, `App.tsx`, `index.html`, `index.css`, `DesignCanvas.tsx`, `sonner.tsx`). `localStorage["wb.theme"]` is `system | light | dark` (default system). `.dark` is toggled on `<html>`. System mode follows `prefers-color-scheme` and, in Tauri, `onThemeChanged` (dynamic import, not modulepreloaded). No-flash script in `index.html`. Page card has `.theme-light` so the canvas stays light. Toaster `theme` is the resolved light/dark value. `setTheme()` was not called (capability not added; spec says skip). No theme control on the project list.
- **Menubar not included.** The spec marks it a PM call (~28 px on a top bar already tight at 960 px). The palette already exposes the same actions.
- **Build:** green, no chunk-size warning. Initial-load JS 111.46 → 111.99 kB gz (entry `index-DrvTQnwZ.js` 107.59 + `jsx-runtime` 4.40). The +0.53 kB is the theme module in the entry, not cmdk. cmdk is `CommandPalette-NHrsegK1.js` 6.14 kB gz, loaded on first Ctrl/Cmd+K, not in the entry and not modulepreloaded. Tauri-only `window-*.js` is 3.46 kB gz and is not modulepreloaded. Total JS 232.15 → 240.03 kB gz. No Rust.
- Checksums: schema.ts ff932f14998ca9b2e461a0c989403089, defaults.rs ed2db83cd76c6347655ad87127c70d11.
- **S8 is the last UI-refresh slice.** Stopped.

## 2026-09-29 — Designer fail fixes (save-and-leave, dismissed list)

S8 stays the last UI-refresh slice. No Phase 4. No menubar. NodeView memo not touched.

- **1. Failed save-and-leave** (`EditorPage.tsx` `saveAndLeave`). Failure no longer calls `stay()` (that cleared `leaveIntent` and `blocker.reset()`, which closed the dialog). On failure: `leaveSaving` is cleared, `leaveIntent` stays, toast **บันทึกไม่สำเร็จ — ยังไม่ได้ออกจากหน้านี้**, page does not change, unsaved dialog stays open. Success still leaves. Cancel still uses `stay()`. Initial focus stays **ยกเลิก**. Manual-save toast stays the short **บันทึกไม่สำเร็จ**. Headless: focus was ยกเลิก; after บันทึก the dialog stayed open on `/editor/p1` and the longer toast was shown.
- **2. Dismissed list failure** (`projects-store.ts` `projectsStatus` idle | ready | failed; `ProjectListPage.tsx`). A failed `list_projects` sets `failed` and does not clear `projects`. While `error` is set, only the red alert shows (ปิด stays; no empty state, no retry). `clearError` still only nulls `error`. After ปิด, if the list never loaded (`failed` and empty), an outline **ลองใหม่** calls `refreshProjects()`. **ยังไม่มีโปรเจกต์** only after a successful list (`ready`). This replaces the earlier "no retry button" decision only for the dismissed-error state. Headless: failing list showed the alert only; after ปิด, ลองใหม่ and not the empty state; a later success with `[]` showed **ยังไม่มีโปรเจกต์**.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.99 kB gz (entry `index-BDYX6oU7.js` 107.59 + `jsx-runtime` 4.40). Total JS 240.03 → 240.12 kB gz. No Rust. Running processes not touched.
- Checksums: schema.ts ff932f14998ca9b2e461a0c989403089, defaults.rs ed2db83cd76c6347655ad87127c70d11.
- **Stopped.**

## 2026-09-29 — Visible search + theme toggle (editor and project list)

No Phase 4. No menubar. NodeView memo, failed save-and-leave, and the dismissed-list ลองใหม่ state were not changed. No native `setTheme`.

- **Search, editor** (`EditorTopBar.tsx`, `EditorPage.tsx`, `CommandPalette.tsx`). A real text field, placeholder **ค้นหา…**, aria-label **ค้นหาคำสั่ง**. Focus (click or Tab) or typing opens the existing command palette the same lazy way as Ctrl/Cmd+K (`lazyNamed`, not preloaded). The field does not import cmdk or CommandPalette. Text typed before the chunk loads is the palette query (`value` / `onValueChange`). Closing clears the field and does not reopen it. Ctrl/Cmd+K still works.
- **Search, project list** (`ProjectListPage.tsx`). Placeholder **ค้นหาโปรเจกต์…**. Filters the loaded projects by name (trim, case-insensitive). Does not refetch and does not import the palette. An empty filter shows the current list. No match shows **ไม่พบโปรเจกต์ที่ค้นหา**, not **ยังไม่มีโปรเจกต์** (that stays only for a successful load of zero projects). A failed list still shows only the alert, then **ลองใหม่** after ปิด.
- **Theme** (`ThemeToggle.tsx`, both headers). Icon button + menu **ตามระบบ / สว่าง / มืด** on the existing `wb.theme` store (`localStorage["wb.theme"]`, `.dark` on `<html>`). No second store. Canvas page card stays `.theme-light`.
- **960px bar.** Editor header stays one row (43px) in design and preview. At 960 preview the last control ends inside the bar (บันทึกแล้ว right edge 952). List header stays one row (55px).
- **Build:** green, no chunk-size warning. Initial-load JS 111.99 → 111.97 kB gz (entry `index-C8ya8-sC.js` 107.57 + `jsx-runtime` 4.40). cmdk is only in `CommandPalette-JTqlwCdO.js` (6.15 kB gz), not the entry, not `ProjectListPage`, not modulepreloaded. Search UI is in `EditorPage-_7-5mRNS.js` and `ProjectListPage-BLZA4xCN.js`. The theme control is in the shared `empty-T7b4hsgU.js` chunk (dropdown menu + toggle, 46.79 kB gz), loaded with either page, not in the entry. Total JS 240.03 → 240.94 kB gz. No Rust. Running processes not touched.
- Checksums: schema.ts ff932f14998ca9b2e461a0c989403089, defaults.rs ed2db83cd76c6347655ad87127c70d11.
- **Stopped.**

## 2026-09-29 — P4-S1 Templates, no schema change

Phase 4 started at P4-S1 only. P4-S2 and later were not started. No menubar. Search, theme toggle, failed save-and-leave, and the dismissed-list ลองใหม่ state were not changed. No icon, shadow, or hover. Device presets and the desktop-only design canvas were not changed.

- **What it is:** five insert-only section templates (`แนะนำ`, `ข้อความและรูป`, `ชวนทำ`, `จุดเด่น`, `ท้ายหน้า`) in `src/lib/templates.ts`. Each tree is ordinary palette nodes (4, 7, 4, 12, and 6). One `updateOpenDocument` so Ctrl+Z removes the whole tree. Inserts at the end of the page, or just after the page-level section that contains the selection. Focuses the first heading (ท้ายหน้า has none, so the `© 2026` text).
- **Picker:** command-palette group **เทมเพลต** (name + one-line description), and one full-width `h-7` **เทมเพลต** row under the add grid. Palette tiles stay `h-12`. Empty layers still say **ไม่มีเลเยอร์**, with **แนะนำ** as an extra action.
- **Schema decision:** no breakpoint override is saved, so `version` stays `1`. `schema.ts` unchanged `ff932f14998ca9b2e461a0c989403089`. `defaults.rs` unchanged `ed2db83cd76c6347655ad87127c70d11` (P4-S1 does not require a Rust change).
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-D-RNI05L.js` 107.57 + `jsx-runtime` 4.40). Template code is in the EditorPage chunk, not the entry. Total JS 240.94 → 242.39 kB gz. `cargo test` 16 passed, 0 failed. `cargo check` ok (existing unused `is_locked` warning only).
- **Next slice: P4-S2 Optional breakpoint map only.** Not started.

## 2026-09-29 — P4-S2 Optional breakpoint map only

P4-S3 and later were not started. Templates, search, theme, the failed-leave dialog, and list ลองใหม่ were not changed. No icon, shadow, or hover. Device presets and the desktop design canvas were not changed. No style-panel control (that is P4-S3) and no media queries (P4-S4).

- **What it does:** a node may carry optional `styleBreakpoints` with `tablet`, `phone`, and `foldOpen`, each a partial of today's `StyleProps`. Empty objects are omitted. A phone override does not change the base `style`. Save writes `version` 2 only when some node has a real override; otherwise the save stays `version` 1 and the map is not written. Open does not rewrite the file or bump the version.
- **Schema:** `schema.ts` `ff932f14998ca9b2e461a0c989403089` → `d15b74576a70074c3238281ec9e862e1`. Added `DocumentVersion` `1 | 2`, and on `Node` the optional `styleBreakpoints?: { tablet?: StyleProps; phone?: StyleProps; foldOpen?: StyleProps }`. No other fields.
- **Rust:** required so save/open keep the new shape. `defaults.rs` `ed2db83cd76c6347655ad87127c70d11` → `17348c039cf8e2e10d395e2f50c9311f` (optional `styleBreakpoints`, skip when empty). `db.rs` md5 `525142f8355ebde387dc8f047de21921` calls that on save and sets version 1 or 2. New test `breakpoint_override_save_bumps_version_and_reloads` passed.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-909l9UTS.js` 107.57 + `jsx-runtime` 4.40). `styleBreakpoints` is not in the entry and not modulepreloaded. Total JS 242.39 → 242.57 kB gz. `cargo test` 17 passed, 0 failed. `cargo check` ok (existing unused `is_locked` warning only).
- **Next slice: P4-S3 Style panel control.** Not started.

## 2026-09-29 — P4-S3 Style panel control

P4-S4 and later were not started. Schema was not extended. Templates, search, theme, the failed-leave dialog, and list ลองใหม่ were not changed. No icon, shadow, or hover. Device presets were not changed. No media queries. Rust was not touched (`cargo test` / `cargo check` not run).

- **What the control does:** one row at the top of the style panel, `h-7`, `text-[11px]`, labels **เดสก์ท็อป / แท็บเล็ต / โทรศัพท์ / จอพับ** (`id` `sf-breakpoint`, name **จุดพักสไตล์**). Same `SegmentedField` pattern: one tab stop, arrows move focus and do not write, Space/Enter select. The choice is local view state. It does not call `setPreset` and does not write the document. Desktop edits still write base `style`. Tablet, phone, and fold-open write only keys that differ from the desktop base into `styleBreakpoints`. A control with no override shows the base value and stores nothing. A stored key gets the existing dot. Its reset says **ใช้ค่าหลัก** and clears that one key. Desktop reset stays **คืนค่าเริ่มต้น**. Locked nodes disable the segment and the fields. One `updateOpenDocument` per real change. A no-op does not dirty. In-memory `version` stays 1 until save; save still bumps to 2 only when a real override exists.
- **Canvas:** `resolvedStyle` is still base style only. Changing the segment or editing a phone/tablet override does not turn the design canvas into a device frame. A breakpoint opacity drag does not paint onto the canvas node.
- **Hint:** a read-only `text-[11px]` line names which width rules the current preview frame matches. It does not switch the device. Fill says it follows stage width. Multi says each frame uses its own width. The 750px fold-open frame is called out as tablet rules, because this preview does not match `horizontal-viewport-segments`.
- **Files:** `src/components/editor/StylePanel.tsx`, `src/components/editor/style/write.ts`, `src/components/editor/style/FieldRow.tsx`, `src/components/editor/style/SegmentedField.tsx`, `src/components/editor/style/OpacityField.tsx`, `src/lib/document-ops.ts` (`setNodeBreakpointStyle`, `breakpointKeySet`).
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-Ddv-n2QC.js` 107.57 + `jsx-runtime` 4.40). The new strings (**จอพับ**, **ใช้ค่าหลัก**, **จุดพักสไตล์**, `styleBreakpoints`) are in `EditorPage-CsLQpi1w.js` (63.64 kB gz), not the entry and not modulepreloaded. Total JS 242.57 → 243.65 kB gz.
- **Checksums:** schema.ts unchanged `d15b74576a70074c3238281ec9e862e1`. defaults.rs unchanged `17348c039cf8e2e10d395e2f50c9311f`. db.rs unchanged `525142f8355ebde387dc8f047de21921`. document-ops.ts `2ed0b7b238cc9aa12ed04d8e0a0f1cea` → `b317675c6ae7cff7450f06aeafa71c97`. StylePanel.tsx `bae259da9ac501b1be30d8b95fa7ffa0` → `3676f7ba586e45808b58c8452da9855e`. write.ts `712d53a367fc6f5099519dd2175818f2` → `cd675704fa6839cc7f9fa8324da8fbe3`. FieldRow.tsx `7a41d601772a301bc2cbe3747f66d4de` → `90822b6e176c1807ad96c82929738005`. SegmentedField.tsx `9d8539ee055132b0d2b3171aa540473e` → `d8cf37c65ad854f992d01b42774fffbe`. OpacityField.tsx `dfde20b6cabffea046e1d2dbdfdccc9a` → `11516bb2d58dd22aa9acd77d41363f35`.
- **Next slice: P4-S4 Compiler queries.** Not started.

## 2026-09-29 — Template focus leftover, then P4-S4 Compiler queries

P4-S5 and P4-S6 were not started. No icon, shadow, or hover. Device presets were not changed. The design canvas still uses the base style only. Schema was not extended. Templates, search, theme, the failed-leave dialog, and list ลองใหม่ were not changed.

### Focus after template insert

- **What changed:** `insertTemplate` still selects the same node (first heading, or the copyright line for ท้ายหน้า). It now also sets `focusLayerId` to that id. `LayersPanel` runs `focusInsertedLayer` (`src/lib/layer-focus.ts`) until that row holds keyboard focus. The palette menu, the command palette, and the empty-page **แนะนำ** button all call `insertTemplate`, so all three get it. A menu's close-restore can steal focus after insert; the loop waits until the overlay is gone and the row stays focused for a second frame, then clears `focusLayerId`. Selection is not changed if the user moves it first.
- **Files:** `src/lib/node-actions.ts`, `src/lib/layer-focus.ts` (new), `src/components/editor/LayersPanel.tsx`, `src/stores/editor-store.ts`.
- **Check:** headless (happy-dom), not a click-through of the three buttons. Inserted `แนะนำ` while a menu overlay was open: `focusLayerId` equalled the selected heading and the row was not focused yet. After the menu closed and focus was restored to another button, the selected layer row became `document.activeElement` and `focusLayerId` went back to null. Selection stayed that heading.
- **Checksums:** node-actions.ts `d5914033ff25b12c65470e61e2576a47` → `a80ab8c77831ff87bfaadd35cb2f8a5c`. layer-focus.ts new `a493434c5b25a0d925fd561c150476d6`. LayersPanel.tsx `141c92ad2f72491b79eb2d718812e74c` → `44e654d0630fac3494923571f6c4276b`. editor-store.ts `83f1d58d1420081ab1275f047cfa83d2` → `7222cbcd1eec988086981847361f6671`.

### P4-S4 Compiler queries

- **What is emitted:** base rules stay where they are (no query). Then one `@media (max-width:1024px)` for every non-empty tablet override, then one `@media (max-width:767px)` for every non-empty phone override. Each rule uses the same `nN` class as the base. Only the keys stored on that breakpoint are emitted. An empty `{}` emits nothing and does not add a class. A document with no overrides compiles with no `@media`. Phone does not copy tablet keys. Under 767px both queries match and phone wins because it is last. Preview and export both use this CSS. A preview device switch still does not compile (unchanged: `PreviewStage` compiles by document, framing is separate).
- **Not emitted:** `foldOpen` / `horizontal-viewport-segments` (P4-S5). A stored fold-open override is ignored by the compiler in this slice.
- **Files:** `src-tauri/src/compiler.rs`, `src-tauri/src/compiler_tests.rs`.
- **Checksums:** schema.ts unchanged `d15b74576a70074c3238281ec9e862e1`. defaults.rs unchanged `17348c039cf8e2e10d395e2f50c9311f`. db.rs unchanged `525142f8355ebde387dc8f047de21921`. compiler.rs `e6dc507268915e731a2c9efec4fb183b`. compiler_tests.rs `ed5746195d67a11d8daa6818ce5280d2`.
- **cargo test:** 19 passed, 0 failed (was 17; two new compiler tests). **cargo check** ok. Existing unused `is_locked` warning only.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-CGuGD-Lu.js` 107.57 + `jsx-runtime` 4.40). Focus code is in `EditorPage-CqtXE_oV.js` (63.81 kB gz), not the entry. Total JS 243.65 → 243.84 kB gz. The compiler is Rust, so it is not in the JS chunks.
- **Next slice: P4-S5 Fold-open.** Not started.
\n
## 2026-09-29 — P4-S5 Fold-open

P4-S6 was not started. No icon, shadow, or hover. Device presets and the hinge overlay were not changed. The design canvas still uses the base style only. Schema was not extended. Tablet and phone queries are unchanged: one `@media (max-width:1024px)`, then one `@media (max-width:767px)`, stored keys only, nothing when empty, phone does not copy tablet. Preview and export still share `build`. A device switch still does not compile.

- **What fold-open emits:** after the phone query, one `@media (horizontal-viewport-segments: 2)` containing only the stored `foldOpen` keys, on the same `nN` class. It is not a width query and does not copy tablet or phone. An empty `foldOpen` emits nothing and adds no class. A fold-only override adds no `max-width` query. A 750px frame without viewport segments still matches the tablet query (1024) and does not match this one. No second mechanism was added to force the preview iframe to match the segments query.
- **Files:** `src-tauri/src/compiler.rs`, `src-tauri/src/compiler_tests.rs`.
- **Checksums:** schema.ts unchanged `d15b74576a70074c3238281ec9e862e1`. defaults.rs unchanged `17348c039cf8e2e10d395e2f50c9311f`. db.rs unchanged `525142f8355ebde387dc8f047de21921`. compiler.rs `e6dc507268915e731a2c9efec4fb183b` → `ba065410d711d16be36d4f2ebd203f2b`. compiler_tests.rs `ed5746195d67a11d8daa6818ce5280d2` → `3b5db56fee841bfb054a32f57803d94a`.
- **cargo test:** 20 passed, 0 failed (was 19). **cargo check** ok. Existing unused `is_locked` warning only.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-CGuGD-Lu.js` 107.57 + `jsx-runtime` 4.40). No frontend files changed, so the chunks are the same. Total JS stays 243.84 kB gz.
- **Next slice: P4-S6 Deferred icons, shadow, and hover.** Not started unless asked.

## 2026-09-29 — P4-S6 Deferred icons, shadow, and hover

The user asked for this slice. The spec titles it deferred and does not specify a field, a control, or CSS. Section 1 calls icon, shadow, and hover proposals for later, and says not to invent them on templates or inside `styleBreakpoints`. The slice bullets only name the gap: no icon node or property, no shadow key, no hover map. Two icon shapes are offered ("a feature item" or "a new node kind") with no choice. Nothing was added.

- **Shipped:** nothing. No schema field, no panel control, no compiler output.
- **Stays deferred:** optional icon, optional shadow string, optional button hover map (first key a hover color).
- **Files:** `docs/HANDOFF-PAUSE.md` only.
- **Checksums:** schema.ts unchanged `d15b74576a70074c3238281ec9e862e1`. defaults.rs unchanged `17348c039cf8e2e10d395e2f50c9311f`. db.rs unchanged `525142f8355ebde387dc8f047de21921`. compiler.rs unchanged `ba065410d711d16be36d4f2ebd203f2b`.
- **cargo test:** not re-run. Last count is 20 passed. Rust was not touched.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-CGuGD-Lu.js` 107.57 + `jsx-runtime` 4.40). Chunks are unchanged. Total JS stays 243.84 kB gz.
- **Phase 4 is complete.** S1 templates, S2 breakpoint map, S3 style-panel control, S4 width queries, S5 fold-open query, S6 left deferred. Nothing else is listed in section 4.

## 2026-09-29 — Palette focus, phone cutoff 719px

No icon, shadow, or hover. schema.ts and defaults.rs were not edited. Device presets unchanged. The design canvas stays desktop-only. The demo seed button **เพิ่มตัวอย่างเนื้อหา** was not changed. Fold-open is still `@media (horizontal-viewport-segments: 2)` after the width queries, stored keys only. The preview iframe was not given a fake segments match. No git repo.

- **Command palette focus.** Root cause: Ctrl/Cmd+K has no dialog trigger, so `useRestoreFocus` sends focus back to the canvas. That restore is a `setTimeout` inside Radix focus-scope unmount, which runs after `focusInsertedLayer` has already focused the new heading row and then stopped. The เทมเพลต menu and the empty-page **แนะนำ** button do not use that dialog restore, so they already stayed on the row. Fix is only on a successful template insert from `CommandPalette`: `onCloseAutoFocus` prevents the canvas restore. Other palette commands still restore as before. `insertTemplate` / `focusLayerId` are unchanged.
- **Phone query.** Designer set the cutoff to 719px in `docs/PHASE-4-SPEC.md` so the 750px fold-open frame stays on the tablet query (`max-width: 1024px`) and the folded 412px frame still matches phone. Compiler emit, comments, tests, and the style-panel width hint now use 719. Tablet stays 1024.
- **Files:** `src/components/editor/CommandPalette.tsx` `779afb3eaeddfa4e85e661327a20c97d` → `17082833c67881d61deece65ec856897`. `src/components/editor/StylePanel.tsx` `3676f7ba586e45808b58c8452da9855e` → `254fbbcf5350956bc07097fb06b79b3c`. `src-tauri/src/compiler.rs` `ba065410d711d16be36d4f2ebd203f2b` → `d9e40340051378fabba85a33befe1570`. `src-tauri/src/compiler_tests.rs` `3b5db56fee841bfb054a32f57803d94a` → `24bf9cfd86c61e538f3661eceddc9b0e`.
- **Checksums untouched:** schema.ts `d15b74576a70074c3238281ec9e862e1`. defaults.rs `17348c039cf8e2e10d395e2f50c9311f`. db.rs `525142f8355ebde387dc8f047de21921`.
- **cargo test:** 20 passed, 0 failed. **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-a8ZvFXB4.js` 107.57 + `jsx-runtime` 4.40). Total JS 243.84 → 243.91 kB gz. The palette change is in `CommandPalette-D1ats-ZA.js` (6.29 kB gz), not the entry.


## 2026-10-04 — Phase 5 Image files

The spec and the task prompt did not disagree. No Designer pass. No icon, shadow, hover, menubar, motion, fold-open emulation, favicon, remote URL, crop, or a second image per breakpoint. `schema.ts` and `defaults.rs` were not edited. `bun run tauri dev` was not started or stopped. No git repo.

- **What shipped:** the image node still stores `src.id` and optional `alt` only. The free-text `รหัสไฟล์รูป` field is gone. Empty id: **เลือกรูป**. Non-empty id: **เปลี่ยนรูป**. The dialog is the existing plugin (`dialog:allow-open`), jpeg/png/gif/webp only. One copy lands in `<app data>/assets/<id>.<ext>`. New SQLite `assets` table is an index (`id`, `project_id`, `ext`), not a blob. Original over 20MB is rejected. Otherwise the long edge is scaled to at most 2560px (Triangle filter) and the result is rejected if it is still over 8MB. A file already inside both caps is stored byte-for-byte, so open/preview/device switch/export do not decode it again. The copy sets `src.id` through the existing `srcId` write (one history entry). Undo does not delete the file. The next successful save deletes stored files no image node still references. Cancel does not write. A locked node keeps the button disabled. The design canvas uses `convertFileSrc`. Empty id keeps the gray box. A missing file shows **ไม่พบรูป** and does not throw. Preview uses `project_id` and emits an asset URL. Preview CSP `img-src` allows `data:` plus the Tauri asset origin only (`asset:`, `http://asset.localhost`, `https://asset.localhost`), not general remote images. Export puts `assets/<id>.<ext>` in the zip with a relative `img` src. A missing file is omitted and the `img` is still emitted. Saving an image does not bump `version`.
- **What did not ship:** everything in the spec's out-of-scope list. Deleting a project does not delete its asset files (the spec only names the next successful save). `meta.favicon` is not filled and is not treated as a node reference.
- **Files:** `src-tauri/src/assets.rs` (new), `db.rs`, `commands.rs`, `compiler.rs`, `compiler_tests.rs`, `export.rs`, `export_tests.rs`, `lib.rs`, `Cargo.toml`, `Cargo.lock`, `capabilities/default.json`, `tauri.conf.json`, `src/components/editor/StylePanel.tsx`, `src/components/editor/node-view.tsx`.
- **Checksums:** schema.ts unchanged `d15b74576a70074c3238281ec9e862e1`. defaults.rs unchanged `17348c039cf8e2e10d395e2f50c9311f`. db.rs `525142f8355ebde387dc8f047de21921` → `73c5d69b7dfa02e6c282dcd36171bc69`. compiler.rs `d9e40340051378fabba85a33befe1570` → `419cc4c3a5d231bbe610d15722b27f84`.
- **cargo test:** 30 passed, 0 failed (was 20). Existing unused `is_locked` warning only.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-C9QaTrRy.js` 107.57 + `jsx-runtime` 4.40). New UI is in `EditorPage-CShfM_eL.js` (64.39 kB gz), not the entry and not modulepreloaded. Total JS 243.91 → 244.51 kB gz.
- **Not click-tested.** A person still needs to pick a jpeg in the running app and confirm the canvas, the sandboxed preview iframe, and the zip.

## 2026-10-04 — Phase 5b Blocks in the Add menu

The spec and the task prompt did not disagree. No Designer pass. No multi-page Vite export. No icon, shadow, hover, motion, menubar, or fold-open emulation. No new node kind, package, or document version. schema.ts and defaults.rs were not edited. Rust was not touched, so cargo test was not re-run (last known 30 passed). `bun run tauri dev` was not started or stopped.

- **What shipped:** a `บล็อก` menu under the eight Add tiles and under `เทมเพลต`, and the same group in the command palette after `เทมเพลต`. Six static trees: การ์ด, แจ้งเตือน, ปุ่มเรียง, ป้าย, เส้นคั่น, ข้อความเรียง. Insert uses `templateInsertIndex` / `applyTemplate` / one `updateOpenDocument`. A locked page disables the control via `canInsertTemplate`. The page child is the block root. No extra section. Focus matches a template: heading for การ์ด and แจ้งเตือน, the text for ป้าย, the spacer for เส้นคั่น. Command-palette insert sets `keepLayerFocus` the same way a template does.
- **What did not ship:** the rest of the shadcn catalog, icons, shadow, hover, motion, a menubar, fold-open emulation, multi-page routing, and a Vite/React export. No descriptions were added under the six labels.
- **Files:** `src/lib/blocks.ts` (new), `src/lib/node-actions.ts`, `src/components/editor/ElementPalette.tsx`, `src/components/editor/CommandPalette.tsx`.
- **Checksums:** schema.ts unchanged `d15b74576a70074c3238281ec9e862e1`. defaults.rs unchanged `17348c039cf8e2e10d395e2f50c9311f`.
- **Build:** green, no chunk-size warning. Initial-load JS stays 111.97 kB gz (entry `index-CnM0KN4p.js` 107.57 + `jsx-runtime` 4.40). Block UI is in `EditorPage-BajHXxJj.js` (64.97 kB gz) and `CommandPalette-DpUOwhzH.js` (6.33 kB gz), not the entry. Total JS 244.51 → 245.11 kB gz.

## 2026-10-05 — Phase 6a Input and switch

The user approved implementation. The spec's status line said not to edit `schema.ts` or `defaults.rs` until the summary was seen, and the acceptance line said those files are not edited by the spec. The same spec says a later change must extend both version writers and add these two kinds. That later change is this implementation. Those two files changed only for `input`, `switch`, their defaults, and version 3. No other schema work.

- **What shipped:** palette tiles `ช่องข้อความ` (`input`) and `Checkbox` (`switch`) after `ช่องว่าง`, and the same two labels in `เพิ่มองค์ประกอบ`. Insert is still `insertPaletteNode` (one undo). Not in `บล็อก`. Properties, in `คุณสมบัติ`: input `ป้ายกำกับ` / `ข้อความตัวอย่าง`; switch `ป้ายกำกับ` / `เปิด` (the existing `Switch`). A locked node disables the rows. Canvas shows the saved switch state and does not toggle it. Labels are not inline-edited. Save writes version 3 iff an input or a switch remains; otherwise version 2 if a breakpoint override remains, else 1. Opening a file does not rewrite the version. Export is still `index.html`, `styles.css`, and `assets`: a real `<input type="text">`, and a native checkbox inside a label. One `.t-switch` rule (`align-items` and `gap` on the type rule). No new package.
- **What did not ship:** changes to `ปุ่ม`, `การ์ด`, `ป้าย`, or `เส้นคั่น`. `src/lib/blocks.ts` was not edited. None of the eight blocks in `docs/PHASE-6-SPEC.md`. No dashboard, login, Vite/React export, backend, or mobile. No icon, shadow, hover, motion, menubar, or fold-open emulation. No `manualChunks`. `chunkSizeWarningLimit` was not raised. No Designer pass.
- **Version 3:** `documentForSave` and `normalize_saved_document`. Field node present → 3 (breakpoint maps kept). No field node and a real `styleBreakpoints` override → 2. Otherwise 1. Not `1.3`. In memory the version stays unchanged until save.
- **Export:** non-empty input label wraps `<label>…<input class="t-input" type="text" placeholder="…"></label>`. Empty label emits the input only. No `id`, `name`, or `for`. Switch is `<label class="t-switch"><input type="checkbox">text</label>`, with `checked="checked"` only when `checked` is true. No script. No password, email, or number type.
- **Unspecified, so not invented as a requirement:** input/switch style defaults (input padding 8/12, 1px solid `#e2e8f0`, radius 8, white background, `#0f172a`, 16px; switch `display: flex`, margin 0, padding 0, same color and size). TS and Rust defaults match. The checkbox carries `class=""` because the existing tag helper always writes `class`. The canvas switch is a div, not a label, so a click selects and does not flip `checked`. The layer name uses a non-empty label the way a button does. Style rows are the named keys plus the existing text-like rows (margin, type, background, opacity) and border. Height, max width, and overflow were not added.
- **Files:** schema.ts `d15b74576a70074c3238281ec9e862e1` → `c1b31b5a7ad3fdec7cff8b8f19edd99d`. defaults.rs `17348c039cf8e2e10d395e2f50c9311f` → `093337a67f219ce9c263ec5124d4baac`. breakpoints.ts `4da862fe6bbef176fdf536548860bd5e`. document-ops.ts `d7e5f01c9a08c2a562d6643c807b25d4`. style-fields.ts `3f42a0fa82f98b5ea05e7f10b72169ea`. ElementPalette.tsx `a9633093aa1f9ec629d7be16bf29994b`. LayersPanel.tsx `f0f938ff9e78c90e90d76130fc8c3c31`. node-view.tsx `817b3c0aade862b3674af8c02115e08a`. StylePanel.tsx `a7b4e40b57afc8877d7c143e53a8f771`. compiler.rs `419cc4c3a5d231bbe610d15722b27f84` → `e7985ac2b890ee26b92a8f367d569377`. compiler_tests.rs `deea85dca02c1f7795d69eb8743e6608`. db.rs `73c5d69b7dfa02e6c282dcd36171bc69` → `69b396e857f8aa0fe47f98f62a208236` (version 3 save test only).
- **cargo test:** 32 passed, 0 failed (was 30). Existing unused `is_locked` warning only.
- **Build:** green, no chunk-size warning. Initial-load JS 111.96 kB gz (entry `index-BBkltuY5.js` 107.56 + preloaded `jsx-runtime` 4.40). New UI is in `EditorPage-BfyDpSAy.js` (65.62 kB gz) and `CommandPalette-BLmNCl6w.js` (6.34 kB gz), not the entry. Total JS 245.11 → 245.81 kB gz.
- `bun run tauri dev` was not started or stopped. No git repo.

## 2026-10-05 — Phase 6b remaining placeable kinds

The user approved implementation. No Designer pass. `bun run tauri dev` was not started or stopped. No git repo.

The spec status line said not to edit `schema.ts` or `defaults.rs` until the summary was seen, and the acceptance line said those files are not edited by the spec. The same spec says both version writers must be extended, and that saving any new kind writes version 4. The approved task allows those two files only for these kinds and version 4. Same reading as Phase 6a: the "do not edit" line was the pre-approval lock; this implementation is that later change. The task prompt asked for three palette groups. The spec says append the kinds after `switch`, tiles under `เพิ่ม`, the same labels in `เพิ่มองค์ประกอบ`, and not in `บล็อก`. Headings were added later, UI only, after Checkbox: Text, Choices, and Disclosure, in the Add menu and the command palette. Kinds before Checkbox stay under เพิ่ม and เพิ่มองค์ประกอบ. Kind names, insert behavior, export, and version rules were not changed.

- **What shipped:** 31 new placeable kinds, English `NODE_TYPE_LABEL`, after `switch`: Textarea, Kbd, Avatar, Progress, Slider, Empty, Item, Marker, Bubble, Message, Select (Native Select is this same kind), Radio Group, Toggle, Toggle Group, Tabs, Input Group, Input OTP, Accordion, Collapsible, Breadcrumb, Pagination, Navigation Menu, Menubar, Dropdown Menu, Dialog, Alert Dialog, Sheet, Drawer, Popover, Tooltip, Hover Card. Static lists only. Canvas click selects and does not toggle, open, or submit. One insert is one undo. Locked nodes disable the property rows. Existing `StyleProps` only. Export stays the HTML/CSS zip (`index.html`, `styles.css`, `assets`). No new package. No script.
- **What did not ship:** table, chart, calendar, sidebar, dashboard, login, Vite export, backend, database, animation, mobile, the eight `docs/PHASE-6-SPEC.md` blocks, and form submit. No icon, shadow, hover-as-a-feature, motion, or fold-open emulation on the page. No `manualChunks`. `chunkSizeWarningLimit` was not raised. Existing palette nodes, Input, Checkbox, and the six blocks were not changed. Checkbox's visible name and default label stay `Checkbox`. `src/lib/blocks.ts` was not edited. No Designer pass.
- **Version 4:** `documentForSave` (`src/lib/breakpoints.ts`) and `normalize_saved_document` (`defaults.rs`). Any new kind → 4. With none of them, the live rule stays: 3 if an input or switch remains, 2 if a breakpoint override remains, otherwise 1. Not `1.4`. Opening a version 1, 2, or 3 file does not rewrite the version. In memory the version stays until save. Breakpoint overrides still apply. Removing the last new kind falls back.
- **Export notes that the spec left open, so they are not requirements:** select and radio default options `One` / `Two` with value `One`. Tabs labels `Tab 1` / `Tab 2` with text `One` / `Two`. Accordion labels `One` / `Two` and text `Content`. Breadcrumb and navigation menu `Home` / `Page` with an empty href. Menubar `File` / `Edit` plus text `Content`. Dropdown items `One` / `Two`. List rows cannot be added or removed. OTP length is clamped to 1–8 in the editor and the compiler; one character per box, `maxlength="1"`. `pressed` and `open` rows use `เปิด`. Align and side use `จัดแนว` with a native select of `start`/`end` or `left`/`right`. Fallback, description, tip, prefix, and suffix use `ข้อความ` or `ป้ายกำกับ`. Href placeholder is `ลิงก์ปลายทาง`. Layer names follow `title`, then `text`; Avatar stays `Avatar`. A closed dialog, sheet, or drawer exports nothing and still shows its title on the canvas. Dropdown and popover `<details>` start closed. Drawer is not `position: fixed`; its one type rule adds `border-top: 1px solid #e2e8f0`. Sheet side is only `data-side`. A radio group's `name` is the node id. If `value` matches no option, none are checked. Style defaults were filled so TS and Rust match (textarea matches input; kbd is inline-block; avatar is 40×40 with a large radius; progress and slider are block, width 100%; tabs, toggle group, and menubar are flex). Inner tags that would have had only `class=""` omit the attribute. The switch checkbox still emits `class=""`, as before. Palette lucide icons are editor chrome so the icon map typechecks. They are not page icons.
- **Files (md5):** schema.ts `c1b31b5a7ad3fdec7cff8b8f19edd99d` → `b2422769b1bae8462bba82b71353e72f`. defaults.rs `093337a67f219ce9c263ec5124d4baac` → `acaef1db59e9ff3ba27cfeaf41a739ed`. db.rs `1241ff5d6d53dbed507c0bf1c5847328` → `0791d7c3433fc9c7dff409a6cfc1e69e`. compiler.rs `e7985ac2b890ee26b92a8f367d569377` → `8eca10b15f19006b82c688338d80156d`. compiler_tests.rs `33ea9ac229aa0a891c2cb429fda74e59`. breakpoints.ts `c591ed7926c3a3b2a81fcfc6ef088222`. document-ops.ts `42a502965367ad909444dfee4a075ddc` → `22f2ecc60009e2ad80664038d40e5a2e`. style-fields.ts `4e5935520459a12a7d66fb827244e485`. ElementPalette.tsx `ed2bdbb2b03c25cb7bce31822ec42a22`. LayersPanel.tsx `ddeac4376450b3896fc46308f05074f6`. node-view.tsx `4d1e80d5276b8db99fcb6af0c61a8b63`. StylePanel.tsx `ec1c1637191dc8d2466d83b2a0c90386`. New: phase6b-view.tsx `93b03779c42e3b448011a75f0ca13d86`. phase6b-props.tsx `3a0293af184c0bc55fac082ebae50223`.
- **cargo test:** 34 passed, 0 failed (was 32). Existing unused `is_locked` warning only.
- **Build:** green, no chunk-size warning. Initial-load JS 111.97 kB gz (entry `index-B-Ao9mcU.js` 107.57 + preloaded `jsx-runtime` 4.40). Was 111.96. New UI is in `EditorPage-CZSQpmtK.js` (70.83 kB gz) and `CommandPalette-DLu8iYxw.js` (6.34 kB gz), not the entry. Total JS 245.81 → 252.21 kB gz.

## 2026-10-26 — Phase 11 A1.2 audit (existing kinds: current export vs target)

Read-only audit for `docs/PHASE-11-SPEC.md` step A1.2. Each row's HTML and CSS are the real output of `compile_export` (Rust, the then-live `compiler.rs` md5 `0f691ba2b90afa4c74cdf4835e0effc5`, unchanged by this audit; that file is the pre-A1.3 BASELINE. The live compiler is now A1.3b/A1.4: see the md5 list in the A1.4 section below) for **one freshly inserted node of that kind with default props** (what a palette click creates), alone on a page. The shared reset and `.t-page` rule are left out (identical for every row). "Canvas look" is read from `node-view.tsx` / `phase6b-view.tsx` (same `styleToCss` as the compiler's `decls`). A rendered contact sheet of all 35 exports is kept at `~/agent-tools/p11/a12/preview-sheet.png`. Nothing in `schema.ts`, `defaults.rs` or `compiler.rs` was changed to make this table. **Step-text note:** the A1.2 step text says `compile_preview`, but the HTML and CSS pasted here are `compile_export` output. They are equivalent: the 34 of 35 rows whose Preview body and export body were compared are byte-equal; the 35th differs only in the inert `href` Preview puts on a link. **Doc note:** the md5 of this file before the Designer's fixes is `a03ab0b0…` (an earlier note had `a03ab0b8`, which was a typo). **Targets are proposals; Designer approves them before A1.3 starts.**

**Result (after the Designer's A1.2 review, 2026-10-26):** 35 rows — **6 PASS, 11 PARTIAL, 18 GAP**. The first draft said 5 / 10 / 20. Reclassified: row 12 `marker` PARTIAL → PASS (Designer: no change); row 7 `avatar` GAP → PARTIAL (the box, size and clipping are right, only the letter is not centred); row 30 `alertDialog` GAP → PARTIAL (its confirm and cancel are already real `<button type="button">`, so only the panel, roles and title/body tags are missing). Also found: the existing `select` already exports a native `<select>` (A3.4 decision: `nativeSelect` is redundant); the `switch` input still emits `class=""`; `inputGroup` and `inputOtp` are invisible in the export (the reset sets `border:0` and nothing restores it); 13 kinds concatenate their title and body with no tag between them.

| # | Kind | Export HTML (verbatim) | Per-type CSS (verbatim) | Canvas look | Verdict | Target (for Designer) |
|---|---|---|---|---|---|---|
| 1 | `button` | `<span class="t-button">ปุ่ม</span>` | `.t-button{display:inline-block;margin:0px;padding:10px 16px 10px 16px;background-color:#0ea5e9;color:#ffffff;font-size:16px;font-weight:600;line-height:1.25;text-align:center;border-radius:8px;border-width:0px;border-style:none}` | `node-view` renders the same `span.t-button` (blue pill, white 600 text). Matches the export. | **PASS** | None. Unlinked button stays a `span` (no form element, Phase 7). |
| 2 | `link` | `<a class="t-link" href="#">ลิงก์</a>` | `.t-link{display:inline;margin:0px;padding:0px;color:#0284c7;font-size:16px;font-weight:500;text-align:left;text-decoration:underline}` | `a`/`span` with the same type rule (blue, underline). Matches. | **PASS** | None. |
| 3 | `input` | `<input class="t-input" type="text" placeholder="พิมพ์ที่นี่">` | `.t-input{display:block;width:100%;margin:0px;padding:8px 12px 8px 12px;background-color:#ffffff;color:#0f172a;font-size:16px;font-weight:400;line-height:1.5;border-radius:8px;border-width:1px;border-color:#e2e8f0;border-style:solid}` | Same bordered input (radius 8, 1px `#e2e8f0`). Matches. | **PASS** | None. |
| 4 | `switch` | `<label class="t-switch"><input class="" type="checkbox">Checkbox</label>` | `.t-switch{display:flex;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400;align-items:center;gap:8px}` | Native checkbox + label "Checkbox" in a flex row. Matches the export; neither looks like a switch. | **PARTIAL** | A1.3: drop the empty `class=""` on the `<input>`. The real toggle look is A3.2 (not A1). Relabel is A1.5. |
| 5 | `textarea` | `<textarea class="t-textarea" placeholder="Type here"></textarea>` | `.t-textarea{display:block;width:100%;margin:0px;padding:8px 12px 8px 12px;background-color:#ffffff;color:#0f172a;font-size:16px;font-weight:400;line-height:1.5;border-radius:8px;border-width:1px;border-color:#e2e8f0;border-style:solid}` | Canvas wraps a label span + `textarea` (same type rule as input). Matches. | **PASS** | None. |
| 6 | `kbd` | `<kbd class="t-kbd">Kbd</kbd>` | `.t-kbd{display:inline-block;margin:0px;padding:2px 6px 2px 6px;color:#0f172a;font-size:14px;font-weight:400;border-radius:4px;border-width:1px;border-color:#e2e8f0;border-style:solid}` | Bordered inline-block `kbd`. Matches. The font is the UA monospace (`kbd` default), not the page sans. | **PASS** | None. |
| 7 | `avatar` | `<div class="t-avatar">A</div>` | `.t-avatar{display:block;width:40px;height:40px;margin:0px;padding:0px;background-color:#e2e8f0;color:#0f172a;font-size:16px;font-weight:400;text-align:center;border-radius:999px;overflow:hidden}` | 40×40 grey circle, fallback letter centred by an inline-flex span. Export puts the letter centred horizontally at the top of the circle (inherited `text-align:center`), not vertically centred. | **PARTIAL** | A1.3: block-level `display:flex;align-items:center;justify-content:center` and `object-fit:cover` on `.t-avatar` so the fallback is centred like the canvas. |
| 8 | `progress` | `<progress class="t-progress" value="40" max="100"></progress>` | `.t-progress{display:block;width:100%;margin:0px;padding:0px}` | Native `<progress>` with the UA look (green fill, grey track). | **PARTIAL** | A1.3: themed track `#e2e8f0`, bar `#0f172a`, height 8, radius 999, via `::-webkit-progress-*` and `::-moz-progress-bar`; `aria-label` from layer name is optional. |
| 9 | `slider` | `<input class="t-slider" type="range" min="0" max="100" value="40">` | `.t-slider{display:block;width:100%;margin:0px;padding:0px}` | Native range input, UA blue. | **PARTIAL** | A1.3: `accent-color:#0f172a` only. |
| 10 | `empty` | `<div class="t-empty">EmptyNothing here</div>` | `.t-empty{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Two stacked `div`s (title, message), no panel. | **GAP** | A1.3: `h3` + `p`; panel look per contract (bg `#ffffff`, border `#e2e8f0`, radius 12, padding 24, centred text). Today title and message run together ("EmptyNothing here"). |
| 11 | `item` | `<div class="t-item">ItemDescription</div>` | `.t-item{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Two stacked `div`s, no padding. | **GAP** | A1.3: `h3` + `p`; item padding per contract (the spec says "8/12/16": Designer to confirm = padding 8×12, radius 16, or another reading). |
| 12 | `marker` | `<div class="t-marker">Marker</div>` | `.t-marker{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | One `div` of text. | **PASS** | None (Designer decision: the marker keeps its plain look; the search keywords `pin` / `map` / `location` were dropped in A1.1). |
| 13 | `bubble` | `<div class="t-bubble">Message</div>` | `.t-bubble{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | One `div` of text; `align:end` right-aligns text. | **GAP** | A1.3: chat bubble look (bg `#f1f5f9`, radius 16, padding 8×12, `max-width:80%`, `margin-left:auto` for `end`). Export already honours `align`. |
| 14 | `message` | `<div class="t-message">NameMessage</div>` | `.t-message{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Sender `div` + text `div`. | **GAP** | A1.3: sender as `strong` (14/600) + `p`; same bubble look and `align` as bubble. Today "NameMessage" runs together. |
| 15 | `select` | `<select class="t-select"><option selected="selected" value="One">One</option><option value="Two">Two</option></select>` | `.t-select{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Native `<select>` with the UA look. The reset removes its border, so it looks flat (no border), not a full UA look. | **PARTIAL** | A1.3: same border, radius, padding, bg as `input`. Note for A3.4: the existing `select` ALREADY exports a native `<select>`, so `nativeSelect` is redundant (spec §10 #13). |
| 16 | `radio` | `<div class="t-radio"><label><input type="radio" name="n1" checked="checked">One</label><label><input type="radio" name="n1">Two</label></div>` | `.t-radio{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Labels with radios side by side, no gap. | **PARTIAL** | A1.3: column, gap 8; each `label` inline-flex, gap 8. |
| 17 | `toggle` | `<button class="t-toggle" type="button" aria-pressed="false">Toggle</button>` | `.t-toggle{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Native `<button>` with the UA grey. | **GAP** | A1.3: padding 8×12, radius 8, border `#e2e8f0`; `[aria-pressed="true"]` bg `#f1f5f9`. Export has padding 0 and no border. |
| 18 | `toggleGroup` | `<div class="t-toggleGroup"><label><input type="radio" name="n1" checked="checked">One</label><label><input type="radio" name="n1">Two</label></div>` | `.t-toggleGroup{display:flex;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400;gap:8px}` | Radios in a flex row, not segmented. | **GAP** | A1.3: `<label><input><span>` so the group draws as a bordered segmented bar; checked item bg `#f1f5f9` via `input:checked+span`. Native radios stay (no JS). |
| 19 | `tabs` | `<div class="t-tabs"><div><input type="radio" name="n1" checked="checked">Tab 1<div class="p6panel">One</div></div><div><input type="radio" name="n1">Tab 2<div class="p6panel">Two</div></div></div>` | `.t-tabs{display:flex;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400;flex-wrap:wrap;gap:8px}.t-tabs .p6panel{display:none;flex-basis:100%}.t-tabs input:checked~.p6panel{display:block}` | Tab labels as spans in a row, active tab's text after it. | **GAP** | A1.3: the label is NOT inside a `<label>`, so clicking the text does nothing in the export. Target: `<input id>` + `<label for>` tab strip with an active underline, panel below. The no-JS radio rule is kept. |
| 20 | `inputGroup` | `<div class="t-inputGroup"><span></span><input type="text" placeholder="Type here"><span></span></div>` | `.t-inputGroup{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Prefix span, text input, suffix span (borderless because of the reset). | **GAP** | A1.3: bordered group (border `#e2e8f0`, radius 8) with the input borderless inside; empty prefix/suffix spans are not emitted. Today the input is invisible (reset sets `border:0`). |
| 21 | `inputOtp` | `<div class="t-inputOtp"><input type="text" maxlength="1" value=""><input type="text" maxlength="1" value=""><input type="text" maxlength="1" value=""><input type="text" maxlength="1" value=""><input type="text" maxlength="1" value=""><input type="text" maxlength="1" value=""></div>` | `.t-inputOtp{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Up to 8 borderless inputs: invisible. | **GAP** | A1.3: 40×40 boxes, border `#e2e8f0`, radius 8, centred text, gap 8; `inputmode="numeric"`. Today the six inputs have no border and the group is invisible. |
| 22 | `accordion` | `<div class="t-accordion"><details open="open"><summary>One</summary>Content</details><details><summary>Two</summary>Content</details></div>` | `.t-accordion{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Item labels as divs; the open item shows its text. | **PARTIAL** | A1.3: item divider `#e2e8f0`, summary padding 16×0 weight 500, content in a `div`. `<details>` already works without JS. |
| 23 | `collapsible` | `<details class="t-collapsible" open="open"><summary>Details</summary>Content</details>` | `.t-collapsible{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Label div + content div when open. | **PARTIAL** | A1.3: summary weight 500; content in a `div` with padding. |
| 24 | `breadcrumb` | `<nav class="t-breadcrumb"><span>Home</span><span>Page</span></nav>` | `.t-breadcrumb{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Item labels as spans. | **GAP** | A1.3: `<nav aria-label="breadcrumb"><ol><li>`, separators via `::before`, `<a>` when an href is set, last item `aria-current="page"`. Today "HomePage" runs together and `nav` has no name. |
| 25 | `pagination` | `<nav class="t-pagination"><span aria-current="page">1</span><span>2</span><span>3</span></nav>` | `.t-pagination{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Item labels as spans. | **GAP** | A1.3: `<nav aria-label="pagination"><ul>`, 36×36 cells, radius 8, active cell bordered with `aria-current="page"`. Today "123". |
| 26 | `navigationMenu` | `<nav class="t-navigationMenu"><span>Home</span><span>Page</span></nav>` | `.t-navigationMenu{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Item labels as spans. | **GAP** | A1.3: `<ul>` in a flex row gap 8, `<a>` when an href is set, items padding 8×12 weight 500. Today "HomePage". |
| 27 | `menubar` | `<div class="t-menubar"><div>FileContent</div><div>EditContent</div></div>` | `.t-menubar{display:flex;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400;gap:8px}` | Label + text per item in a row. | **GAP** | A1.3: bar border `#e2e8f0` radius 8 padding 4; each item a `<details>` (honest static dropdown) — label as `summary`, text as panel. Today "FileContent EditContent". |
| 28 | `dropdownMenu` | `<details class="t-dropdownMenu"><summary>Menu</summary><div>One</div><div>Two</div></details>` | `.t-dropdownMenu{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Label div + item divs. | **PARTIAL** | A1.3: `summary` styled like a button (border, radius 8, padding 8×12); items in a bordered panel (radius 8, padding 4, rows 6×8). Native `<details>` already works. |
| 29 | `dialog` | `<div class="t-dialog">DialogNote</div>` | `.t-dialog{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Title div + message div (when open). | **GAP** | A1.3 (contract): `h2` + `p` in a panel (bg `#ffffff`, border `#e2e8f0`, radius 12, padding 24), `role="dialog"` + `aria-label`; `open:false` still emits nothing. Today "DialogNote" runs together. |
| 30 | `alertDialog` | `<div class="t-alertDialog">AlertNote<button type="button">OK</button><button type="button">Cancel</button></div>` | `.t-alertDialog{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Title, message, confirm and cancel spans on the canvas. The export already emits real `<button type="button">` for both. | **PARTIAL** | A1.3: `h2` + `p` panel with `role="alertdialog"`, confirm = primary (bg `#0f172a`, white), cancel = outline; the buttons stay `<button type="button">` (never a `span`). No `open` prop, so it always emits. |
| 31 | `sheet` | `<div class="t-sheet" data-side="right">SheetNote</div>` | `.t-sheet{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Title + message (when open). | **GAP** | A1.3: panel look as dialog; `data-side` also draws a side border (`border-left` for right, etc.). Today only an unstyled `data-side`. |
| 32 | `drawer` | `<div class="t-drawer">DrawerNote</div>` | `.t-drawer{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400;border-top:1px solid #e2e8f0}` | Title + message (when open). | **GAP** | A1.3: panel look as dialog, top border kept (`1px solid #e2e8f0`), radius 12 on the top corners. |
| 33 | `popover` | `<details class="t-popover"><summary>Open</summary>Note</details>` | `.t-popover{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Label div + text div. | **PARTIAL** | A1.3: `summary` button look; panel border, radius 8, padding 12. `<details>` already works. |
| 34 | `tooltip` | `<div class="t-tooltip">TipMore</div>` | `.t-tooltip{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Label span + tip span. | **GAP** | A1.3 (contract): label inline, tip as a compact dark pill (bg `#0f172a`, colour `#ffffff`, radius 6, padding 6×10, font 13), `role="tooltip"`. Today "TipMore" runs together. |
| 35 | `hoverCard` | `<div class="t-hoverCard">TitleDetails</div>` | `.t-hoverCard{display:block;margin:0px;padding:0px;color:#0f172a;font-size:16px;font-weight:400}` | Title div + text div. | **GAP** | A1.3: panel look (border, radius 12, padding 16), title `h3` weight 600 + `p`. Today "TitleDetails" runs together. |

## 2026-10-26 — Phase 11 A1.3 (existing kinds: export markup and CSS) + A1.1 follow-ups

Designer verdict on A1: A1.1 PASS, A1.2 approved with changes (the A1.2 section above now carries them). A1.3 changes only `src-tauri/src/compiler.rs` (plus its tests and goldens). `schema.ts` and `defaults.rs` are unchanged (`567b629d…` / `54102c65…`). No version bump, no new dependency, no `manualChunks`.

- **`css_safe`** now rejects a value with a backslash and strips `{ } ; < >`, control characters and repeated `/*` … `*/`; after trimming it returns `""` if the lower-cased text contains `url(`, `image-set(`, `expression(`, `@import`, `javascript:`, `behavior` + optional whitespace + `:`, `-moz-binding`, `vbscript:` or `gradient(`. This closes the item in `docs/FOLLOWUPS.md` ("`css_safe` does not strip `url(`"). All 43 baseline fixtures compile byte-identically after this change alone.
- **G1** `node_class` diffs against `default_styles` merged with `type_extras`; an explicit `node.style` key always wins, in Preview and export. Types without extras compile byte-identically to before.
- **G2** every new look is a literal hex longhand in `type_extras` or `type_css` (no `var(`, gradient, `url(` or `!important`). **G3** an empty title or body omits its tag. **G4** select, slider, progress, inputGroup, inputOtp and radio get `aria-label` from the layer name when it is non-empty. **G5** `ul`/`ol` with `list-style:none` also get `role="list"`; hand-built controls keep a `:focus-visible` outline `2px solid #0077c2`; ids come from a per-document counter (`tab1-0`, `tab1-p0`, `tip2`, …). **G6** no `tab`, `tablist`, `tabpanel`, `menubar` or `menu` roles (tabs stay a no-JS radio + label strip).
- Rows implemented: all gap and partial rows of the A1.2 table except 1, 2, 3, 5, 6 and 12 (unchanged). Row 4 drops `class=""`. `alertDialog` buttons stay `<button type="button">`.
- Tests: cargo 112 → 128 passed for A1.3 (135 after A1.3b; 142 after A1.4/A1.5) (16 new in `compiler_a13_tests.rs`: 4 `css_safe_*`, 12 `a13_*`; 4 existing tests updated for the intended row changes). Goldens: `src-tauri/src/fixtures/a1/all-kinds.{json,index.html,styles.css}`.
- **A1.1 follow-ups:** (a) the `พบ n รายการ` announcement is cleared when the query is cleared; (b) the palette search border is now `border-muted-foreground` (light 4.96:1, dark 6.98:1 against the sidebar); (c) Ctrl+Z with body focus and empty history calls `preventDefault`; (d) marker keywords are now `marker`, `label`, `note`, `ป้าย`, `เครื่องหมาย` (`pin` still finds Input OTP); (e) collapse state stays session-only (accepted, no change).
- Not started: A1.4, A1.5, A2.

### A1.3b — Designer review fixes (2026-10-26)

Designer approved A1.3 with six changes; all are in `compiler.rs` (tests in `compiler_a13_tests.rs`; `schema.ts`, `defaults.rs` unchanged).
1. `toggleGroup` (role `radiogroup`) gets `aria-label` from the layer name when it is non-empty (same helper as `radio`). `tabs` has no role and gets none.
2. `bubble` / `message` with `align:end` emit `margin-left:auto` only when the node has no `margin` of its own (G1: an explicit margin, including 0, wins).
3. `sheet` / `drawer` borders: the facing side (`border-left` for a right sheet, `border-right` for a left one, `border-top` for the drawer) is now a zero-specificity `:where()` rule, so the node's own `borderWidth`, `borderStyle` and `borderColor` win. The other three sides are forced to `border-style:none` at two classes, so no user border value can show them.
4. `css_safe` rejects unbalanced quotes and parens (an unclosed `"` or `(` or a stray `)`); quoted parens do not count.
5. `css_safe` comment removal is one linear pass (identical result to the old loop on all 349,525 strings up to length 9 over `/ * a space`; 200k nested pairs take 15–52 ms in a debug build).
6. `inputOtp` gets `flex-wrap:wrap` (12 boxes overflowed 375px by 1px).

Accepted as is: tabs with `active` out of range show the first tab (test added); marker unchanged; sheet/drawer `role="dialog"` with `aria-label` = title only when the title is non-empty, never `aria-modal`; item panel 12/16 with a 4px gap; radio `aria-label` on the radiogroup. **Limitation:** descendant text colours are literal; a node `color` reaches titles and body but muted text stays `#64748b` (3.78:1 on a dark panel). Logged in `FOLLOWUPS.md` with the other non-blocking items. The empty-label `dropdownMenu`/`popover` summary is left for later (FOLLOWUPS item 6).

### A1.5 + A1.4 — relabel, and one shared look file (2026-10-26)

**A1.5.** `NODE_TYPE_LABEL.switch` is now "Switch" (was "Checkbox"); nothing else about the kind changes. The default node name and the default `label` prop stay "Checkbox", so no saved document changes. The palette tile's `aria-label` becomes `เพิ่มSwitch`. `checkbox` is now a search keyword of the switch tile, so the old word still finds it; A3 adds a real checkbox kind. Files: `document-ops.ts`, `palette-meta.ts`, `palette-meta.test.ts`. Also done with it: an empty-label `dropdownMenu` / `popover` now falls back to the layer name in the `<summary>` (same helper on both sides: `summary_label` in Rust, `summaryLabel` in TS), and never invents text when both are empty.

**A1.4 — one source for the look constants.** `src/lib/kind-looks.json` holds, per kind, the `extras` (declarations merged over the default styles) and the `css` (descendant and pseudo rules), a colour palette (`{{ink}}`, `{{line}}` …) and the sheet/drawer facing-side map. Both sides read it:
- **Rust** `compiler.rs` `include_str!`s it, expands the tokens once and builds `type_extras` / `type_css` from it. The compiled output is **byte-identical** to A1.3b for all 43 baseline fixtures (129 files; the `a14-out` / `a14-out2` runs diff clean against `a13b-out`). `container` is still built from `defaults.rs`.
- **TS** `src/lib/kind-looks.ts` expands the same data. The `css` goes into one `<style data-kind-looks>` (injected once from `phase6b-view.tsx`, which is in the lazy editor chunk: initial JS stays 110.8 kB gz, total +4.0 kB). The `extras` go inline on the node root through `rootStyleFor`, only for a property the node did not set itself (G1: an explicit style wins). `styleToCss` moved unchanged to `src/lib/style-css.ts` (node-view re-exports it) so tests can import it without Tauri.
- `phase6b-view.tsx` now renders the same tags and classes as `render_v4` (`h3`/`p`, `details`/`summary`, `ol`/`ul` with `role="list"`, tabs as radios + labels + `.p6panel`, real `<button class="ok|no">`, `aria-label` from the layer name on radio / toggleGroup / select / slider / progress / inputGroup / inputOtp). Everything inside a node is inert through ONE canvas-only rule, `[data-node-type][data-cv] *{pointer-events:none}`, so a click selects the node. `details` are rendered closed (menubar, dropdown, popover) or at their `open` prop (accordion, collapsible).
- **Sheet / drawer on the canvas.** Inline styles would beat the type rules, so `rootStyleFor` writes the four per-side border longhands itself: the facing side gets the node's own width / style / colour or `1px solid #e2e8f0`, the other three `none`.
- **Bubble / message `align:end`** is `margin-left:auto` only (no more `text-align:right`), and only when the node has no margin of its own.

*Canvas vs Preview: known differences (intended).* (1) A closed dialog / sheet / drawer emits nothing in Preview and export; the canvas keeps a title-only stub so the node stays selectable. (2) Breadcrumb / navigationMenu items with a non-empty href look like links on the canvas; Preview turns only links to this project's pages into links (the others are spans, so the frame never navigates). (3) Every control is inert on the canvas (no toggling, opening, typing). (4) Chrome (selection outline, drop outline) exists only on the canvas.

*Leaf controls on the canvas (A1.4b, completed in A1.4c).* A select, slider, progress and unlabelled textarea cannot be the canvas root: a native control that cancels `mousedown` starts no drag (select / slider / textarea, found in the real app after A1.4), and a `<progress tabindex=-1>` root is click-focusable, so a click put focus on it and the canvas shortcut gate (`isCanvasShortcutFocus`: focus must be the canvas scope) ignored Delete / arrows / Enter / Esc / Ctrl+Z (found by the Designer after A1.4b; reproduced in the real app). All four now render inside a thin canvas-only wrapper (`src/components/editor/control-shell.tsx`, style split by `splitControlStyle` in `kind-looks.ts`). The wrapper is a plain `div` (not focusable) and carries what the root carried (handlers incl. draggable and drag events, `data-node-id` / `data-node-type` / `data-cv`, selection and drop chrome) plus the box properties (display, width, min-height, max-width, margin, opacity; never a height); the inner control keeps `t-<type>` and the look, with `display:block;width:100%`, the height (kind-looks extra or the node's own) and `tabIndex -1`, and is inert through `[data-node-type][data-cv] *{pointer-events:none}`, so a click lands on the wrapper and focus falls back to the canvas scope. Nothing in the export changed (43 fixtures / 129 files byte-identical to `a14-out2`). Real app (A1.4c, both themes): click on select / slider / progress / textarea (labelled and not) / button leaves `document.activeElement` on the canvas scope; Delete removes the node and Ctrl+Z restores it; ArrowDown / ArrowUp move the selection; Enter does nothing on a node without text (starts an inline edit on a button) and Esc selects the page; the four kinds drag-reorder; Design equals Preview (progress with width %, margin, inline-block, height, opacity, max-width) and the canvas is pixel-identical to A1.4b. `phase6b-view.tsx` must never use `onMouseDown`, and no focusable tag may be a node root (tests read the source). Also in A1.4c: `[data-node-type][data-cv] summary{user-select:none}` (canvas only) so a drag from a summary row leaves no text highlighted (FOLLOWUPS item 11); and tests that prove a damaged `kind-looks.json` cannot fall back silently (FOLLOWUPS item 18). *A1.4d:* the wrapper has no height of its own (a percentage height is the one exception), so a progress with padding 20/30/10/5 is a 716x30 wrapper like the export (A1.4c had 716x8 around a 716x30 control and the next node sat 22 px high); a test fails if the wrapper gets the kind-looks height (FOLLOWUPS items 19, 20). Tests: bun 248 → 254 (A1.4b) → 261 (A1.4c) → 266 (A1.4d, `control-shell.test.ts` 18); cargo 142 → 145.

*`css_safe` behaviours that look odd but are intended (documented, not bugs).* An **unquoted apostrophe** (`Mak's Sans`) is rejected, because it opens a quote that never closes; write `"Mak's Sans"`. A **quoted** `"url(x)"` is rejected too, because the deny list tests the text, not CSS tokens. Tests: `a15_css_safe_documented_rejections_unquoted_apostrophe_and_quoted_url`. Comment-only change in `compiler.rs`; output is byte-identical.

*Test notes.* The sheet / drawer border tests match exact CSS strings: they prove which declarations are emitted, not that the facing-side rule still wins on specificity (see `FOLLOWUPS.md`). The comment-removal equivalence test now calls `css_safe` itself (it used to run a copy of the loop). New tests: Rust `a14_*` x5, `a15_*` x2 (142 cargo total); bun `kind-looks.test.ts` x12 (248 bun total).


### A2.1 — plumbing for the 9 new kinds (2026-10-26)

Per `PHASE-11-SPEC.md` §4 (A2.1 row: "Plumbing for the 9 kinds: TS/Rust enums, `ALL_TYPES`, version marker, round-trip fixture"). **Nothing is visible yet:** the compiler and the canvas draw nothing for the new kinds until A2.3–A2.5 (Design and Preview agree: both show nothing). The nine kinds: `card`, `alert`, `badge`, `separator`, `skeleton`, `spinner`, `aspectRatio`, `scrollArea`, `buttonGroup`.

- **`schema.ts` / `defaults.rs` (mirrored; this is the first change allowed to them).** 9 new `NodeType` members and 9 `NodeProps` variants. `card`, `alert`, `buttonGroup` carry only `children` + optional `direction`/`gap`/`align`/`justify`; `skeleton` is a bare `{}` leaf (no children); `badge` {label}; `separator` {orientation}; `spinner` {size}; `aspectRatio` {ratio}; `scrollArea` {orientation, label?}. Three new Rust enums (separator orientation, spinner size, scroll-area orientation); `ASPECT_RATIOS` in TS. `StyleProps` is NOT touched (no new style key, so no `is_empty` change). `default_styles` has the same 9 entries on both sides (golden: `src-tauri/src/fixtures/a2/default-styles.json`).
- **Version marker (§4.4).** A second predicate beside `isPhase6bType` / `is_phase6b`: `isVersion4Kind` (TS) / `is_version4_kind` (Rust) = phase 6b kinds + the 9 new kinds. A single page with any of them saves as version 4; two or more pages stay 5; a document without them stays version 1. Opening a file never rewrites it (real app: byte-identical row after open). UI routing that uses `isPhase6bType` is untouched. `breakpoints.ts` now uses `isVersion4Kind`.
- **`compiler.rs`:** `ALL_TYPES` 42 → 51 (it only drives `.t-<type>` rules for USED types, so no existing output changes); `type_name`; `render_node` returns early / has no-op arms for the new kinds (the match is exhaustive, so this is what keeps it compiling). A2.3/A2.4 replace those arms.
- **Forced by exhaustive matches (not UI work):** `NODE_TYPE_LABEL` (9 English labels, same convention as the other kinds), Layers icons (stand-in lucide icons). No palette tiles, no `FIELDS`, no style-panel changes: that is A2.5.
- **Tests:** Rust `compiler_a21_tests.rs` (5) + `db_a21_tests.rs` (9); bun `a2-plumbing.test.ts` (13). Cargo 145 → 159, bun 266 → 279. Round-trip: TS-shaped JSON with all 9 kinds through `save_project` / `load_project` keeps every key (compared as parsed JSON, since `HashMap` node order is not stable); a v1 document without them loads unchanged; unset keys stay absent. Key-parity test reads `schema.ts` and `defaults.rs` and fails when the 9 kinds, their props keys or their default styles drift. Fixtures: `fixtures/a2/seed-a2.json`, `fixtures/a2/default-styles.json`. The 43 baseline fixtures (129 files) are byte-identical to `a14-out2`.
- **Cost:** initial JS 110,670 → 110,784 B gz (+114 B, under the 112.55 kB budget); total +1,002 B.

### A2.2 — container behaviour for the 5 kinds with children (2026-10-26)

Per `PHASE-11-SPEC.md` §4 (A2.2 row: "Container-like kinds: `getChildren`, `canInsertInto`, drop rules, Layers tree, layout props"; check: "Drag a heading into a card; undo removes it; drop into `badge` refused with the existing 'no' cursor"). Conservative reading: this is the **data layer**. Nothing new is drawn: the canvas, Preview and export still show nothing for the new kinds (A2.3–A2.5), so a card cannot yet be a canvas drop target; Layers, the palette click and the document-ops paths all work on nested A2 containers.

- **Container set.** `CONTAINER_NODE_TYPES` (schema.ts) = page, section, container + **card, alert, aspectRatio, scrollArea, buttonGroup**. Leaves: badge, separator, skeleton, spinner (and every other kind). Rust mirror: `Node::children()` lists the same five. `isContainerType` drives `findParent`, `canDropNode`, `canInsertInto`, `resolveInsertTarget`, `removeNode`, so insert, move, delete (subtree), duplicate/paste (existing paths), undo/redo and `flattenLayers` (depth indent) work with no other change. `getChildren` is a switch over the 8 kinds; `withChildren` is a no-op for a non-container.
- **`canInsertInto(doc, parent, index)`**: true only if the parent is one of the 8 container kinds, is not locked (a locked page counts), and `0 <= index <= children.length`. It has no child-type argument, so any kind can go into any container (see FOLLOWUPS 23, 27).
- **`canDropNode`**: also refuses the root, self, a descendant target, a locked moving node, and the same-slot no-op.
- **Layout props.** `setNodeProp` on the five kinds writes `direction`/`gap`/`align`/`justify` sparsely: a value equal to the kind's default is removed, not stored. Defaults (`A2_LAYOUT_DEFAULTS` in schema.ts, `a2_layout_defaults` in defaults.rs, text-parity tested): card column/16, alert column/8, aspectRatio column/0, scrollArea column/0, buttonGroup row/0 (align stretch, justify start). `schema.ts` / `defaults.rs` changed only for this (no new key, no version bump, no `is_empty` change, `StyleProps` untouched).
- **Not changed:** the compiler (only registers a test module), `db.rs` (registers a test module), Layers panel, canvas, palette, FIELDS. There is still no depth limit and no orphan/dangling-id normalisation (ids are stored verbatim; the compiler's depth > 256 guard and its skip of a missing id still protect the export).
- **Tests:** Rust `db_a22_tests.rs` (4) + `compiler_a22_tests.rs` (3); bun `a2-containers.test.ts` + `a2-containers-history.test.ts` (28). Cargo 159 -> 166, bun 279 -> 307. Round-trip: `fixtures/a2/seed-a2-nest.json` (15 nodes, nested card > alert > aspectRatio > scrollArea > buttonGroup > buttons, a card with a dangling id) through `save_project` / `load_project` keeps every key at version 4. Mutation check: removing `ButtonGroup` from Rust `children()` fails 2 tests; removing `buttonGroup` from `CONTAINER_NODE_TYPES` fails 8.
- **Real app (private Xvfb, WebKitGTK):** open does not rewrite the row; palette insert with a card selected goes inside (undo restores); with a badge selected it lands after the badge in its parent; Delete on a card removes the subtree, Ctrl+Z restores it and re-selects the card with focus on its Layers row, Ctrl+Shift+Z redoes; Layers ArrowLeft goes child -> parent card; canvas drag of a heading out of a container still reorders and undoes; save, restart and reopen: 0 diffs; Design and Preview agree (nested A2 nodes invisible). 43 baseline fixtures (129 files) byte-identical to `a14-out2`.
- **Cost:** initial JS 110,628 B gz (sum of `gzip -9` of index + jsx-runtime); A2.2 adds no initial JS beyond a few bytes in schema.ts (the editor code is in the lazy chunk).


### A2.3 part 1 — compiler output and canvas for card, alert, separator, skeleton, spinner, aspectRatio, buttonGroup (2026-10-26)

PM decisions on A2.2 applied: no restriction on child kinds (any container accepts any kind); alert is column / gap 8; Layers drag-and-drop is NOT built now (FOLLOWUPS item 31, a candidate for a later polish phase); items 4, 7, 8, 9 accepted as proposed. **Deliberately not done:** `badge` (stays inline-block) and `scrollArea` (no overflow) still draw nothing in the canvas, Preview and export; both wait for the Designer's ruling and are a separate task. `render_node` keeps one early return for exactly those two kinds (`is_deferred_a2`).

**Spec rows covered.** The PM merged parts of A2.3 (card, alert, separator), A2.4 (skeleton, spinner, aspectRatio, buttonGroup) and the canvas half of A2.5 for these seven kinds. Palette tiles, `FIELDS` and the Style panel (the rest of A2.5) are NOT done, so the kinds can only be placed through documents (or Layers / paste); the real-app check seeded them in the database.

**Output (Rust `compiler.rs`).**
- `card`, `alert`, `aspectRatio`, `buttonGroup`: a `div` with `t-<type>`; the layout props (direction, gap, align, justify) now take effect through `render_a2_container` (`display:flex` forced, layout diff against the A2.1 defaults, per-node `.nN` class). `alert` has `role="note"`; `buttonGroup` has `role="group"` and `aria-label` from a non-blank layer name (G4); `aspectRatio` adds `aspect-ratio:16 / 9` (or 4 / 3, 1 / 1, 3 / 2, 21 / 9; the set is the spec's five, 9/16 does not exist: see A2.3 part 2 F7) in the node class and its direct children fill it (`.t-aspectRatio>*{width:100%;height:100%}`).
- `buttonGroup` corners: the first and last child that emits an element get the outer corners of the group radius, the middle ones `border-radius:0px`; `row` rounds left/right, `column` top/bottom. Needs a child radius > 0; a child's own corner longhands from a breakpoint override win. Closed overlays and badge/scrollArea are not counted.
- `separator`: horizontal is a void `<hr>` (PREFLIGHT gives it `border:0`, the default style gives height 1px and the line colour); vertical is `<div role="separator" aria-orientation="vertical">` with `width:1px;height:auto;min-height:16px;align-self:stretch` (minus any key the node set).
- `skeleton`: `<div aria-hidden="true">`. `spinner`: `<span role="status" aria-label=name or "กำลังโหลด">` with an inline svg (viewBox 0 0 24 24, `stroke=currentColor`, aria-hidden, focusable=false); size 12..64 px; CSS animation `t-spin`, switched off under `prefers-reduced-motion`.
- All user values go through `css_safe`; nothing emits `var(`, gradients, `url(` or `!important`; ids come from the per-document counter.

**Shared look source.** `kind-looks.json` gained a top-level `a2` object (`comment`, `texts` {`spinnerLabel`, `spinnerPath`}, `kinds` {`separatorVertical` extras, `spinner` css, `aspectRatio` css}). The A1 `kinds` table is untouched (31 entries). `a2` is required: a file without it, or with a wrongly typed `texts`, is rejected by `parse_kind_looks`. Rust reads it in `compiler.rs` (`a2_kinds`, `a2_texts`); TS reads it in the new `src/lib/a2-looks.ts` (`A2_LOOKS`, `A2_TEXTS`, `A2_STYLESHEET`, `a2Layout`, `ratioCss`, `spinnerPx`, `spinnerLabel`, `cornerDecls`, `groupSlots`, `mergeOver`, ...). The corner table is a shared fixture (`fixtures/a2/corner-table.json`, 10 rows) tested in both languages.

**Canvas.** `node-view.tsx`: `NodeView` is a thin memo wrapper with a `slot` prop; the body is `renderNode`. Containers (card/alert/aspectRatio/buttonGroup) render a `div` with `data-node-type`, the layout style and `renderChildren`, with no `data-cv` and no `t-` class, so the existing selection / drop chrome and drag behaviour are unchanged. Children get a slot override (`fill` for aspectRatio, `g:<dir>:<pos>` for buttonGroup) applied last by `withOver` (`phase6b-view.tsx`, `CanvasImage` and the new `a2-view.tsx` take an `over` prop). `a2-view.tsx` (`A2LeafView`) draws separator / skeleton / spinner with `data-cv`, `t-<type>` and inert children. The horizontal separator gets inline `border-width:0` unless the node set one (Tailwind's `hr` rule would add a 1px top border). One `<style data-a2-looks>` is injected from the lazy editor chunk.

**Tests.** Rust 166 -> 181: `compiler_a23_tests.rs` (15 new: goldens, tags / roles / rules, layout props, vertical separator, corners and the corner table, nested, hostile, css safety, badge / scrollArea, the shared `a2` section, hr / ids, a breakpoint edge, ratio and spinner tables). Four A2.1 / A2.2 tests that asserted "nothing is emitted" were rewritten to the new contract (the seven kinds emit, badge / scrollArea do not). Bun 307 -> 324 (`a2-looks.test.ts`, 17). `tsc --noEmit` 0 / 0. Baseline: the 43 fixtures (129 files) are byte-identical to `a14-out2`. New fixtures: `fixtures/a2/a23-default|overrides|nested|hostile` (.json / .html / .css), generated by `~/agent-tools/p11/a23-tools/gen_fixtures.py`; `A23_BLESS=1 cargo test` regenerates them.

**Unchanged:** `schema.ts` (80ecf8d5...), `defaults.rs` (697e6e0a...; the `#[allow(dead_code)]` on `a2_layout_defaults` is now stale, FOLLOWUPS item 38), `db.rs`, `document-ops.ts`. Initial JS 110,670 B gz (no change; the lazy EditorPage chunk grows by 1.9 kB gz). No new dependency, no manualChunks. The Rust output is static HTML without JS.

**Known edges** are FOLLOWUPS items 32-42.

## 2026-10-26 — Phase 11 A2.3 part 2 (badge + scrollArea) with the Designer's part 1 owed fixes (F1, F4, F7, F8, F9)

**Ruling applied (Designer).** `display` and `overflow` were already among the 20 StyleProps keys; only the TS unions lacked values. `schema.ts`: display union += `"inline-flex"`, overflow union += `"auto" | "scroll"` (type-only, no new key). **Three default sources, kept mirrored:** `schema.ts` `DEFAULT_STYLES`, `defaults.rs` `default_styles`, `fixtures/a2/default-styles.json`: badge `display:"inline-flex"`, scrollArea `overflow:"auto"` (no `is_empty` / version change: no key was added, so no migration and no round-trip change; round-trip tests still pass). The `kind-looks.json` `a2.kinds.badge` entry holds ONLY non-StyleProps declarations (`align-items:center;gap:4px`), never display or overflow (a test enforces it), so an explicit `node.style` value still wins (G1). The TODO at `schema.ts` ~800 and the "Designer ruling pending" note are gone; `#[allow(dead_code)]` on `a2_layout_defaults` is removed (it is used).

**Output.** badge: `<span class="t-badge nN">label</span>` (label through `esc`), rule `.t-badge{display:inline-flex;padding:2px 10px 2px 10px;background-color:#0f172a;color:#ffffff;font-size:12px;font-weight:500;border-radius:200px;align-items:center;gap:4px}`. scrollArea: `div.t-scrollArea` (`display:flex;width:100%;overflow:auto`), layout props like the other containers, `tabindex="0"` always (a scroll container must be keyboard-reachable), `role="region"` + `aria-label` only when it has a name (trimmed `label`, else the trimmed layer name; no role without a name). Orientation: while the resolved overflow is auto/scroll, `vertical` adds `overflow-x:hidden`, `horizontal` adds `overflow-y:hidden`, `both` nothing (`scroll_axis_decls`, `scrollAxes`, shared fixture `fixtures/a2/scroll-orientation.json`). badge and scrollArea are now counted in a buttonGroup's corner slots (`emits_element` only excludes hidden nodes and closed dialog/sheet/drawer; `is_deferred_a2` is deleted). **Canvas parity:** `a2-view.tsx` badge uses the same extras; `node-view.tsx` scrollArea has the axes, region role and name, and NO tabindex on the canvas (canvas focus rule). The canvas container `min-h-[1rem]` is now applied only to EMPTY A2 containers (a real-app find: it let the children of a fixed-height scrollArea shrink on the canvas but not in the export).

**Two real bugs the real-app check found, both fixed with tests and mutants.** (1) `a2_layout_props` had no `ScrollArea` arm, so direction/gap/align/justify of a scrollArea were ignored in the export while the canvas drew them (my first goldens had blessed the wrong output; `a23b-overrides.css` and `a23-layout-edge.css` were re-blessed; mutant R19). (2) The canvas min-height described above (mutant T12).

**Style panel.** The segmented overflow field (offered to section, container, image) gained "auto" labelled "เลื่อน" (a stored `scroll` is valid and exported but has no segment, so none shows selected); a section with `overflow:auto` shows "เลื่อน" selected with the overridden dot (real app). scrollArea is not offered the overflow field (A2.5 owns `FIELDS` for the new kinds).

**F1 (Med).** A buttonGroup child with a breakpoint `borderRadius` exported the shorthand only, so a middle child got that radius on all corners and first/last lost their flat inner corners. `Compiler::node_class` now, for tablet / phone / foldOpen, merges `group_corner_decls(dir, pos, bp_radius)` into the SAME media rule after the shorthand (middle: `border-radius:0px`; a bp radius of 0 or none adds nothing). TS: `breakpointRadiusDecls(slot, bpRadius)` and `effectiveBpRadius` in `a2-looks.ts` mirror it (tested against every rule of the golden `a23-bp-corners`). NOTE: the Design canvas does not draw breakpoint overrides at all (it only edits them in the Style panel segment); tablet / phone only exist in Preview and export, which run the exported CSS, so there is no canvas code to wire; the TS functions are the tested mirror for when it does. Real app, Preview at 750 px wide (tablet rules) and 393 px (phone rules): outer ends round at the breakpoint radius, seams flat.

**F4.** `a2-node-view.check.ts` asserts the canvas alert `role="note"` and the buttonGroup `role="group"` + `aria-label` (mutants P7, F4a).

**F7.** The aspect ratio set is the spec's five (`16/9, 4/3, 1/1, 3/2, 21/9`); 9/16 was never in the compiler (the list in this file's part 1 text was wrong) and is not added. Rust refuses anything else at `parse_document` (closed enum). TS: `ASPECT_RATIOS` (schema.ts) is the same list (a test reads the Rust enum), `isAspectRatio`, and `ratioCss` THROWS `RangeError` on an unknown ratio instead of showing 16/9. A test on each side; mutants F7a / F7b.

**F8.** Horizontal separator with a border width and no colour: the canvas drew #0f172a, the export the UA grey (`hr{color:gray}`). `kind-looks.json` `a2.kinds.separator` extras `color:inherit` (read by both sides; the export puts it in `.t-separator`, the canvas in the inline style under the node's own style). **Goldens changed, each only by `;color:inherit` appended to the `.t-separator` rule:** `a23-default`, `a23-overrides`, `a23-hostile`, `a23-group-mixed`, `a23-layout-edge` (css). `a23-nested` and all `a23b-*` goldens have no separator. The 43 baseline fixtures contain no separator (kind did not exist): all 129 files byte-identical to `a14-out2`. Real app: a container with `color:#ef4444` holding bordered separators: no own colour = red border, `borderColor` = green, own `color` = blue, Design == Preview (mutants F8a, F8b).

**F9.** `parse_kind_looks_checked` returns named errors; `kind_looks()` panics with them (the file is embedded at build time, so a damaged file fails loudly at first use, never as empty looks); `a2Section()` in `a2-looks.ts` throws for a missing `a2`, `a2.kinds`, `a2.texts` or a malformed kind entry. Tests on both sides (mutants F9a, F9b). A `#[cfg(test)] parse_kind_looks` Option wrapper keeps the older A1.3 tests unchanged.

**Tests and numbers.** Rust 181 -> 196; bun 324 -> 348 (`a23c-fixes.test.ts`, `a23b-ruling.test.ts`, `a2-looks.test.ts` and the `a2-node-view.check.ts` child process: it is a plain `.ts` run by `bun run` from `a2-node-view.test.ts` because other test files mock `@tauri-apps/api/core` globally and NodeView cannot be imported under that mock). `tsc --noEmit` clean for tsconfig.json and tsconfig.node.json. New fixtures: `a23b-default|overrides|nested|hostile`, `a23-group-mixed` (buttonGroup with non-button children), `a23-layout-edge` (extreme gap / align), `a23-bp-corners`, `scroll-orientation.json`. Hostile gap/align: Rust closed enums and a u32 gap refuse at parse (tested); the golden holds the largest legal gap 4294967295. Baseline 129/129 identical. Initial JS 110,670 B gz (unchanged). **Mutation checks:** `~/agent-tools/p11/a23b-mut/mut.py` has 50+ mutants over the A2.3 and part 2 code and tests (R1-R19, P1-P8, T1-T12, F1a-F9b); every one is killed, each file restored and md5-verified; survivors found on the way (T4, T5, T10, P7, F4a, F8b) got new tests.

**Process.** Real-app runs use a private Xvfb :88, temp XDG, vite preview on port 1530 (never 1520 or 1420). The vite on :1520 that restarted at 07:26 was mine (pid 476159, from `vite.pid`); it was stopped. Only processes named in my pid files are killed, after a /proc cmdline check.

## 2026-10-28 — Phase 11 A2.3 follow-ups N1/N2/N3 + A2.4 (compiler acceptance for skeleton, spinner, aspectRatio, scrollArea, buttonGroup)

Status: DONE, applied to the live project. Not started: A2.5 (Style panel fields, N5 error element, N7 segment, F2/F3/F5/F13 are in FOLLOWUPS 51/56).

- **N1.** Canvas scrollArea renders `tabIndex={-1}` + `onFocus={redirectFocusToCanvasScope}` (`src/lib/a2-looks.ts`, `node-view.tsx`). A click on it (or a child) puts `document.activeElement` on `[data-kbd-scope="canvas"]`; Delete / Ctrl+Z work after the click. The export keeps `tabindex="0"`. Tests: `a2-node-view.check.ts` (7 checks), `a23c-fixes.test.ts` (N1).
- **N2.** `node_class` re-applies `scroll_axis_decls(orientation, overflow)` inside each breakpoint media rule whose style sets `overflow` (after the shorthand). Golden `a24-scroll-bp`, Rust test `n2_...`, headless test at 1280/900/600. No TS change (the canvas draws no breakpoint overrides).
- **N3.** `.t-scrollArea:focus-visible{outline:2px solid #0077c2;outline-offset:2px}` in `kind-looks.json` `a2.kinds.scrollArea` (extras empty). Exactly ONE line added to seven css goldens, right after `.t-scrollArea{...}`: a23b-default, a23b-hostile, a23b-nested, a23b-overrides, a23-bp-corners, a23-group-mixed, a23-layout-edge (each contains a scrollArea). Their .html goldens and the 43 old fixtures are unchanged (byte-identical to `a14-out2`, 129 files).
- **A2.4.** The five arms already existed; this step adds acceptance: fixtures `a24-kinds`, `a24-scroll-bp`, `a24-hostile` (json/html/css), `compiler_a24_tests.rs` (12 tests: first/middle/last corners with a mini cascade, radius 20 outer corners, role group, skeleton aria-hidden static, spinner svg role=status + aria-label + reduced-motion, aspect-ratio + descendant rule, scrollArea region/tabindex/overflow, N2/N3, hostile text/CSS, only the spinner animates), and `src/lib/a24-render.test.ts` (6 headless-Chromium computed-style tests; skipped with a message when no binary). `schema.ts` and `defaults.rs` UNCHANGED.
- **Counts.** cargo 208 (196 + 12), bun 358 (348 + 10), tsc --noEmit clean (both configs). Initial JS 110,670 B gz (unchanged), all JS 293,558 B gz in 20 chunks. Mutants: 24 new + 50 older, all killed, files restored and md5-verified.
- **Gotcha.** `mut.py` restored files with `copy2` (old mtime), so cargo kept the mutant binary after the last mutant and one test failed spuriously; `touch src-tauri/src/*.rs` fixed it, and `mut.py` now sets the mtime on restore.
- Decisions to confirm: FOLLOWUPS 57.


## 2026-10-28 — Phase 11 A2.4.1: fix for F-A24-1 (N1 broke drag-start on a scrollArea)

Status: DONE, applied to the live project. Not started: A2.5.

- **Bug.** Mousedown on a scrollArea or any node inside one fired, dragstart never did (Chromium 151, both themes). Cause: the synchronous `scope.focus()` in the scrollArea's focus event cancels the pending HTML5 drag. See FOLLOWUPS 58.
- **Fix.** `redirectFocusToCanvasScopeDeferred` (`src/lib/a2-looks.ts`; the old synchronous function is gone): target must be the scrollArea itself, `setTimeout(0)` (not a microtask), focus the canvas scope only if `document.activeElement` is still the scrollArea (keeps double-click inline edit), `preventScroll`. `node-view.tsx` uses `{ tabIndex: -1, onFocus: redirectFocusToCanvasScopeDeferred }`. Export unchanged (`tabindex="0"`). No Rust, `schema.ts` or `defaults.rs` change.
- **Tests.** `a2-node-view.check.ts` asserts the deferred redirect (7 ok); `a23c-fixes.test.ts` has 3 unit tests with an injected defer queue; `a241-n1-browser.test.ts` (5 tests + a "which browser" line) drives real headless Chromium over CDP against the real `DesignCanvas` (`a241-browser-entry.tsx`, test-only, not imported by the app): dragstart on card text / scrollArea child / scrollArea, double-click edit on a heading in a scrollArea, Tab never lands on a scrollArea, click leaves focus on the canvas scope. It skips with a message if `~/.cache/ms-playwright/chromium_headless_shell-*` is absent.
- **Mutants.** 11 new (B1 to B11: synchronous redirect, microtask, guard removed, tabIndex removed / 0, onFocus removed, wrong scope selector, 1500 ms delay, target guard removed, no preventScroll, refocus the scrollArea itself), all killed, files restored and md5-verified, `touch src-tauri/src/*.rs` after. B9 and B10 are killed by unit tests only (equivalent in the real DOM).
- **Real app (WebKitGTK, light and dark).** Clicks on card, spinner, aspectRatio, scrollArea and badge keep `document.activeElement` on the canvas scope (BADFOCUS=0); Delete then Ctrl+Z on the scrollArea works; a drag of a scrollArea child and of the scrollArea itself fires dragstart.
- **Gotcha.** CDP mouse moves while a button is held must carry `button:"left"`, or Chromium never starts the drag.
- Rulings recorded in FOLLOWUPS 59; A2.5 carry list in FOLLOWUPS 60.

## 2026-11-01 — Phase 11 A2.5 (palette + Style panel for the nine A2 kinds; carried Low list F2/F3/F5/F13/N5/N7; Designer B9)

- **Palette:** nine tiles (เพิ่มCard … เพิ่มButton Group) in the Layout group; CommandPalette section "เค้าโครงและสถานะ"; Phase 5B Thai names are search synonyms. Click and drag place every kind (real-Chromium tests `a25-browser.test.ts`); a palette click keeps focus on the tile (PM ruling, FOLLOWUPS 63).
- **Style panel (`StylePanel.tsx` A2Props, `style-fields.ts`):** badge label; separator ทิศทาง แนวนอน/แนวตั้ง (T73/T74); spinner name (T11) + size 12-64; aspectRatio อัตราส่วน (T10); scrollArea แนวเลื่อน แนวตั้ง/แนวนอน/ทั้งสองแนว (T74/T73/T12) + ชื่อสำหรับโปรแกรมอ่านหน้าจอ (T11) + height hint. Overflow for card/alert/aspectRatio/buttonGroup, not scrollArea (PM ruling). N7: "เลื่อน" selected for stored `auto` and `scroll`.
- **F2** canvas-only separator hit area (`A2_CANVAS_ONLY_CSS`, `[data-cv-hit]` on interactive nodes only; never exported). **F3** spacer keeps its own height in an aspectRatio. **F5** label-less input in a buttonGroup matches the export. **F13** Thai Layers names (derived, not stored). **N5** Thai `errorElement` on the editor route (`EditorErrorPage.tsx`, lazy, idle preload). **B9** redirect delay 0 asserted (unit + real Chromium 20 ms after mouseup); B12 Info.
- **No schema change** (schema.ts / defaults.rs untouched). New Rust golden `fixtures/a2/a25-placed.{json,html,css}` + 4 tests (`compiler_a25_tests.rs`).
- **Tests:** cargo 212, bun 430 (38 files), tsc 0/0, baseline 43 fixtures / 129 files identical to a14-out2. Initial JS 110,637 B gz, total 297,064 B gz.
- **Mutation:** 45 mutants (`~/agent-tools/p11/a25-mut/result.json`): 44 killed, 1 survived (B12 rAF, Info by design). Three earlier survivors (F2c, F5c, T7) were killed after adding tests (`a25-leaf-ssr.test.ts`, F5 50% width check, T11 label association).
- **Real app (WebKitGTK, Xvfb :88), light + dark:** dragstart fires for a scrollArea child and the scrollArea itself (both moved); palette Separator tile adds and selects; a click 3 px below the 1 px line selects it with focus on the canvas scope; Delete removes it; Thai Layers names shown.
- **Test infra:** browser tests build their page with a child `bun build` (development mode); several in-process `Bun.build` calls in one `bun test` corrupt each other.

## Phase 11 A2.5.1 (2026-11-01 Asia/Bangkok) — Designer fixes on A2.5

- **Fix 1 (Medium):** the canvas scrollArea gets both `overflow-x` / `overflow-y` and never the `overflow` shorthand (`canvasScrollOverflow`, `a2-looks.ts`; `node-view.tsx`). Cycling แนวเลื่อน no longer leaves it visible/visible. Export unchanged.
- **Fix 2 (Medium):** a bare (label-less) input in a buttonGroup takes the slot corners on the inner `<input>` (first 8-0-0-8, middle 0, last 0-8-8-0), as in the export.
- **Fix 3 (Low):** ปุ่มเรียง is a buttonGroup search synonym.
- **Fix 4 (Low, F13 reversed):** Layers show English names for the nine A2 kinds (`A2_LAYER_NAME` removed; a badge shows "Badge", not its label).
- **Docs:** FOLLOWUPS 62 groups corrected (spec §9), item 64 added (spec §8 strings คุณสมบัติ / ตั้งความสูงเพื่อให้เลื่อนได้ for the Designer; F2 ±4 px neighbour Info).
- No schema change; Phase 11 B not started.

## Sub-phase A2 CLOSED (2026-11-01 Asia/Bangkok)

- Designer accepted A2.5.1; A2 is closed with the nine kinds. Badge shows 'Badge' in Layers (accepted). Spec md5 d0d5fc6ad5732e07a048ca440241363d (T13/T14 added by the Designer).
- Carried to B1 (LOW): FOLLOWUPS 65 (labelled input corners in a buttonGroup), 66 (one Layers naming rule for all kinds).
- Next per D7 (strictly A then B): **A3 Forms** (spec §9 A3, A3.1–A3.5), not B1. Not started.

## Phase 11 A3.1 (2026-11-01 Asia/Bangkok) — checkbox kind

- New kind `checkbox` (schema.ts / defaults.rs mirrored, version-4 marker, no version bump). Shared look `kind-looks.json` `a3` (Rust `a3_kinds`, TS `src/lib/a3-looks.ts`); canvas `src/components/editor/a3-view.tsx` (editor chunk, lazy). Panel T21 ป้ายกำกับ / T20 ติ๊กอยู่. Goldens `src-tauri/src/fixtures/a3/a31-{checked,unchecked}.*`; tests `compiler_a31_tests.rs`, `a31-units.test.ts`, `a31-browser.test.ts`.
- PM rulings for A3 recorded in FOLLOWUPS 68; A3.1 notes in 69.
- A3.1 NOT ACCEPTED by the Designer; fixes in A3.1.1 below.

## Phase 11 A3.1.1 (2026-11-01 Asia/Bangkok) — Designer fixes on A3.1

- Forced-colors native box + system tick, border `{{muted}}` #64748b, `aria-label="Checkbox"` fallback, keyword เช็คบ็อกซ์ (FOLLOWUPS 71). Rulings in 70; changed ruling 6 (switch default name 'Switch' in A3.2) in 68 / 66. Known limits 72 / 73.
- Next: A3.2 (done below).

## Phase 11 A3.2 (2026-11-01 Asia/Bangkok) — switch restyle

- Switch export is label > input.sw + span.sw-track > span.sw-thumb + span label; look in `kind-looks.json` `a3.kinds.switch` (moved out of the base table, now 30 kinds); canvas `SwitchView` in `a3-view.tsx` (lazy). Forced colours, reduced motion, #0077c2 ring, #64748b borders. New switch default label 'Switch'; stored docs unchanged, no schema change. Tests `compiler_a32_tests.rs`, `a32-units.test.ts`, `a32-browser.test.ts`; goldens `fixtures/a3/a32-switch.*`. Baseline `~/agent-tools/p11/a3-out` (only switch fixtures differ from a14-out2; list in `a3-out-changed.txt`). FOLLOWUPS 74; 66/69/73 updated.
- **Applied to live 2026-11-03** (22 files; `a32-changed-md5.txt`, backups `a32-backup/`). Verified: cargo 227/0, bun A3.2 + focused suite green (a25-panel alone 15/0; full-suite a25-panel timed out under load — flaky, not A3.2), tsc 0/0, vite build OK, initial JS 108.65 + 3.33 = **111.98 kB gz**, total JS ~297 kB gz. Mutants 31/31 (`a32-mut/result.json`). schema.ts / defaults.rs unchanged.
- Next: A3.3 (done below).

## Phase 11 A3.3 (2026-11-03 Asia/Bangkok) — field kind

- New version-4 container kind `field` {label, description?, error?, children, layout sparse}. Export: `<div class="t-field">` + `<label for>` when first child is input/textarea/checkbox/select (compiler `control_attrs` + `uid("f")` → id / for / aria-describedby); unpaired → `span.t-field-label` (never an orphan label). Looks in `kind-looks.json` `a3.kinds.field` (column gap 6; label 14/500; desc `#64748b`; error `#b91c1c`). Canvas: div root, always `span.t-field-label` (inert; no real `<label for>`). Palette Forms tile "Field"; panel T21 ป้ายกำกับ + คำอธิบาย / ข้อผิดพลาด. Layers FormInput icon. 53 kinds / 52 palette tiles.
- Tests: `compiler_a33_tests.rs` (9; goldens `fixtures/a3/a33-{input,textarea,checkbox,select,button,empty}.*`), `a33-units.test.ts`, `a33-browser.test.ts` (Chromium). Plumbing counts updated (a21 / a31 / a2-plumbing / palette-meta / containers).
- Verified: cargo **236/0**, bun A3.3 browser+units 17/0 + focused plumbing 70/0, tsc 0/0, vite build OK, initial JS **108.65 kB gz** (unchanged; EditorPage chunk absorbs the field view). FOLLOWUPS 75; ruling 68.4 implemented.
- Next: A3.4 (done below).

## Phase 11 A3.4 (2026-11-03 Asia/Bangkok) — select = Native Select (no new kind)

- A1.2 / FOLLOWUPS 68.2–68.3: existing `select` already exports `<select>`; **no `nativeSelect` kind**. Tile relabelled **Native Select** (`NODE_TYPE_LABEL`); search synonyms include `native select` / เนทีฟ. Panel T22: multiline options (one per line); radio keeps per-row editors. Cap **100** options (TS `parseSelectOptions` / `setPhase6bProp` + Rust `MAX_SELECT_OPTIONS` at export). Escape of `<`/`&` in option value + text proven (already via `esc()`).
- Tests: `compiler_a34_tests.rs` (3; golden `fixtures/a3/a34-escape.*`), `a34-units.test.ts`, `a34-browser.test.ts`. schema / defaults enums unchanged (53 kinds).
- Verified: cargo **239/0**, bun a34 units+browser + palette-meta green, tsc 0/0. FOLLOWUPS 76.
- Next: A3.5 (done below).

## Phase 11 A3.5 (2026-11-03 Asia/Bangkok) — input.suggestions → datalist

- Additive sparse prop `input.suggestions?: string[]` (TS + Rust `skip_serializing_if` empty). Export: non-empty → `<input list="dlN">` + `<datalist id="dlN"><option value=…>` (`uid("dl")`, unique per page); empty/absent emits neither. Values escaped via `esc()`; list capped at 100 (same as select). Panel T23 **ตัวเลือกคำแนะนำ** (multiline, one per line). Canvas unchanged (inert; no datalist chrome).
- Tests: `compiler_a35_tests.rs` (6; golden `fixtures/a3/a35-suggestions.*`), `a35-units.test.ts`, `a35-browser.test.ts`.
- Verified: cargo **245/0**, bun a35 units+browser green, tsc 0/0. FOLLOWUPS 77. **RAM / chunk close-out (ruling 68.7) not measured in this step** — still owed on the real app vs 199.5 MB baseline.
- Next: pre-A4 list editors (done below), then **A4**.

## Phase 11 pre-A4 (2026-11-03 Asia/Bangkok) — growable string lists + pair lists in the panel

- **String lists:** Radio shares select T22 (`options`); toggleGroup / pagination / dropdownMenu use `items` (one line per entry). Cap 100; active clamped on shrink.
- **Pair lists:** tabs / accordion → `ป้าย | ข้อความ` lines. **breadcrumb / navigationMenu:** growable rows with label + `HrefField` (type URL **or** click เลือกหน้า; เพิ่มรายการ / ลบ) — page picker kept (not pipe-textarea). Shared `HrefField` also used by button/link. Cap 100; tabs/accordion index clamped.
- Tests: `list-editors*.test.ts`, `pair-editors*.test.ts`, `href-pairs-browser.test.ts`. FOLLOWUPS 78.
- Next: menubar href (done below), then Phase 11 **A4** or Designer RAM pass.

## Phase 11 menubar href (2026-11-03 Asia/Bangkok) — shadcn nested menus + page links

- **Why:** Flat `ป้าย | ข้อความ` could not answer "หน้าแรก goes where?" or "สร้างไฟล์ใหม่ does what?" — text was inert. shadcn Menubar is menus of items; items can be links (`asChild`).
- **Shape:** `MenubarMenu { label, items: LabelHref[] }`. Export: `<details><summary>…</summary><div><a|span>…</div></details>`. Empty href = span; set href / เลือกหน้า = navigate in the static zip. No checkbox/radio/shortcut/submenu (no script). Legacy `{label,text}` still opens (text → one inert item).
- **Panel:** `MenubarEditor` (add menu / add item / HrefField / ลบ). Defaults File{New Tab, New Window} Edit{Undo, Redo}.
- Tests: a13 legacy+href, `pair-editors*.test.ts`. FOLLOWUPS 79.
- Next: shadcn props audit (done below).

## Phase 11 shadcn props audit (2026-11-03 Asia/Bangkok) — static property parity

- Audited placeable kinds vs shadcn docs/examples; closed high-value **static** gaps (no script):
  - **dropdownMenu** / **pagination**: `items: LabelHref[]` + `HrefField` / เลือกหน้า (legacy string items still load).
  - **sheet** / **drawer**: `side` = top|right|bottom|left (drawer default bottom).
  - **slider**: optional min/max/step → `<input type="range">`.
  - **empty**: optional actionLabel + actionHref CTA.
  - **alertDialog**: optional confirmHref / cancelHref (emit `<a class=ok|no>` when set).
- OUT unchanged: JS overlays, hover, flyouts, variants-as-props, A4 table/list/icon.
- Tests: a13 (33) green + blessed all-kinds; bun list/pair/href-pairs; tsc clean. FOLLOWUPS 80.
- Next: tabs add UX (done below), then **A4** or Designer RAM (ruling 68.7 still owed).

## Phase 11 tabs add UX (2026-11-03 Asia/Bangkok)

- Tabs/Accordion panel: row editor + **เพิ่มแท็บ** / **เพิ่มรายการ** (no more `ป้าย | ข้อความ` textarea). FOLLOWUPS 81.
- Next: **Phase 12 Vite export** (A4 paused).

## Phase 12 Vite Project Export (2026-11-03 Asia/Bangkok) — shipped (v1)

- **Decision:** ส่งออก = Vite+React+**TypeScript (TSX)**+RR+TW project zip (bun). HTML zip no longer primary. A4 paused. Next.js later.
- Spec: `docs/PHASE-12-SPEC.md`. Template: `export-templates/vite-react/` (`.tsx` / `.ts` only).
- Generator: `src-tauri/src/export.rs` embeds the scaffold, writes `src/data/site.json` (scrubs `visible:false`), copies images to `public/assets/`.
- Acceptance: `cargo test export_` (Vite zip shape, two-page site.json, public assets); template `bun install && bun run build` exits 0.
- Preview HTML compiler kept for in-app Preview.
- FOLLOWUPS 82.

## Phase 11 A4.1 List (2026-11-04 Asia/Bangkok) — shipped

- New leaf kind `list`: `{ items: string[], ordered, marker: disc|decimal|check|none }`, cap 50.
- Palette Text & media; panel T24 lines + T25 ordered + T26–T28 marker segmented.
- Export: `<ul>`/`<ol>` + `t-list--{marker}`; check via masked data: SVG (no text glyph); `role=list` for check/none (G5).
- Shared looks: `kind-looks.json` `a4.kinds.list` + `a4-looks.ts` / `a4-view.tsx`.
- Tests: `compiler_a41_tests` (4 marker goldens), `a41-units.test.ts`. Counts: ALL_TYPES 54, palette 53.

## Phase 11 A4.2 Table (2026-11-04 Asia/Bangkok) — shipped

- New leaf kind `table`: `{ columns, rows, caption?, headerRow, striped }`, cap 20×100.
- Palette Data; panel (superseded by A4.3 dialog for grid editing).
- Export: `.t-tablewrap` region + `.t-table` / optional caption / thead / tbody; escaped cells; striped class.
- Shared looks: `kind-looks.json` `a4.kinds.table` + `TableView` in `a4-view.tsx`.
- Tests: `compiler_a42_tests` (4 goldens incl. 20×100 smoke), `a42-units.test.ts`. Counts: ALL_TYPES 55, palette 54.

## Phase 11 A4.3 Table editor (2026-11-04 Asia/Bangkok) — shipped

- Lazy chunk `table-editor.tsx` (no whenIdle preload). Panel button **แก้ไขตาราง**.
- Dialog: caption / headerRow / striped (T29a–c), add/remove row/col (T30–T33), grid Tab/Enter nav, paste TSV, T35 toast at 21st column, one undo on บันทึก.
- Helpers in `table-model.ts` (`pasteTsvAt`, add/remove). `setTableEditorCommit` / `writeTableEditorCommit`.
- Tests: `a43-units.test.ts`.
- Next: **A4.4 icon-paths**.

## Phase 11 A4.4 icon-paths (2026-11-04 Asia/Bangkok) — shipped

- Curated **80** Lucide icons as path data only in lazy chunk `icon-paths` (`src/lib/icon-paths.ts`), generated by `scripts/gen-icon-paths.mjs` from `lucide-react` (aliases resolved).
- Helpers: `iconSvgMarkup` / `iconInnerSvg` / `isIconName` / `getIconPaths`; `IconPathsLazyAnchor` for `lazyNamed` (StylePanel wires import, **no** `whenIdle` preload).
- Dist: `icon-paths-*.js` ≈ 12.2 kB / **4.0 kB gz** (≤ 12 kB gz); absent from entry `index-*.js`; path samples only in that chunk.
- `THIRD-PARTY-NOTICES.md` at repo root: Lucide ISC + Feather MIT + full curated list + 38 Feather-derived names.
- Tests: `a44-units.test.ts` (SVG goldens per icon, notices, size, entry isolation).
- Fixed pre-existing `TableView` `mergeOver(css)` arity (now `style={css}`).
- Next: **A4.5 icon kind + picker**.

## Phase 11 A4.5 icon kind (2026-11-04 Asia/Bangkok) — shipped

- Leaf kind `icon`: `{ name, label?, size, strokeWidth }` (defaults `star` / 24 / 2; size 12–128, stroke 1–4).
- Palette Text & media; panel T36 search picker (grid roving focus) + T38b label; T37/T38 via FIELDS.
- Canvas `IconView` lazy-loads `icon-paths` chunk; colour = `currentColor`.
- Compiler emits inline SVG (`aria-hidden` or `role=img`); unknown name → star; counts ALL_TYPES **56**, palette **55**.
- Vite export template: `render-node` `case "icon"` + bundled `icon-paths.ts`.
- Tests: `a45-units`, `compiler_a45_tests` (goldens a45-star / a45-labelled).
- Next: **A4.6 export notices**.

## Phase 11 A4.6 export notices (2026-11-04 Asia/Bangkok) — shipped

- `build_zip` adds `THIRD-PARTY-NOTICES.txt` **iff** any page has an `icon` node (Lucide LICENSE text + used names / Feather subset).
- Tests: `a46_third_party_notices_only_when_icon_present` + existing export zip asserts no notices without icons.
- A4 (table / list / icon) complete.

## Phase 11 A5.1 carousel (2026-11-04 Asia/Bangkok) — shipped

- Container kind `carousel`: children = slides; `slidesPerView` 1–4 (sparse, default 1); layout defaults row / gap 16.
- Export + canvas: `.t-carousel` region (`aria-roledescription=carousel`, tabindex 0) + `.t-carousel__slide` wrappers with `flex:0 0 calc((100% - gap·(n−1))px / n)` and scroll-snap.
- Panel T39 note + T40 slidesPerView; palette Data.
- Tests: `a51-units`, `compiler_a51_tests` (n=1/2/3 goldens). Vite `render-node` carousel arm.

## Phase 11 A5.3–A5.5 chart + calendar (2026-11-04 Asia/Bangkok) — shipped

- Leaf `chart`: bar|line|area SVG; TS↔Rust goldens; lazy `chart-render` + `chart-editor` (T41–T48).
- Leaf `calendar`: static month `<table class="t-calendar">`; Thai names; BE/CE; weekStart 0|1; selectedDay `aria-current=date`; lazy `calendar-render`.
- Chunk budget: chart-render ~1.6 kB gz + calendar-render ~1.2 kB gz (≤ 8 kB combined).
- Counts: ALL_TYPES **59**, palette **58**.
- Tests: `a53/a54/a55-units`, `compiler_a53/a55_tests`.

## Phase 11 A5.6 chunk check (2026-11-04 Asia/Bangkok) — shipped (chunk); RAM owed

- Measured from `dist/assets` after `bun run build`: `chart-render` ≈ 1.6 kB gz + `calendar-render` ≈ 1.2 kB gz (**≈ 2.8 kB** ≤ 8 kB §5.1).
- Absent from entry graph; no `whenIdle` preload. Tests: `a56-units`.
- **RAM PSS** (§5.1 A: +2 MB vs same node-count of old kinds) still needs the real Tauri app / `RAM-BASELINE` method — not run in this agent session (same class as A3.5 owed item).
- **A5 batch complete** pending that RAM measurement.


