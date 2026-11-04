# Phase 8 — Multiple pages in one project

**Status:** Spec only. DEV does not start until the user says so after reviewing a summary. Do not ask DEV to start from this file alone.

Checked on 2026-10-05 against `schema.ts`, `documentForSave`, `normalize_saved_document`, `compiler.rs` / `export.rs` (zip: `index.html`, `styles.css`, `assets/`), `assets.rs` (`gc_unreferenced` / `image_ids`), Preview (`sandbox="allow-same-origin"` without `allow-scripts`; Preview links omit `href`), `history.ts`, `LayersPanel.tsx`, and `pages.ts` (Login `/signup`, Signup `/login`).

## 1. Goal

One project holds several pages (for example home `/`, `/login`, `/signup`). The user can add, rename, set the path, reorder, delete, and switch pages in the editor. Export is one zip with several HTML files. A link whose `href` matches another page’s path reaches that file in the zip. Preview shows the page open in the editor. Sandbox and CSP stay as they are.

## 2. Document model and version

Today: `{ version, meta, root, nodes }`. `DocumentVersion` is `1 | 2 | 3 | 4`. Both writers set `4` if any Phase 6b kind, else `3` if any `input` or `switch`, else `2` if a real `styleBreakpoints` override remains, else `1`. Version `1` is schema v1.1. Never write a decimal.

**Version 5 only when the project has two or more pages.** A one-page project saves the old single-page shape under the 1–4 rule, so dropping back to one page drops the version on the next save. Opening a v1–4 file loads it as one page in memory and does **not** rewrite on open; only a user save writes. Old single-page readers cannot open v5. Both writers apply the rule.

### v5 shape

```
{
  version: 5,
  meta: PageMeta,          // shared (title, description?, lang?, favicon?)
  pages: [
    { id, name, path, root, nodes },   // path "/" is home; nodes hold style + styleBreakpoints
    ...
  ]
}
```

- First entry is always home. Home cannot be deleted; its path is not editable.
- No top-level `root` / `nodes` beside `pages` in v5.
- Per-page breakpoint overrides and per-node styles live on that page’s nodes, preserved with the page.
- Assets stay in SQLite / on disk, not in `document_json`.
- The open page drives the canvas, Layers tree, Style panel, and Preview. Switching clears selection.

## 3. Paths

- Home: `/`, always first, not deletable, path not editable. Name may be renamed.
- Other paths: one segment, `/` + lowercase `a-z` `0-9` hyphen, segment length 1–40, no leading or trailing hyphen. Unique after lowercasing. Uppercase input is lowercased before apply.
- Reserved segments (reject): `index`, `assets`, `styles`.
- Invalid input: inline Thai error under the field; change not applied.
- Default new page: name `หน้าใหม่` (Thai and duplicate names allowed). Path `/page-2`, `/page-3`, … first free.

## 4. Export naming and link rewrite

Flat files (not `login/index.html` — breaks `file://`).

| Path | HTML | CSS |
|------|------|-----|
| `/` | `index.html` | `styles.css` |
| `/login` | `login.html` | `login.css` |
| `/signup` | `signup.html` | `signup.css` |

Shared `assets/` at the zip root. Home keeps `styles.css` so a one-page export stays the same shape as today. Other pages get `<slug>.css`.

**Why per-page CSS:** the compiler assigns `nN` per compile pass. Compiling each page alone keeps classes local. A shared sheet would collide `n1` across pages.

At compile time, an `href` whose path matches a page path (or that path with a trailing `/`) is rewritten to the relative file (`/signup` → `signup.html`, `/` → `index.html`). A trailing `#fragment` and `?query` are kept when present. Unmatched hrefs are emitted unchanged (still through `safe_href`).

On save, `gc_unreferenced` must scan **all** pages’ nodes (widen today’s `image_ids` walk). Deleting a page does not delete image files; the next save drops files no page still references. Avatar `AssetRef` stays outside GC the way it does today unless the walk is expanded later.

## 5. Preview

Same sandboxed `srcdoc` iframe and CSP. Preview compiles the open page (single-page view into `compile_preview`). Switching page recompiles Preview.

Links are rewritten like export for HTML correctness, but Preview already omits `href` (title only) and the iframe has no scripts — **clicking a link in Preview does nothing**. Sandbox and CSP are not loosened.

## 6. Undo

One project-wide history (extend today’s root+nodes snapshots to the page list and every page’s tree). Meta title stays out of undo, as today.

- Add page = one undo (removes it, returns to the previous open page).
- Delete page = one undo restoring the page, its tree, overrides, and list position.
- Rename, path change, reorder = one undo each.
- Switching pages is not an undo step.
- If undo/redo lands on another page, the editor switches there.
- Template/block insert on the current page is unchanged.

## 7. Delete confirmation

Existing `AlertDialog`, Thai copy, initial focus on `ยกเลิก` (same as `UnsavedChangesDialog`). Destructive confirm `ลบหน้า`. Home has no delete. After confirm, open the previous page (or home) and focus that row.

## 8. UI — `หน้า` in Layers

A `หน้า` section at the top of the existing left Layers pane, above the layer tree. Chrome stays Thai. Phase 7 Add-menu `Pages` (`Login` / `Signup`) is unchanged and is not this list.

Each row: name and path; current page highlighted. Click switches. Actions via existing context-menu plus a small `…` button: `เปลี่ยนชื่อ`, `ตั้งค่าเส้นทาง`, `เลื่อนขึ้น`, `เลื่อนลง`, `ลบหน้า`. Rename/path use the existing `Popover` + `Input`. `+` adds a page after the current page. Reorder by up/down only; home stays first. Command palette: `หน้า` group (switch) plus `เพิ่มหน้า`. No new package.

## 9. Focus

- After add: open rename (or focus the new row) so the name can be typed.
- After rename/path commit: focus returns to the row.
- After delete: focus the previous page row and open that page.
- After switch: focus stays on the row; canvas shows that page with nothing selected.

## 10. Locked page

A locked page (page root `locked === true`) can be opened and previewed. Contents cannot be edited (existing can* rules). Rename, path, and delete in the page list are disabled. **Reorder in the page list remains allowed** — lock freezes the node tree, not project page order. Locking home does not lock other pages. Templates still cannot be placed on a locked page.

## 11. Lazy-loading

The `หน้า` list may be eager in Layers. Rename/path popover body and delete dialog load lazily if they add weight (same pattern as `UnsavedChangesDialog`). Budget: initial JS about **112 kB gz**, measured by DEV with a production build (this spec does not build). Multi-file export is Rust; no JS cost.

## 12. Phase 7 templates

Login still emits `/signup`; Signup still emits `/login`. Those reach the matching HTML files only if pages with those paths exist. No auto-creation of pages when inserting a template.

## 13. Out of scope

Forms that submit, site database, backend, Vite export, a button link field in properties (do not add `href` / `action` rows to the button), table, chart, ecommerce, animation, API security, mobile, and the eight unbuilt blocks in `docs/PHASE-6-SPEC.md` (`คำพูด`, `รูปและคำบรรยาย`, `สองคอลัมน์`, `แถบลิงก์`, `ตัวเลข`, `บุคคล`, `แบนเนอร์`, `คำถาม`). Nested paths and drag-reorder of pages are not in this phase.

## 14. Open questions for the user

1. Should clicking an internal link in Preview switch the editor to that page? (Host-side change; not in this phase as written.)
2. When inserting Login or Signup, should the app offer to create the matching `/signup` or `/login` page if missing?
3. Are nested paths wanted later?

## 15. Acceptance

- A second page saves as version `5` with `pages`. Removing the extra page and saving writes the old single-page shape under 1–4.
- Opening v1–4 does not rewrite until the user saves.
- Add / rename / path / reorder / delete each undo as specified. Switch is not an undo step.
- Export: `index.html`, `styles.css`, per-other-page `<slug>.html` + `<slug>.css`, shared `assets/`. `/signup` reaches `signup.html` when that page exists.
- Preview shows the open page; link clicks do nothing; sandbox and CSP unchanged.
- `หน้า` above the layer tree; palette has `หน้า` + `เพิ่มหน้า`. Home not deletable. Path rules and reserved names as above.
- Asset GC on save counts image refs across all pages.
- No new package. Initial JS about 112 kB gz (DEV measures).
