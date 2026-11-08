# Dreamweaver UX mapping (Web Builder)

**Product:** Web Builder (Tauri desktop)  
**Status:** mapping v1 — 2026-11-08 (Asia/Bangkok)  
**Audience:** PM / Designer / DEV — decide chrome slices; not a schema change.  
**Related:** `DESIGN-PREVIEW-UX.md`, `PREVIEW-CODE-VIEW-SPEC.md`, `UI-REFRESH-SHADCN.md`, `DEVICE-PREVIEW-SPEC.md`, `PHASE-11-SPEC.md` §9.A–E.

## 0. Intent

Map **Adobe Dreamweaver–style** mental models (Design / Preview / Code, Insert, Properties, Files·Assets, Library) onto **what Web Builder already ships** after Phase 11 A–E, and list the **next chrome slices** that close the gap without waiting for deferred shadcn placeable nodes (`command`/`toast`/`sidebar`/`context-menu` as page nodes — §11 D3).

**Non-goals of this doc**
- Pixel-clone Dreamweaver or Adobe branding.
- Port every shadcn docs component as a placeable node.
- Implement Code View / Split / Vite Preview Tier here (those stay owned by `PREVIEW-CODE-VIEW-SPEC.md`).

**Rule of thumb:** Dreamweaver UX is mostly **chrome and mode workflow**. Missing interactive page widgets affect the **Insert palette**, not whether Design↔Preview feels like DW.

---

## 1. Metaphor map (DW → Web Builder)

| Dreamweaver idea | Web Builder today | Status | Notes |
|---|---|---|---|
| **Design view** | Mode `ออกแบบ` + 3-pane canvas (`EditorPanes`: palette/layers · canvas · style) | **Shipped** | Selection, drag, inline edit, undo. |
| **Live / Preview** | Mode `ตัวอย่าง` + device toolbar (`DeviceToolbar`) + Tier 1 runtime frame | **Shipped** | S2: the export template's renderer in a scripted sandbox, same `site.json`/CSS as ส่งออก; `compile_preview` only as fallback. Tier 2 (Vite) is S6–S9. |
| **Code view** | Mode `โค้ด` + lazy `CodeView` (`list_export_files` + CodeMirror 6) | **Shipped (DW-M3 / S3 first slice)** | Read-only zip file list; no Split / folder / edit-round-trip yet. |
| **Split Design\|Code** | Mode `แยก` + `SplitStage` (canvas \| Code or Preview) | **Shipped (S3)** | Orientation + divider persist in app settings. |
| **Insert bar / Objects** | `ElementPalette` + search + Ctrl+K `CommandPalette` | **Shipped** | English tile names; Thai keywords. |
| **Library / Snippets / Spry** | `BlocksFlyout` (บล็อก) + registry (33 blocks) | **Shipped** | Non-modal flyout; insert / ⋯ / drag. Closest DW “Library” analogue. |
| **Properties inspector** | `StylePanel` (+ motion, states, presets, effects) | **Shipped** | Dense panel; Phase 11 B/C/E live here. |
| **CSS Styles / Rules** | Style keys + breakpoints (Preview) + presets | **Partial** | No project design tokens / dark export theme (§11 D1). Breakpoints checked in Preview, not Design canvas (§3.5 PHASE-11). |
| **Files / Assets** | Project list + per-project assets (existing asset pipeline) | **Partial** | No full DW-like site tree / multi-file site map in editor chrome. |
| **Behaviors / Timeline** | Node `motion` (entrance) + states hover/press | **Partial** | CSS-only; no JS behaviors panel. |
| **AP Elements / Layers panel** | `LayersPanel` tree | **Shipped** | Keyboard listbox model; no panel DnD reorder (optional later). |
| **Application bar (File / Edit / View)** | `EditorMenubar` (ไฟล์ / แก้ไข / มุมมอง) + Ctrl+K | **Shipped (DW-M2)** | Mirrors existing save/export/undo/modes/theme only. |
| **Databases / Server behaviors** | Mode `ฐานข้อมูล` (Phase 10) | **Shipped** | Third mode — beyond classic DW HTML; keep separate from Design/Preview story. |
| **Templates (.dwt)** | Page templates via blocks/pages insert | **Partial** | Not locked DW templates; blocks dissolve into ordinary nodes (Phase 11 goal). |

---

## 2. What already feels “DW enough” (do not re-litigate)

1. **Design vs Preview as modes** — top-bar `ModeSwitch`, Preview hides edit chrome, device frames in Preview.
2. **Paper canvas + inspector** — page is the bright surface; style/presets/motion on the right.
3. **Insert + Library** — palette for atoms; Blocks flyout for marketing sections (hero, pricing, …).
4. **Save / Export / dirty guard** — unsaved dialog; export zip (Phase 12 Vite).
5. **Command palette** — power-user insert (DW had fewer shortcuts; this is a modern plus).

Phase 11 A–E closed the **content** gap for marketing sites (components, paint, presets, blocks, motion). Remaining DW gaps are mostly **chrome modes** (Code / Split) and **discoverability** (menubar), not more shadcn placeable kinds.

---

## 3. Gap list (prioritized)

### P0 — User-visible DW parity (own specs already approved)

| ID | Gap | Owner spec | Why DW |
|---|---|---|---|
| DW-P0-1 | **Code view** (read-only zip file list + highlighter) | `PREVIEW-CODE-VIEW-SPEC` | **Done (DW-M3 first slice).** Remaining S3: Split chrome / เปิดโฟลเดอร์. |
| DW-P0-2 | **Preview = export renderer** (Tier 1 prebuilt runtime) | same | **Done (S2).** Preview now runs the export's own React renderer in a sandboxed frame; `compile_preview` is the fallback only. |
| DW-P0-3 | **Split** Design \| Code (or Preview) | same | **Done (S3).** |

Do **not** start these inside Phase 11 handoff chrome tweaks — they are a dedicated program with RAM budgets (+15–30 MB Tier 1).

### P1 — Discoverability / chrome polish (small, no schema)

| ID | Gap | Proposal | Effort |
|---|---|---|---|
| DW-P1-1 | No **File / Edit / View** menubar | **Done (DW-M2):** `EditorMenubar` on TopBar — ไฟล์ / แก้ไข / มุมมอง | — |
| DW-P1-2 | Mode labels vs DW vocabulary | Keep Thai **ออกแบบ / ตัวอย่าง**; document English glossary Design / Preview / Code for docs. Optional tooltip “เหมือนมุมมอง Design ของ Dreamweaver” — **skip** unless user asks (noise). | XS |
| DW-P1-3 | Blocks vs Insert confusion | Keep palette = atoms, บล็อก = sections; one-line empty-canvas hint already exists. Optional: palette group label “แทรก” vs flyout title “บล็อก” stay as-is. | — |
| DW-P1-4 | Layers panel DnD reorder | Nice-to-have; not required for DW mapping v1 | M |

### P2 — Intentionally not DW (document for support)

| Topic | Position |
|---|---|
| Deferred placeable nodes (command, toast, sidebar, context-menu, resizable) | **Out of Phase 11 placeable set** (§11 D3). Does not block DW chrome. Revisit only with a JS-capable Preview/export story. |
| App-shell blocks (dashboard/sidebar) | Not in blocks v1 (§11 D4). |
| Editable Code → Design round-trip | Code is **read-only first** (approved). Bidirectional sync is a later product. |
| Server / FTP / Dreamweaver site sync | Out of product scope. |
| Pixel-perfect Adobe skin | Rejected; quiet pro tool direction stays (`UI-REFRESH` §1). |

---

## 4. Recommended workflow story (for docs / onboarding)

Present the editor as three jobs (+ Database):

1. **จัดหน้า (Design)** — ลากจากแผงซ้ายหรือบล็อก · เลือกในเลเยอร์ · ปรับสไตล์/พรีเซ็ต/การเคลื่อนไหวทางขวา  
2. **ตรวจหน้า (Preview)** — สลับ **ตัวอย่าง** · เลือกอุปกรณ์ · ดู breakpoints / hover จริงในเฟรม  
3. **ดูโค้ด (Code)** — สลับ **โค้ด** · รายการไฟล์เดียวกับแพ็กเกจส่งออก (อ่านอย่างเดียว)  

Thai one-liner for About or empty canvas (optional later):  
`ออกแบบบนผืนผ้าใบ · สลับตัวอย่างเพื่อดูแบบผู้เยี่ยมชม · ดูโค้ดก่อนส่งออก · บล็อกช่วยแทรกทั้งส่วน`

---

## 5. Implementation slices (when DEV picks this up)

Ordered so each slice ships value alone:

| Slice | Deliverable | Depends |
|---|---|---|
| **DW-M1** (this doc) | Mapping + HANDOFF pointer | **Done** |
| **DW-M2** | Optional menubar (P1-1) wired to existing commands only; no new business logic | **Done** |
| **DW-M3** | Code view read-only (P0-1 / S3 first slice) | **Done** |
| **DW-M4** | Tier 1 Preview runtime (P0-2) | **Done** (PREVIEW-CODE-VIEW S2; RAM reading owed to PM) |
| **DW-M5** | Split mode (P0-3) | **Done** (S3 Split + เปิดโฟลเดอร์) |

**Default next:** **S6** Tier 2 Vite sidecar (`PREVIEW-CODE-VIEW-SPEC`). Do **not** expand placeable shadcn set for Dreamweaver feel.

---

## 6. Acceptance for “mapping done”

- [x] Table §1 covers Design, Preview, Insert, Library, Properties, Layers, Code, Menubar, DB.
- [x] P0/P1/P2 gaps listed with owner specs.
- [x] Explicit statement: deferred shadcn **nodes** ≠ blocker for DW chrome.
- [x] Next slice recommendation recorded (M2 vs M3).
- [x] PM ordered M2 then M3 (2026-11-08); both shipped as first slices.

---

## 7. Glossary (EN / TH)

| EN | TH (UI) | DW analogue |
|---|---|---|
| Design | ออกแบบ | Design view |
| Preview | ตัวอย่าง | Live / Preview |
| Code | โค้ด | Code view (read-only) |
| Split | แยก (future) | Split |
| Blocks | บล็อก | Library / snippets |
| Palette | เพิ่ม / กลุ่มในแผงซ้าย | Insert |
| Style panel | สไตล์ | Properties |
| Layers | เลเยอร์ | Layers / DOM |
| Presets | พรีเซ็ต | (closer to style favorites than DW) |
| Motion | การเคลื่อนไหว | Behaviors (CSS-only subset) |
| Database | ฐานข้อมูล | (no DW HTML equivalent; Phase 10) |
