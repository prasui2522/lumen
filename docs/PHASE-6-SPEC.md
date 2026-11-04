# Phase 6 — placeable components

**Product:** Web Builder (Tauri desktop)
**Date:** 2026-10-04
**Status:** Spec only. DEV does not start, and does not touch `schema.ts` or `defaults.rs`, until the user has seen the summary. Export stays the current HTML/CSS compiler. This is not the Vite export, and that work stays stopped.
**Scope:** Eight more blocks in the existing `บล็อก` menu. Each one is a static tree of nodes the app already has.

---

## Goal

Eight more blocks the user can place from `บล็อก` and then edit with the existing properties panel, by selecting the block's own nodes. They are static trees of existing node types, the same as the Phase 5b blocks. The compiler already emits those types, so export does not change.

## No schema change

No new node kind. No new field. No version bump. A document stays version `1`, or `2` if it already has a breakpoint override. Inserting a block does not write `styleBreakpoints`. Every block below is built from fields that already exist. Do not edit `schema.ts` or `defaults.rs`.

`version` is an integer: `1` or `2`. It stays `1` until a breakpoint override is saved, then `2`. That is existing Phase 4 behavior. Do not write `1.2` into the field.

## Where they appear

`บล็อก` is already in the Add menu (`เพิ่ม`), under `เทมเพลต`, and in the command palette as a `บล็อก` group after `เทมเพลต`. The six already there stay, in this order: `การ์ด`, `แจ้งเตือน`, `ปุ่มเรียง`, `ป้าย`, `เส้นคั่น`, `ข้อความเรียง`. Append the eight below after those six, in the order given. Do not replace the six.

Same insert rule as the templates and the Phase 5b blocks. The tree goes at the end of the page, unless the selection is a section that is a direct child of the page, or a node inside such a section — then it goes just after that section. One `updateOpenDocument` writes the whole tree, so one undo removes it. The page child is the block's root. Do not wrap the tree in an extra section.

After insert, select the focus node the way a Phase 5b block does: the first heading, the image for `รูปและคำบรรยาย` and `บุคคล`, or the first link for `แถบลิงก์`. That includes insert from Ctrl+K and Meta+K.

A locked page already disables `บล็อก` (`canInsertTemplate`). Do not invent a new lock rule.

Children stay normal nodes. The user selects a heading, text, button, link, or image and edits that node. There is one properties panel (`StylePanel`). It already edits style, the heading level, a link's `href` (`ลิงก์ปลายทาง`) and `openInNewTab`, and an image file (`เลือกรูป` / `เปลี่ยนรูป` writes `src.id`, plus `ข้อความแทนรูป` for `src.alt`). Heading and text `content`, and button and link `label`, are already edited inline on the canvas (`textPropKey`). No component-level property bag. No second panel. No new row.

## Bundle

Static trees beside the Phase 5b blocks (`src/lib/blocks.ts`, appended to `BLOCKS`). No new npm package. No shadcn or Radix import. No runtime component source. No new fonts or images. The editor chrome keeps the shadcn it already uses under `src/components/ui`.

## The eight

Use only `section`, `container`, `heading`, `text`, `image`, `button`, `link`, `spacer`. This set does not use `section` or `spacer`. Column is the container default, so omit `direction` unless the block is a row. Set `gap` only where a gap is named below. `align` is a container prop (`"start" | "center" | "end" | "stretch"`), not a style key.

Border is all four sides: `borderWidth`, `borderColor`, `borderStyle`. No per-side border, no shadow, no hover, no icon, no list-style.

Colors are plain hex, the same kind the defaults and the Phase 5b blocks already use. Border `#e2e8f0`. Muted fill `#f8fafc`. Banner tint `#e0f2fe`. Do not put editor utility classes on a page node. Do not add a token name.

Text and heading copy is `content`. Button and link copy is `label`. A link stores the path on `href`, which is already `string` (`LinkProps.href`). An image stores `src: { id: "" }`, the same empty `AssetRef` `createNode("image")` already writes, so the existing `เลือกรูป` row applies.

1. **คำพูด** — one `container`, column, padding 16, `borderWidth` 1, `borderStyle` `"solid"`, `borderColor` `#e2e8f0`, `borderRadius` 8. Inside: one `text` (`ข้อความอ้างอิง`) and one smaller `text` (`ชื่อ`, `fontSize` 14; the text default is 16). No left-border trick. Focus the quote text.
2. **รูปและคำบรรยาย** — one `container`, column, `gap` 8. Inside: one `image` with `src.id` `""`, and one `text` caption (`คำบรรยาย`). Focus the image.
3. **สองคอลัมน์** — one `container`, `direction` `"row"`, `gap` 8. Inside: two `container`s, each `width` `"50%"` (existing `StyleProps.width`). Each holds one `heading` and one `text`. Copy: `คอลัมน์หนึ่ง` / `รายละเอียด` and `คอลัมน์สอง` / `รายละเอียด`. Focus the first heading.
4. **แถบลิงก์** — one `container`, `direction` `"row"`, `gap` 8. Inside: four `link` nodes. `href` is a plain string, so these paths are stored as-is: `/`, `/about`, `/work`, `/contact`. Labels: `หน้าแรก`, `เกี่ยวกับ`, `ผลงาน`, `ติดต่อ`. Focus the first link.
5. **ตัวเลข** — one `container`, `direction` `"row"`, `gap` 8. Inside: three `container`s, each one `heading` (the number) and one `text` (the label). Copy: `12` / `ปี`, `48` / `งาน`, `96` / `ลูกค้า`. Focus the first heading.
6. **บุคคล** — one `container`, `direction` `"row"`, `gap` 8, `align` `"center"`. Inside: one `image` with `src.id` `""`, and one `text` (`ชื่อ`). The image default `width` is `"100%"`, so set `width` 64, `height` 64, and `borderRadius` 32 (existing style keys) so it reads as a circle. Not a new avatar kind. Focus the image.
7. **แบนเนอร์** — one `container`, column, padding 16, `backgroundColor` `#e0f2fe`. Inside: one `heading` (`หัวข้อ`), one `text` (`คำโปรย`), one `button`. The button label is `เริ่มเลย`. `ButtonProps` has optional `href` and `action`, but `createNode("button")` does not set them, and `StylePanel` does not show a button href row (that row is link-only). Do not set `href`. Do not add a row. The button keeps its default fill. Focus the heading.
8. **คำถาม** — one `container`, column, `gap` 8. Inside: six nodes, three pairs, each pair one `heading` then one `text`. Not an accordion. Nothing opens or closes. Copy: `คำถามแรก` / `คำตอบ`, `คำถามสอง` / `คำตอบ`, `คำถามสาม` / `คำตอบ`. Focus the first heading.

## Out of scope

The rest of the shadcn catalog: accordion, dialog, dropdown, form, input, select, checkbox, tabs, table, tooltip, sheet, carousel, chart. The dashboard screen and the login form, which wait for a later slice. Vite or React project export. Backend code, a database, ecommerce, page animation, API security, mobile export, a production-preview mode. Icon, shadow, hover, motion. A menubar. Fold-open emulation. A new properties panel. A new npm package. Any schema edit.

## Acceptance (P6-S1)

DEV does not start until the user accepts this.

- The eight labels appear after the existing six in `บล็อก` and in the command palette.
- Each inserts the tree above. One undo removes it. Focus lands on the node named above, including after Ctrl+K and Meta+K.
- Selecting a child edits it the way that node is already edited: inline `content` or `label` on the canvas, link `href` and the image file in the existing panel. No new row and no new field.
- Save does not change version by itself.
- `schema.ts` and `defaults.rs` are not edited. The compiler is not edited.
