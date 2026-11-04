# Phase 5 — Image files

**Product:** Web Builder (Tauri desktop)
**Date:** 2026-10-04
**Status:** Spec only. DEV does not start, and does not touch schema or compiler, until the user has seen the summary. This task does not change `src/schema.ts` or `src-tauri/src/defaults.rs`.
**Scope:** A local file for the existing image node. The design canvas, preview, and the exported zip show that file. The page document stays small.

---

## What this is

The image node already stores a short asset id. This phase makes that id point at a file kept with the project. It does not add a node kind, a style key, or a document version.

Today the id is not a file. The canvas always paints a gray box and ignores the id. Preview and export pass `asset_base_url: None`, so the compiler emits a placeholder `div`, never an `img` and never a broken `src`. The zip is `index.html`, `styles.css`, and an empty `assets/.keep`. Images are not base64 and not a path.

## What the node stores

`ImageProps.src` is an `AssetRef`: `id` (string) and optional `alt`. A new image is `src: { id: "" }`. The panel writes the id through `srcId` and the alt through `srcAlt`. `objectFit` stays as it is.

The node stores that id only. No pixels, no base64, and no absolute path. No new field. No new `StyleProps`. No icon, shadow, or hover. No second file per breakpoint. `meta.favicon` is the same `AssetRef` and this slice does not fill it.

`version` stays `1` when an image is saved. It becomes `2` only when a breakpoint override is saved, which is already the rule.

## Add and replace

The only way in is the image node (palette `รูปภาพ`). No new panel and no menubar.

`คุณสมบัติ` keeps `ข้อความแทนรูป`. The free-text `รหัสไฟล์รูป` field goes away. Today its placeholder is `ยังไม่มีรูป`, and the note under it is `ยังไม่มีคลังรูป — ใส่รหัสไฟล์ (asset id) ด้วยตนเอง`.

- Empty `src.id`: `เลือกรูป` opens the file dialog.
- An id that already has a file: `เปลี่ยนรูป` opens the same dialog.

The dialog is `open` from `@tauri-apps/plugin-dialog`. That plugin is already initialized. The window may only `dialog:allow-save` today, for the zip. This slice adds `dialog:allow-open` on the same capability. No new npm package. Accept jpeg, png, gif, and webp. The app allows no other image type, and svg stays out.

The picked file is copied once. The user's original is not the source of truth, so moving or deleting it later does not break the project.

The copy sets `src.id` through the existing `srcId` write. That is one history entry. Undo restores the previous id and does not delete the file, because redo needs it. On the next successful save, delete stored files that no remaining node references. Cancelling the dialog does not dirty the document. A locked node keeps the row disabled.

## Where the file lives

Projects are one JSON blob. `web_builder.db` lives in the app data directory. Table `projects` has `id`, `name`, `document_json`, `created_at`, and `updated_at`. There is no assets table and no folder beside the database.

Bytes do not go in `document_json`. The file is `<app data>/assets/<id>.<ext>`. A new `assets` table is the index (`id`, `project_id`, `ext`), not a blob. The table is new because SQLite has nowhere to map an id today. The bytes stay in the file so preview can use a path and a save stays small.

Cap once, at import. Reject an original over 20MB. Otherwise scale so the long edge is at most 2560px, and reject the result if it is still over 8MB. Store that one result. Do not resize again on open, preview, device switch, or export. No thumbnail pipeline and no watcher. Cargo.toml has no image decoder; one Rust decoder crate is allowed for this command only.

## Preview and export

The design canvas resolves `src.id` with `convertFileSrc` and shows the picture. An empty id keeps today's gray box (`รูปภาพ`, or the alt text). A missing file shows `ไม่พบรูป` and does not throw.

Preview stays a sandboxed `srcdoc` iframe. The compiler does not inline the bytes. `compile_preview` already takes `project_id` and ignores it; this slice uses it so the `img` `src` is an asset URL. Preview CSP is `img-src data:` today, so that URL will not load until `img-src` also allows the Tauri asset origin. Do not allow general remote images. Changing the device does not compile again.

The zip puts the file at `assets/<id>.<ext>` and sets the `img` `src` to that relative path. Preview URLs and export URLs differ. The page JSON is the same. The compiler today joins `asset_base_url` and the sanitized id and does not add an extension. The extension comes from the `assets` row, not from the node.

A missing file: export still finishes, omits that file, and still emits the `img` so the layout holds.

## Out of scope

Remote URLs, stock libraries, crop, filters, drawing, svg, icons, shadow, hover, the menubar, motion, and fold-open preview emulation. A different image per breakpoint is out. `meta.favicon` is out.

## Acceptance (P5-S1)

- Pick a jpeg. Canvas, preview, and the zip all show it.
- The page JSON contains `src.id` only, not the bytes. `version` stays `1` if there is no breakpoint override.
- Replace is one undo. Cancel does not dirty.
- A missing file shows `ไม่พบรูป`, and export still finishes.
- Opening a project does not decode or resize the file again.
- `schema.ts` is unchanged by this spec. Implementation does not touch it: `src.id` can already hold the id.
