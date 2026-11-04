# Web Builder — Phase 1 UI Spec

**Product:** Web Builder (Tauri desktop)  
**Scope:** Project list + editor chrome only (no canvas drag-drop)  
**Stack constraints:** React 19, shadcn `radix-nova`, Tailwind v4 tokens in `src/index.css`, existing `Button`, Lucide icons, Geist Variable. **Do not change `src/schema.ts`.**  
**Theme:** Light only for Phase 1. Use existing CSS variables; do not invent new color names unless noted.

---

## 0. App chrome & routing

| Item | Spec |
|------|------|
| Router | Add `react-router` (or lightweight path state). Two routes: `/` = Project List, `/editor/:projectId` = Editor Shell. |
| Window | Bump default Tauri window to **1280×800** (min **960×640**). Current 800×600 is too tight for 3-pane editor. |
| Font | `font-sans` → Geist Variable (already wired). |
| Density | Light: comfortable hit targets (min 32px), airy gaps, short Thai/English labels. |
| Remove | Scaffold `App.css` + greet demo in `App.tsx` — replace with real shell. |

### Suggested file layout (new)

```
src/
  pages/
    ProjectListPage.tsx
    EditorPage.tsx
  layouts/
    AppShell.tsx          # optional thin wrapper (bg-background)
  components/
    projects/
      ProjectCard.tsx
      ProjectEmptyState.tsx
      NewProjectDialog.tsx
      DeleteProjectDialog.tsx
    editor/
      EditorTopBar.tsx
      LayersPanel.tsx
      DesignCanvas.tsx      # Phase 2 live canvas (replaced the Phase 1 CanvasPlaceholder, now deleted)
      StylePanel.tsx
  stores/
    projects-store.ts     # NEW — local project list (Phase 1)
    editor-store.ts       # extend stub only; do not touch schema
```

---

## 1. Design tokens (use as-is)

From `src/index.css` light `:root`:

| Role | Token | Notes |
|------|--------|--------|
| Page bg | `--background` | White |
| Text | `--foreground` | Near-black |
| Muted text | `--muted-foreground` | Secondary labels, empty-state body |
| Surfaces | `--card`, `--sidebar` | Cards / side panels |
| Borders | `--border`, `--sidebar-border` | 1px hairlines |
| Primary CTA | `--primary` / `--primary-foreground` | Create / primary actions |
| Danger | `--destructive` | Delete |
| Focus | `--ring` | Focus rings on inputs/buttons |
| Radius | `--radius` (0.625rem) | Prefer `rounded-lg` / `rounded-md` |
| Side panels | `--sidebar*` | Left layers + right styles |

**Spacing scale (Tailwind):** prefer `gap-2` (8), `gap-3` (12), `gap-4` (16), `p-3`/`p-4`/`p-6`. Avoid cramped `gap-1` except icon clusters.

**Type hierarchy**

| Level | Classes | Use |
|-------|---------|-----|
| Page title | `text-2xl font-semibold tracking-tight` | Project list H1 |
| Section | `text-sm font-medium` | Panel headers |
| Body | `text-sm` | Card titles, form labels |
| Meta | `text-xs text-muted-foreground` | Dates, counts, hints |
| Canvas hint | `text-sm text-muted-foreground` | Placeholder center copy |

---

## 2. Screen A — Project List (`/`)

### Goal
Create / open / delete projects. Empty state first-run. Light density desktop home.

### Layout zones

```
┌─────────────────────────────────────────────────────────┐
│  HEADER  h-14  px-6                                     │
│  [Logo/Wordmark]  Web Builder     [+ สร้างโปรเจกต์]     │
├─────────────────────────────────────────────────────────┤
│  CONTENT  flex-1  px-6 py-6  overflow-auto              │
│                                                         │
│  Empty → centered empty state                           │
│  Has items → responsive card grid                       │
└─────────────────────────────────────────────────────────┘
```

- Full viewport: `min-h-svh flex flex-col bg-background`
- Header: bottom border `border-b border-border`, sticky optional
- Wordmark: app name only (no heavy logo needed Phase 1); `text-base font-semibold`
- Primary CTA: existing `Button` `size="default"` — label **สร้างโปรเจกต์** (EN alt: Create project)

### Project card grid

- Grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Card: `rounded-lg border border-border bg-card p-4` hover: `bg-accent/40` or subtle shadow; cursor pointer opens editor
- Card content:
  - Title: `text-sm font-medium` truncate (default new name: **หน้าใหม่** / Untitled Page — align with schema `meta.title` / store)
  - Meta row: `text-xs text-muted-foreground` — last opened relative time (e.g. `เปิดล่าสุด 2 ชม.`)
  - Actions: top-right overflow `Button variant="ghost" size="icon-sm"` → menu: เปิด / ลบ
- Click card body → navigate `/editor/:id`
- Delete never inline-confirm on card; open dialog

### Empty state (0 projects)

Centered in content area (`flex flex-1 items-center justify-center`):

- Lucide `LayoutTemplate` or `FolderOpen` — `size-10 text-muted-foreground`
- Title: `ยังไม่มีโปรเจกต์` — `text-lg font-medium`
- Body: `สร้างโปรเจกต์แรกเพื่อเริ่มออกแบบ` — `text-sm text-muted-foreground max-w-sm text-center`
- CTA: `Button` **สร้างโปรเจกต์**

### New project dialog

- Use shadcn Dialog (add component if missing)
- Title: **โปรเจกต์ใหม่**
- Field: name input, placeholder `ชื่อโปรเจกต์`, default `หน้าใหม่`
- Actions: `ยกเลิก` (ghost/outline) + `สร้าง` (default) — Enter submits
- On create: add to `projects-store`, navigate to `/editor/:id`

### Delete dialog

- Title: **ลบโปรเจกต์?**
- Body: short — `การกระทำนี้ย้อนกลับไม่ได้` + project name in medium weight
- Actions: `ยกเลิก` + `ลบ` (`Button variant="destructive"`)

### Phase 1 data (projects-store)

Local-only is fine (Zustand + `localStorage` persistence):

```ts
type ProjectSummary = {
  id: string;          // uuid
  name: string;
  updatedAt: number;   // ms
  // document lives separately; Phase 1 can use empty PageDocument defaults from schema helpers / Rust defaults — do not mutate schema.ts
};
```

Do **not** put full `PageDocument` shape changes into schema. Editor can hold a stub untitled document in memory.

### Components to add (shadcn)

Minimum: `dialog`, `input`, `dropdown-menu` (or `popover`), optional `separator`, `scroll-area`. Keep using existing `button`.

---

## 3. Screen B — Editor Chrome (`/editor/:projectId`)

### Goal
Product shell ready for Phase 2 canvas. Placeholders OK in center. Three-pane IDE-like layout, light theme, low chrome weight.

### Layout zones (fixed)

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR  h-12  border-b                                           │
│ [← โปรเจกต์]  |  Title (editable)  |  [preview?]   [บันทึก*]      │
├────────────┬─────────────────────────────┬───────────────────────┤
│ LEFT       │ CENTER                      │ RIGHT                 │
│ Layers     │ Canvas area                 │ Style panel           │
│ w-56       │ flex-1                      │ w-72                  │
│ border-r   │ bg-muted/30                 │ border-l              │
│ sidebar bg │                             │ sidebar bg            │
└────────────┴─────────────────────────────┴───────────────────────┘
```

**Heights:** `h-svh` outer; top `h-12`; body `flex-1 min-h-0 flex`.

| Zone | Width | Token / classes |
|------|-------|-----------------|
| Top bar | full / `h-12` | `bg-background border-b border-border` |
| Left (layers) | **224px** (`w-56`) | `bg-sidebar text-sidebar-foreground border-r border-sidebar-border` |
| Center | flex-1 | `bg-muted/40` checker or flat; canvas stage centered |
| Right (styles) | **288px** (`w-72`) | same sidebar tokens as left |

Optional: collapse left via existing `editor-store.isSidebarOpen` / `toggleSidebar`. Right panel stays for Phase 1 (can collapse later).

### Top bar details

Left cluster:
1. `Button variant="ghost" size="sm"` — Lucide `ArrowLeft` + **โปรเจกต์** → back to `/`
2. `Separator` vertical `h-4`
3. Editable title: inline `input` or contentEditable styled as `text-sm font-medium`; blur/Enter commits to project name + `editor-store.setDocumentTitle`. Placeholder `ไม่มีชื่อ`

Right cluster:
- Phase 1: **no real save backend** — show `Button variant="outline" size="sm"` **บันทึก** disabled OR optimistic local save to projects-store `updatedAt`. Prefer working local persist.
- Optional ghost icon `Monitor` for future preview — omit if it adds noise; better omit than fake.

### Left — Layers / Outline panel

Header row: `h-10 px-3 flex items-center` + label **เลเยอร์** (`text-xs font-medium uppercase tracking-wide text-muted-foreground`)

Body: placeholder tree (not wired to live canvas yet):

- Show a fixed stub tree matching schema mental model (read-only Phase 1):
  - `หน้า` (page)
    - `ส่วน` (section)
      - `หัวข้อ` / `ข้อความ` (example leaves)
- Row: `h-8 px-2 rounded-md text-sm` hover `bg-sidebar-accent`; selected `bg-sidebar-accent text-sidebar-accent-foreground`
- Indent per depth: `pl-2 + depth*12px`
- Icons: Lucide `File`, `Square`, `Type`, `Image` — `size-3.5 text-muted-foreground`
- Empty/helper footer: `text-xs text-muted-foreground px-3 py-2` — `ผืนผ้าใบมาในเฟสถัดไป`

Do not require real `PageDocument` tree binding yet; stub is fine. When wiring later, map `NodeType` → icon/label without changing schema.

### Center — Canvas placeholder

> **Superseded (Phase 2):** the Phase 1 `CanvasPlaceholder` component has been deleted. The center pane now renders `DesignCanvas` (`src/components/editor/DesignCanvas.tsx`), a live `PageDocument` canvas that keeps the same outer/stage layout below. The placeholder copy is kept here for history only.

- Outer: fill remaining space, `overflow-auto p-6 flex items-start justify-center`
- Stage: white card simulating page — `w-full max-w-3xl min-h-[480px] bg-card border border-border rounded-lg shadow-sm`
- Inside stage (centered muted copy):
  - Title: **พื้นที่ผ้าใบ**
  - Body: `ลากวางจะเปิดใช้ในเฟส 2`
- Optional light dot-grid on outer muted area (`bg-[radial-gradient(...)]` at low opacity) — keep subtle for performance

### Right — Style panel

Header: **สไตล์** (same header pattern as left)

Body sections (placeholders, disabled controls OK):

1. **เลย์เอาต์** — gap / align / justify (maps later to container node fields in schema — display only)
2. **ตัวอักษร** — size / weight / color swatches
3. **ระยะ** — padding shorthand

Each section: `text-xs font-medium text-muted-foreground mb-2`; fields as `Input` `h-8` or segmented ghost buttons; all **disabled** with hint `เลือกเลเยอร์บนผ้าใบ` when nothing selected.

Selected-none state: centered muted text `เลือกองค์ประกอบเพื่อแก้ไข`

### editor-store Phase 1 extensions (allowed)

Keep stub; may add:

- `selectedNodeId: string | null`
- `setSelectedNodeId`
- Keep `documentTitle`, `isSidebarOpen`

Do **not** redefine `PageDocument` in the store in a way that forks `schema.ts`.

---

## 4. Interaction & a11y

- All icon buttons: `aria-label` in Thai or English consistently (pick Thai for user-facing).
- Focus visible: rely on shadcn/`ring` tokens.
- Dialogs: focus trap, Esc closes, confirm buttons not autofocused for delete.
- Keyboard: Enter on new-project name submits; Delete key not global-delete without dialog.

## 5. Performance / “fast & light”

- No heavy animation libraries; use `tw-animate-css` only for dialog/fade if needed.
- Avoid large blur backdrops.
- Lists: plain CSS grid; no virtualization until >100 projects.
- Prefer CSS variables already in bundle; no extra theme runtime.

## 6. Copy sheet (Thai-first, short)

| EN sense | UI copy |
|----------|---------|
| Create project | สร้างโปรเจกต์ |
| New project | โปรเจกต์ใหม่ |
| Projects (back) | โปรเจกต์ |
| Delete? | ลบโปรเจกต์? |
| Cancel | ยกเลิก |
| Create | สร้าง |
| Delete | ลบ |
| Empty title | ยังไม่มีโปรเจกต์ |
| Empty body | สร้างโปรเจกต์แรกเพื่อเริ่มออกแบบ |
| Layers | เลเยอร์ |
| Styles | สไตล์ |
| Canvas area | พื้นที่ผ้าใบ |
| Canvas hint | ลากวางจะเปิดใช้ในเฟส 2 |
| Save | บันทึก |
| Untitled | หน้าใหม่ |

## 7. Out of scope (Phase 2+)

- Real canvas DnD, node mutation, compiler preview
- Dark mode toggle
- Cloud sync / accounts
- Multi-page site tree beyond single PageDocument
- Changing `schema.ts` / Rust `defaults.rs`

## 8. Acceptance checklist (for DEV)

- [ ] `/` shows empty state; create → card appears; open → editor
- [ ] Delete requires confirm; cancel safe
- [ ] Editor shows top bar + left `w-56` + center placeholder + right `w-72`
- [ ] Back navigates to list; title edit updates list name
- [ ] Only light theme tokens from `index.css`; existing `Button` reused
- [ ] `src/schema.ts` untouched
- [ ] Window usable at 1280×800; no horizontal clip at 960×640

---

**Handoff note:** Implement UI in repo; Designer can review screenshots. Coordinate with DEV before any schema or `defaults.rs` edits.
