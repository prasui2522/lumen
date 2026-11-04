# Phase 6b — remaining placeable components

**Status:** Spec only. DEV does not start, and does not touch `schema.ts` or `defaults.rs`, until the user has seen the summary. Export stays the current HTML/CSS zip (`index.html`, `styles.css`, and `assets`). This is not the Vite export.

Checked on 2026-10-05 against the shadcn component list for this project's `radix-nova` style, and against `src/components/ui`. Files in `src/components/ui` are editor chrome. They are not page nodes. Do not import them onto the page.

## Already in the builder

Do not change these, and do not add a second tile for them.

- Palette: `section`, `container`, `heading`, `text`, `image`, `button`, `link`, `spacer`. Typography is heading and text. A text node's layer name is its content, so Label is not a new tile.
- `input` is the `ช่องข้อความ` tile. `switch` is the `Checkbox` tile. shadcn Switch is that tile, not a new one.
- Thai blocks, unchanged: `การ์ด` (Card), `แจ้งเตือน` (Alert), `ปุ่มเรียง` (Button Group), `ป้าย` (Badge), `เส้นคั่น` (Separator), `ข้อความเรียง`.

`nodeDisplayName` uses `node.name`, then heading or text content, then button, link, input, or switch `label`, otherwise `NODE_TYPE_LABEL`. An image stays `รูปภาพ`. A container stays `กล่อง`. None of the items below can reuse those nodes. Each is a new kind, with an English `NODE_TYPE_LABEL`. Typed text stays free text. Where a kind has a text or title, the layer name follows that string the way a text node follows content. Avatar does not: its layer name stays `Avatar`.

## Version

`DocumentVersion` is `1 | 2 | 3`. `documentForSave` (`src/lib/breakpoints.ts`) and `normalize_saved_document` (`src-tauri/src/defaults.rs`) write `3` when any node is an `input` or a `switch`, else `2` when a real `styleBreakpoints` override remains, else `1`. Extend both writers. Do not replace that rule. `schema.ts` and `defaults.rs` are named here and not edited.

- A document with none of the new kinds stays `1`, `2`, or `3` under that rule.
- Saving a document that contains any new kind from this spec sets version `4`. Breakpoint overrides still apply.
- Removing the last new kind writes `3` if an `input` or a `switch` remains, `2` if a breakpoint override remains, otherwise `1`.
- Do not write `1.4`. Opening a version `1`, `2`, or `3` file is unchanged.

## Editor

Append the new kinds at the end of `PALETTE_TYPES`, after `switch`, in the order below. Tiles under `เพิ่ม`. The same labels in `เพิ่มองค์ประกอบ`. Not in `บล็อก`. One insert is one undo. A locked node disables its rows, same as today.

Panel words already on screen: `ป้ายกำกับ`, `ข้อความตัวอย่าง`, `เปิด`. A title uses `หัวข้อ`. A body uses `ข้อความ`. A number uses `ค่า`. Each list entry is a row in that same section. No second panel.

Existing `StyleProps` only. No new style key. No shadow, icon, or motion. No script. No new package.

## 1. Text

1. **Textarea** — `textarea`. `label` string, default empty. `placeholder` string, default `Type here`. No rows prop. Export: a label element only when `label` is non-empty, plus `<textarea>`.
2. **Kbd** — `kbd`. `text` string, default `Kbd`. Export: `<kbd>`.
3. **Avatar** — `avatar`. `src` is the existing `AssetRef` (empty id allowed, same `เลือกรูป` / `เปลี่ยนรูป`). `fallback` string, default `A`, shown when the id is empty. Circle is `borderRadius` on the default style, set large. Export: an `img` or the fallback text.
4. **Progress** — `progress`. `value` number, default `40`, range 0 to 100. Export: `<progress value max="100">`. At most one CSS rule.
5. **Slider** — `slider`. `value` number, default `40`, range 0 to 100. Export: `<input type="range">`.
6. **Empty** — `empty`. `title` default `Empty`. `message` default `Nothing here`. Export: a div with both.
7. **Item** — `item`. `title` default `Item`. `description` default `Description`. No icon and no action. Export: a div with both.
8. **Marker** — `marker`. `text` default `Marker`. Not `เส้นคั่น`. Export: a div.
9. **Bubble** — `bubble`. `text` default `Message`. `align` `"start"` or `"end"`, default `start`. Export: a div. No reactions.
10. **Message** — `message`. `sender` default `Name`. `text` default `Message`. `align` `"start"` or `"end"`, default `start`. Export: a div. No nested avatar.

## 2. Choices

Static lists the user types. Nothing is submitted.

11. **Select** — `select`. Select and Native Select are this one kind. `value` string. `options` string array, two English defaults. Export: `<select>`. Combobox is not this kind.
12. **Radio Group** — `radio`. `value` string. `options` string array, two English defaults. Export: a radio group, one checked.
13. **Toggle** — `toggle`. `label` default `Toggle`. `pressed` boolean, default false. Canvas click selects and does not flip. Export: a button with `aria-pressed`.
14. **Toggle Group** — `toggleGroup`. `active` number, default `0`. `items` string array, defaults `One` and `Two`. Export: radio and CSS. Canvas click selects.
15. **Tabs** — `tabs`. `active` number, default `0`. `items` array of `{ label, text }`, defaults `Tab 1` and `Tab 2` with short English text. No child nodes. Export: radio and CSS. Canvas click selects.
16. **Input Group** — `inputGroup`. `prefix` string, default empty. `placeholder` default `Type here`. `suffix` string, default empty. Does not change `input`. Export: the prefix, an `<input>`, and the suffix.
17. **Input OTP** — `inputOtp`. `length` number, default `6`. `value` string, default empty. Export: one `<input>` per box. No package.

## 3. Disclosure

Saved state only. Canvas click selects and does not open, close, or switch. Export uses `<details>` or a visible block. No script.

18. **Accordion** — `accordion`. `open` number, default `0`. `items` array of `{ label, text }`, two English defaults. Export: `<details>`. The open item has the `open` attribute.
19. **Collapsible** — `collapsible`. `label` default `Details`. `text` default `Content`. `open` boolean, default true. Export: `<details>`.
20. **Breadcrumb** — `breadcrumb`. `items` array of `{ label, href }`, two English defaults. Export: a nav. An empty href is text.
21. **Pagination** — `pagination`. `active` number, default `0`. `items` string array, defaults `1`, `2`, `3`. Export: a nav. No remote pages.
22. **Navigation Menu** — `navigationMenu`. `items` array of `{ label, href }`, two English defaults. Export: a nav. No flyout.
23. **Menubar** — `menubar`. `items` array of `{ label, text }`, two English defaults, rendered expanded. No flyout.
24. **Dropdown Menu** — `dropdownMenu`. `label` default `Menu`. `items` string array, two English defaults. Export: `<details>`.
25. **Dialog** — `dialog`. `title` default `Dialog`. `message` default `Note`. `open` boolean, default true. Export: the title and message when `open` is true.
26. **Alert Dialog** — `alertDialog`. `title` default `Alert`. `message` default `Note`. `confirm` default `OK`. `cancel` default `Cancel`. Neither button runs an action. Export: those four strings.
27. **Sheet** — `sheet`. `title` default `Sheet`. `message` default `Note`. `side` `"left"` or `"right"`, default `right`. `open` boolean, default true. Export: a div when open.
28. **Drawer** — `drawer`. `title` default `Drawer`. `message` default `Note`. `open` boolean, default true. Export: a div when open, from the bottom edge.
29. **Popover** — `popover`. `label` default `Open`. `text` default `Note`. Export: `<details>`.
30. **Tooltip** — `tooltip`. `label` default `Tip`. `tip` default `More`. Export: the label and the tip as text. No hover.
31. **Hover Card** — `hoverCard`. `title` default `Title`. `text` default `Details`. Export: both visible. No hover.

## Out

Not work here: Table, Data Table, Chart, Calendar, Date Picker, Sidebar, Carousel, Spinner, Skeleton, Sonner, Toast, Resizable, Scroll Area, Aspect Ratio, Command, Combobox, Context Menu, Message Scroller, Attachment, Direction. Also dashboard, login, Vite export, backend, database, animation, mobile, and the eight blocks in `docs/PHASE-6-SPEC.md`. Form, Field, Questionnaire, and submit are later, when forms are built. They are not items here.

## Acceptance

P6B-S1. DEV does not start until the user accepts this.

- The palette nodes, `ช่องข้อความ`, `Checkbox`, and the six Thai blocks behave exactly as they do now.
- The new tiles appear after `Checkbox`, in the order above, and in `เพิ่มองค์ประกอบ`.
- A document with any new kind saves as version `4`. A document without them does not.
- The zip is still HTML and CSS. No script, no package.
- `schema.ts` and `defaults.rs` are not edited by this spec.
