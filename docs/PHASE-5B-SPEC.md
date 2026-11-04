# Phase 5b — blocks in the Add menu

**Product:** Web Builder (Tauri desktop)
**Date:** 2026-10-04
**Status:** Spec only. DEV does not start, and does not touch schema or the compiler, until the user has seen the summary. This file is not the multi-page Vite export. Do not write that spec.
**Scope:** Six shadcn-looking blocks in the Add menu. Each block is a tree of nodes the app already has.

---

## Goal

A small set of shadcn-looking blocks the user can place from the Add menu. Each block is a tree of existing page nodes. The current compiler exports them as ordinary HTML and CSS, the same as if the user had built that tree by hand. Not a React project, and not a second renderer.

## Document version

No new node kind. No new `StyleProps` key. No schema change. Inserting a block does not bump the version.

`version` is an integer field: `1` or `2`. It stays `1` until a breakpoint override is saved, then `2`. That is existing Phase 4 behavior, not this slice. Do not write `1.2` into the field. (`1` is schema v1.1. `2` is schema v1.2, and only because a node has `styleBreakpoints`.)

## Where they appear

The Add menu is the palette in the layers panel. Its caption is `เพิ่ม`. The eight tiles are `ส่วน`, `กล่อง`, `หัวข้อ`, `ข้อความ`, `รูปภาพ`, `ปุ่ม`, `ลิงก์`, and `ช่องว่าง`. `หน้า` is root-only and is not a tile. Under the tiles, one control labeled `เทมเพลต` opens five items: `แนะนำ`, `ข้อความและรูป`, `ชวนทำ`, `จุดเด่น`, `ท้ายหน้า`. Those five stay as they are.

Add a group labeled `บล็อก` under the eight tiles and under that `เทมเพลต` control. Same kind of control as `เทมเพลต` (a menu, not a grid tile). Not a ninth tile and not a sixth template.

The command palette already has a `เทมเพลต` group, next to `เพิ่มองค์ประกอบ`. Add a `บล็อก` group with the same six items.

Blocks use the template insert rule, not a new one, and not the palette-click rule. Palette click appends inside a selected container. A template does not. `templateInsertIndex` puts the tree at the end of the page, unless the selection is a section that is a direct child of the page, or a node inside such a section — then the tree goes just after that section. A locked page disables the control (`canInsertTemplate`). One `updateOpenDocument` writes the whole tree, so one undo removes it. The page child is the block's root. Do not wrap a block in an extra section.

## Bundle

The blocks are static node trees beside `TEMPLATES` (`src/lib/templates.ts`, or a sibling module in that same pattern). Do not import shadcn, Radix, or a block catalog into the page or the editor bundle. Do not add an npm package. The editor chrome keeps the shadcn components it already uses under `src/components/ui`. These presets must not load component source at runtime, must not fetch assets, and must not add fonts or images.

## The six blocks

Use only `section`, `container`, `heading`, `text`, `image`, `button`, `link`, and `spacer`. This set does not use `section`, `image`, or `link`. Prefer the smallest tree.

Container `direction`, `gap`, `align`, and `justify` are props, not style keys. Column is the container default, so omit `direction` unless the block is a row. `gap` defaults to 0, so a row or a stacked list sets it. Colors, radius, padding, and borders come from existing style keys only: `padding`, `backgroundColor`, `color`, `fontSize`, `borderRadius`, `borderWidth`, `borderColor`, `borderStyle`. Border is all four sides (`borderWidth` / `borderColor` / `borderStyle`). There is no per-side border, no shadow, no hover, no list-style, and no icon.

Page nodes store plain style values. `DEFAULT_STYLES` is hex and numbers, not CSS variables. Do not put editor class names such as `border-sidebar-border` on a page node. Where a block needs a border or a muted fill, use the app's existing neutral border and muted surface — the same kind of plain color the defaults already use. Do not add a token name.

1. **การ์ด** — one `container`, column, with padding, a 1px solid border, and border radius. Inside: one `heading` and one `text`. No image. Copy: `การ์ด` / `รายละเอียดสั้น ๆ`.
2. **แจ้งเตือน** — one `container`, column, with padding, a tinted background, and a light solid border. Inside: one `heading` and one `text`. No icon. Copy: `หมายเหตุ` / `ข้อความแจ้งเตือน`.
3. **ปุ่มเรียง** — one `container`, `direction: "row"`, with a small gap. Inside: two existing `button` nodes. The first uses `backgroundColor` and a contrasting `color`. Those are already the button defaults (`#0ea5e9` and `#ffffff`), so do not restyle it. The second clears the fill and sets a 1px solid border in the neutral border color. The button default is `borderWidth: 0` and `borderStyle: "none"`, so this one must set the border. No hover style. Labels: `ยืนยัน` and `ยกเลิก`.
4. **ป้าย** — one `text` node with a small `fontSize`, padding, border radius, and a muted background. Not a new kind. Copy: `ป้าย`.
5. **เส้นคั่น** — one `spacer`. A spacer can take a height and a background, so do not substitute a container. Height is `props.size` (px). The compiler writes `height` from `size`. `resolvedStyle` does not. Set `size` to 1, and set `backgroundColor` to the neutral border color, so it reads as a hairline. Do not also set `StyleProps.height`. Do not specify a single-side border.
6. **ข้อความเรียง** — one `container`, column, with a small gap. Inside: three `text` nodes. No bullets and no list-style, because that key does not exist. Copy: `ข้อแรก`, `ข้อสอง`, `ข้อสาม`.

After insert, select the focus node the way a template does: the heading, or the only text for `ป้าย`, or the spacer for `เส้นคั่น`.

## Out of scope

The rest of the shadcn catalog, including accordion, dialog, dropdown, form, input, select, tabs, table, tooltip, sheet, carousel, and chart. Any block that needs a new node kind or a new style key. Icons, shadow, hover, motion. A menubar. Fold-open preview emulation. Multi-page documents, routing, and exporting a Vite or React project. A different block per breakpoint. Remote or downloaded components. Favicon. Stock images inside these blocks.

## Acceptance (P5B-S1)

- The six labels show under `บล็อก`, in the Add menu and in the command palette.
- Each inserts the tree above, at the template insert index.
- One undo removes that whole tree.
- A save with no breakpoint override stays `version` `1`.
- The compiler emits the same kind of HTML and CSS it already emits for those node types, with no extra JavaScript.
- No new npm dependency. This slice does not change `schema.ts` or the compiler.
