# Web Builder — Design / Preview UX Expansion

**Product:** Web Builder (Tauri desktop)  
**Depends on:** Phase 1 shell (`docs/PHASE-1-UI-SPEC.md`) — already implemented  
**Scope:** Distinct **Design** vs **Preview** modes (Dreamweaver / Word / VS Code–like). Spec only.  
**Hard constraints:** Do **not** change `src/schema.ts` for animations/effects. Effects remain a **future** note. Keep load fast and UI light. Thai-first short copy.

---

## 0. Intent

| Mode | User mental model | Analogy |
|------|-------------------|---------|
| **Design** | Edit structure & styles on a working canvas | Dreamweaver Design / VS Code editor |
| **Preview** | See the page as visitors would; no editing chrome | Dreamweaver Preview / Word Reading / browser |

One document (`PageDocument` in `projects-store.openDocument`). Two presentations. Mode is **UI state**, not a second file format.

---

## 1. Mode model (state)

Add to `editor-store` (or a tiny `ui-store` if preferred):

```ts
type EditorMode = "design" | "preview";

// suggested fields
mode: EditorMode;           // default "design"
setMode: (m: EditorMode) => void;
previewStatus: "idle" | "loading" | "ready" | "error";
previewError: string | null;
setPreviewStatus: (...) => void;
```

Rules:
- Entering editor → always **Design**.
- Leaving editor (back to list) → reset to Design + clear preview status/error.
- Switching Design → Preview: start preview pipeline (see §4); do not lose selection in store (restore when returning to Design).
- Switching Preview → Design: tear down preview surface; restore 3-pane chrome; re-apply `selectedNodeId` highlight when canvas exists (Phase 2).
- Dirty document: Preview uses **current in-memory** document (including unsaved edits). Do not force save first. Optional subtle dirty hint in Preview top bar is enough.

**No schema change** for mode.

---

## 2. Top bar — mode switch

Extend `EditorTopBar` (keep `h-12`, existing back / title / save).

### Layout (Design & Preview shared chrome)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [← โปรเจกต์] │ Title          │  [ ออกแบบ | ตัวอย่าง ]     │ [บันทึก*] │
└──────────────────────────────────────────────────────────────────────────┘
```

| Control | Spec |
|---------|------|
| Mode control | Segmented control (preferred) or `Tabs`-like pair, center-right of top bar |
| Labels | **ออกแบบ** = Design · **ตัวอย่าง** = Preview |
| Component | Prefer shadcn-style toggle group / two `Button`s in a `rounded-lg border` cluster; `size="sm"`; active = `variant="secondary"` or `bg-accent`; inactive = `ghost` |
| Icons (optional) | Design: Lucide `PenLine` · Preview: `Eye` — icon + label at ≥960px; icon-only below if cramped |
| Keyboard | Optional later: `Ctrl+E` cycle modes — not required for first cut |
| Save | Visible in **both** modes (same dirty/`บันทึก*` behavior). Preview does not hide save. |
| Title | Editable in Design. In Preview: **read-only** text (same styling, no input) to avoid accidental edits while “reading.” |

Place the mode switch **between** title and Save so it stays discoverable without crowding the back control.

---

## 3. Layout differences

### 3.1 Design mode (default) — keep Phase 1

Unchanged from Phase 1 / current implementation:

| Zone | Width | Content |
|------|-------|---------|
| Top bar | full / `h-12` | back, title (edit), mode switch, save |
| Left | `w-56` | Layers / outline |
| Center | `flex-1` | Canvas — `DesignCanvas` (Phase 2 live canvas) |
| Right | `w-72` | Style panel |

Sidebar collapse (`isSidebarOpen`) applies **only in Design**.

### 3.2 Preview mode — reading surface

Hide editing chrome; maximize the page:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP BAR (mode switch + read-only title + save)                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│              PREVIEW STAGE (full remaining viewport)                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

| Change | Spec |
|--------|------|
| Left layers | **Hidden** (unmount or `hidden`; do not keep focusable) |
| Right styles | **Hidden** |
| Center | Expands to full width under top bar |
| Canvas editor chrome | Hidden (selection outlines, drag handles — Phase 2) |
| Preview stage | Single surface; see §4 |

Optional Preview toolbar strip **inside** stage top (not a second app chrome): width presets **เดสก์ท็อป / แท็บเล็ต / มือถือ** (Desktop 100% / 768 / 390). Phase 1.5 nice-to-have; can ship with Desktop-only first.

Do **not** open an external OS browser for Preview in v1 — stay in-app for speed and offline.

---

## 4. How Preview relates to the Rust compiler (Phase 3)

> **Status (shipped, Phase 3a/3b):** Preview is the compiler preview. `PreviewStage.tsx` sends the
> in-memory document (unsaved edits included) to the Rust command `compile_preview(document, projectId?)`
> (`src-tauri/src/compiler.rs`) and shows the returned HTML in an `iframe` with `srcDoc` and
> `sandbox="allow-same-origin"`. There is **no** `allow-scripts`; same-origin only lets the parent read the
> content height to auto-size the frame. Preview output has inert links and a strict CSP. It recompiles
> when you enter Preview and 200 ms after document changes; stale responses are dropped. The frame uses
> the canvas width (`max-w-3xl`). `PreviewStub.tsx` and its footnote have been removed.
> **Export (3b):** the top bar's **ส่งออก** button opens the save dialog (`tauri-plugin-dialog`), then
> `export_project(projectId, destPath, document?)` writes a zip containing `index.html` (linking
> `styles.css`), `styles.css`, and `assets/.keep`. Export uses the in-memory document, the same one
> Preview shows; the saved SQLite copy is used only when no document is passed. Images are placeholders
> until the asset pipeline lands. The stub notes below are kept for history.

### Pipeline (conceptual)

```
PageDocument (TS, in memory)
        │
        ▼
  preview adapter  ──Phase 3──►  Tauri command (e.g. compile_preview / render_html)
        │                              │
        │                              ▼
        │                         HTML (+ CSS) string or temp asset
        ▼
  Preview surface (iframe srcDoc / webview)
```

| Phase | Preview behavior |
|-------|------------------|
| **Now → Phase 2** (pre-compiler) | **Client stub preview**: render a **read-only** React pass of the document tree (same node types as schema: page/section/container/heading/text/image/button/link/spacer) inside the preview stage. No Tauri compile yet. Label honestly if needed (see empty/loading). |
| **Phase 3** | Replace stub with **compiler preview**: call new Rust command; show returned HTML in sandboxed `iframe` (`sandbox` without `allow-scripts` unless product later needs JS). Prefer `srcDoc` or blob URL from command result. |
| **Future (post v1.1)** | CSS transitions / motion / effects — **out of schema for now**. Spec them only as “Preview may later play motion; Design shows static computed styles.” Do not add animation fields to `schema.ts` in this workstream. |

### Design vs Preview fidelity

| Concern | Design | Preview |
|---------|--------|---------|
| Source of truth | Same `PageDocument` | Same document snapshot at switch (live updates: see below) |
| Interaction | Select, edit (Phase 2) | Click-through optional later; v1 = **non-editing** (links may be inert or open safely inert) |
| Styles | Authoring controls + canvas chrome | Visitor view: no selection rings, no empty drop targets |
| Live edits while in Preview | If user somehow changes doc (e.g. save from elsewhere): refresh preview. For v1, document only changes via Save title in bar — refresh stub/compiler output on `openDocument` change. |

### Suggested Phase 3 command (name only — DEV/Rust owns shape)

- `compile_preview(document: PageDocument) -> { html: string }` or write temp file + path  
- Errors → `previewStatus: "error"` with short Thai message  
- Must not mutate `schema.ts` contract; compiler consumes v1.1 as-is

---

## 5. Preview surface UI

### Ready state

- Outer: `flex-1 min-h-0 bg-muted/40 overflow-auto p-6 flex justify-center`
- Frame: `bg-card border border-border rounded-lg shadow-sm w-full max-w-5xl min-h-full` (or width preset)
- Inner: stub tree or iframe filling the frame (`min-h-[480px]`)
- No dotted “editor” grid in Preview (that stays Design-only)

### Loading

- Keep top bar interactive (user can switch back to ออกแบบ)
- Center: spinner or skeleton page blocks + copy **กำลังสร้างตัวอย่าง…**
- `previewStatus: "loading"` while stub builds (usually instant) or compiler round-trip runs

### Empty / edge

| Case | UI |
|------|-----|
| Document has only empty page / no children | Soft empty: **หน้ายังว่าง** · hint **กลับไปที่ออกแบบเพื่อเพิ่มเนื้อหา** + ghost button **ออกแบบ** (switches mode) |
| Project failed to open | Do not enter Preview; editor already shows error — mode switch disabled until document ready |
| Compiler error (Phase 3) | Inline alert in stage: **สร้างตัวอย่างไม่ได้** + `previewError` one line + **ลองอีกครั้ง** button |

### Stub honesty (pre–Phase 3)

If stub ≠ final compiler HTML, optional quiet meta under stage: `text-xs text-muted-foreground` — **ตัวอย่างในแอป (คอมไพเลอร์ในเฟส 3)**. Remove that line once Phase 3 ships.

---

## 6. Design mode — Phase 2 canvas awareness

Phase 2 has landed: the Design center renders `DesignCanvas` (`src/components/editor/DesignCanvas.tsx`), an interactive canvas. The old `CanvasPlaceholder` has been deleted. Preview must **not** reuse selection/drag overlays; Preview originally rendered the shared `NodeView` with `editable: false` via `PreviewStub`; since Phase 3 it renders compiled HTML in an iframe instead, so `PreviewStub` has been deleted.

Shared helpers (encourage DEV structure, not schema change):

- `renderNodeView(node, ctx)` used by canvas (editable) and stub preview (`editable: false`)
- Or Phase 3 drops React stub entirely for iframe HTML

Selection:
- Design: `selectedNodeId` drives layers + style panel  
- Preview: ignore selection for visuals; keep value in store for return

---

## 7. Copy sheet (Thai-first)

| Sense | Copy |
|-------|------|
| Design mode | ออกแบบ |
| Preview mode | ตัวอย่าง |
| Preview loading | กำลังสร้างตัวอย่าง… |
| Preview empty | หน้ายังว่าง |
| Preview empty hint | กลับไปที่ออกแบบเพื่อเพิ่มเนื้อหา |
| Preview compile error | สร้างตัวอย่างไม่ได้ |
| Retry | ลองอีกครั้ง |
| Stub footnote (temp) | ตัวอย่างในแอป (คอมไพเลอร์ในเฟส 3) |
| Width desktop | เดสก์ท็อป |
| Width tablet | แท็บเล็ต |
| Width mobile | มือถือ |

---

## 8. Components / files (suggested)

```
src/stores/editor-store.ts          # + mode, previewStatus, previewError
src/components/editor/EditorTopBar.tsx   # mode switch; title read-only in preview
src/components/editor/ModeSwitch.tsx     # NEW
src/components/editor/PreviewStage.tsx   # NEW — loading/empty/error/ready
src/components/editor/PreviewStub.tsx    # (deleted in Phase 3 — replaced by compile_preview + iframe)
src/pages/EditorPage.tsx            # branch layout on mode
```

Add shadcn pieces only if missing: `toggle-group` (or reuse Button cluster), `alert` for errors.

---

## 9. Performance

- Do not keep iframe + full Design canvas both mounted if avoidable; prefer switch mount to save memory (Tauri/low resource priority).
- Debounce compiler preview (Phase 3) ~150–300ms after doc changes if live-updating later.
- Stub preview: pure function from `openDocument`; memoize by doc reference.

---

## 10. Out of scope (explicit)

- Animations / effects / timeline (future; **no `schema.ts` change now**)
- External default browser Preview
- Multi-page site preview
- Device frame bezels / network throttling
- Implementing React unless PM asks — **this doc is the deliverable**

---

## 11. Acceptance checklist

- [ ] Top bar shows **ออกแบบ | ตัวอย่าง**; default Design on editor enter
- [ ] Design keeps 3-pane shell (layers + canvas + styles)
- [ ] Preview hides both side panels; stage fills width
- [ ] Title editable only in Design; read-only in Preview
- [ ] Save still available in Preview
- [ ] Loading / empty / error states use copy above
- [x] Pre–Phase 3: in-app stub from `PageDocument`; footnote OK (superseded)
- [x] Phase 3 seam: Rust compile → iframe; no schema break (shipped 3a; export 3b)
- [ ] Effects/animations mentioned only as future
- [ ] `src/schema.ts` untouched

---

## 12. Phasing relative to roadmap

| Order note (pra sui) | This doc |
|----------------------|----------|
| Phase 1 shell | Done — baseline |
| Phase 2 canvas | Design mode consumes canvas; Preview stays non-edit |
| Phase 3 compiler | Swap stub → compiled HTML preview |
| C → D → A | **D = this Design/Preview UX spec** |

**Handoff:** Ping Project Manager when implementing; Designer available for visual pass after first `tauri dev` with the mode switch live.
