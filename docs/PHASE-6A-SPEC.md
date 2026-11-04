# Phase 6a — first components

**Status:** Spec only. DEV does not start, and does not touch `schema.ts` or `defaults.rs`, until the user has seen the summary. Export stays the current HTML/CSS zip (`index.html`, `styles.css`, and `assets`). This is not the Vite export.

Checked on 2026-10-05. `NodeType` is `page`, `section`, `container`, `heading`, `text`, `image`, `button`, `link`, `spacer`. There is no `input` and no `switch`. `page` is root-only and is not a palette tile.

## The six

Four already exist. Two are new.

1. **ปุ่ม** — already the `button` node and the `ปุ่ม` tile. No second button. No new field. `ButtonProps` is `label`, plus optional `href` and optional `action` (`"link"` | `"none"`). `createNode("button")` sets only `label: "ปุ่ม"`. The canvas edits `label` inline (`textPropKey` returns `"label"`). Style stays in the existing panel. `NodePropsSection` returns nothing for a button, so there is no href row and no action row. Leave `href` unused. Do not add a href row. Do not add an action row.

2. **การ์ด** — already the Phase 5b block (`BLOCKS` id `card`): a container, a heading, and a text node. No new card kind. Edit it by selecting the heading or the text. Do not change that tree.

3. **ป้าย** — already the Phase 5b block (`badge`): one text node. No new badge kind. Do not change that tree.

4. **เส้นคั่น** — already the Phase 5b spacer block (`divider`). No new separator kind. Do not change that tree.

`แจ้งเตือน`, `ปุ่มเรียง`, and `ข้อความเรียง` stay as they are. This slice does not edit `src/lib/blocks.ts`.

5. **ช่องข้อความ** — new node kind `input`. It cannot be a text node, because export must be an input element.

6. **สวิตช์** — new node kind `switch`. It cannot be a button, and it cannot be a checkbox hack on an existing kind.

## Schema, named but not edited

Do not edit `src/schema.ts` or `src-tauri/src/defaults.rs` in this step.

`input` props: `label` (string, default empty), `placeholder` (string, default `พิมพ์ที่นี่`). No password, email, or number type. This slice is not the login form.

`switch` props: `label` (string, default `Checkbox`), `checked` (boolean, default false).

Both use the existing `StyleProps` for padding, border, radius, color, and width (`padding`, `borderWidth`, `borderColor`, `borderStyle`, `borderRadius`, `color`, `width`, and the other keys already on `StyleProps`). No new style key. No shadow, hover, icon, or motion.

`DocumentVersion` is `1 | 2` today. `documentForSave` (`src/lib/breakpoints.ts`) and `normalize_saved_document` (`defaults.rs`) write `2` when any node has a real `styleBreakpoints` override, otherwise `1`. A later change must extend both of those writers. It must not replace the breakpoint rule:

- A document with neither `input` nor `switch` stays `1`, or `2` if a breakpoint override remains.
- Saving a document that contains an `input` or a `switch` sets version `3`. `styleBreakpoints` still work inside version `3`.
- Do not write `1.3`.
- Opening a version `1` or `2` file is unchanged.
- Removing the last input and the last switch writes `1`, or `2` if a breakpoint override remains.

## Editor

`PALETTE_TYPES` is `section`, `container`, `heading`, `text`, `image`, `button`, `link`, `spacer`. The `เพิ่ม` tiles map that list. A click calls `insertPaletteNode`: `createNode`, then `insertNode` at `resolveInsertTarget`, then select the new node. One `updateOpenDocument`, so one undo removes that one node. Drag uses the same type (`PALETTE_DRAG_MIME`). The command palette group `เพิ่มองค์ประกอบ` maps the same list and the same `insertPaletteNode`.

Add `input` and `switch` at the end of `PALETTE_TYPES`, after `spacer`. That is the insert path for the two new tiles. Under `เพิ่ม`, after `ช่องว่าง`: `ช่องข้อความ` and `สวิตช์`. The same two labels appear in `เพิ่มองค์ประกอบ`. Not in `บล็อก`. `บล็อก` is the six existing trees and uses `insertBlock`, not this path.

A locked node disables its property rows, same as today (`locked` on `FieldRow`).

Properties, and only these new rows, in the existing `คุณสมบัติ` section:

- input: `ป้ายกำกับ` writes `label`. `ข้อความตัวอย่าง` writes `placeholder`.
- switch: `ป้ายกำกับ` writes `label`. `เปิด` writes `checked`.

The `เปิด` row uses the `Switch` from `@/components/ui/switch`. That control is already in the properties panel, on the link row `เปิดแท็บใหม่` (`openInNewTab`). It is not a page-node kind. `ModeSwitch` is a separate design/preview toggle and is not this control. The canvas shows the saved on or off state. Do not require a canvas click to toggle.

No new npm package. No shadcn import into the page.

## Export

The zip is still `index.html`, `styles.css`, and `assets`. The compiler gains two emit paths and nothing else:

- input: a label element only when `label` is non-empty, and `<input type="text">` with `placeholder`. No script.
- switch: a native checkbox inside a label, checked when `checked` is true, plus the label text. The stylesheet may add one `.t-switch` rule so it reads as a switch. No animation, no thumb transition.

Do not add a package for this.

## Out of scope

Every other shadcn component. The eight blocks in `docs/PHASE-6-SPEC.md` (`คำพูด`, `รูปและคำบรรยาย`, `สองคอลัมน์`, `แถบลิงก์`, `ตัวเลข`, `บุคคล`, `แบนเนอร์`, `คำถาม`). Dashboard. Login form. Vite or React export. Backend, database, ecommerce, animation, API security, mobile. Icon, shadow, hover, motion. A menubar. Fold-open emulation. Changing the existing `ปุ่ม`, `การ์ด`, `ป้าย`, or `เส้นคั่น`.

## Acceptance

P6A-S1. DEV does not start until the user accepts this.

- `ปุ่ม`, `การ์ด`, `ป้าย`, and `เส้นคั่น` behave exactly as they do now.
- `ช่องข้อความ` and `สวิตช์` appear as tiles and in `เพิ่มองค์ประกอบ`.
- Their new rows edit the fields above. One undo removes the node.
- A document with one of them saves as version `3`. A document without them does not.
- The zip is still HTML and CSS, and the input and switch are real form controls, not divs.
- `schema.ts` and `defaults.rs` are not edited by this spec.
