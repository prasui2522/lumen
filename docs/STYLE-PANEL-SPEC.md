# Web Builder — Style Panel Spec

**Product:** Web Builder (Tauri desktop)
**Depends on:** Phase 2 canvas (`DesignCanvas`, `node-view.tsx`, `document-ops.ts`), `StylePanel.tsx` (fields currently disabled)
**Hard constraints:**
- Schema v1.1 is **locked**. Only fields that already exist in `src/schema.ts` (`StyleProps`, plus the container layout props and heading level that already live in `NodeProps`). No new keys, no animation or effect fields.
- Saves stay **sparse**: a field the user has not set is absent from `node.style`, and the canvas and compiler fill it from `DEFAULT_STYLES` (mirrored in `defaults.rs`).
- Low CPU: no color-picker or CSS-parsing libraries. Native inputs and the shadcn pieces already in the repo.

---

## 0. Where values come from

For the selected node, every field shows the **effective value**:

```
effective = resolvedStyle(node)[key]      // DEFAULT_STYLES[type] + heading level size + node.style
isOverridden = key in node.style           // own value saved on this node
```

- `resolvedStyle()` in `schema.ts` is the single source for defaults. Do not duplicate default numbers in the panel.
- Heading `fontSize` default comes from `HEADING_FONT_SIZE[level]`, which `resolvedStyle` already applies.
- If `DEFAULT_STYLES[type]` has no value for a key (for example `borderColor` on `text`), the field shows an empty placeholder **ไม่ได้ตั้งค่า** and the browser default applies.

---

## 1. Panel structure

Keep the current shell (`w-72`, `bg-sidebar`, header **สไตล์**). Below the header:

```
┌ สไตล์ ─────────────────────────────┐
│ องค์ประกอบ                          │  name + type label (existing)
│  หัวข้อ · หัวข้อ H2                  │
├─────────────────────────────────────┤
│ ▾ เลย์เอาต์         (containers)    │  props, not style
│ ▾ การแสดงผล                         │
│ ▾ ขนาด                              │
│ ▾ ระยะห่าง                           │
│ ▾ ตัวอักษร          (text-bearing)   │
│ ▾ พื้นหลัง                           │
│ ▾ เส้นขอบ                            │
└─────────────────────────────────────┘
```

- **Order (amended 2026-10-18, Phase 10 step 8):** การแสดงผล moved from last to second, right after เลย์เอาต์ (`STYLE_SECTIONS` in `src/lib/style-fields.ts`). As the last section, ความทึบ sat about 1,150 px down the panel, below the fold at the default 800 px window height and the 640 px minimum. Fields and behaviour are unchanged.

- Sections are collapsible (plain `<details>`/`<summary>` or a small disclosure button; no accordion library needed). All open by default; remember open/closed per section in `editor-store` for the session.
- A section is **hidden entirely** when no field in it applies to the node type (see §3).
- Section header row: title on the left, and **รีเซ็ต** (ghost `size="xs"`) on the right, shown only when at least one field in the section is overridden. It removes every overridden key of that section from `node.style` in one update.
- Remove the placeholder hint `แก้ไขสไตล์เต็มรูปแบบในเฟสถัดไป` once fields are live.

### Field row layout

```
[•] ป้ายชื่อ              [ control ............ ] [↺]
```

- Label column: `text-xs`, fixed width about 88px so controls line up.
- `•` override marker: a 6px dot in `--primary` before the label, and the label switches from `text-muted-foreground` to `text-foreground font-medium`. Default fields keep muted labels and show the default value in muted text inside the control.
- `↺` reset: `Button variant="ghost" size="icon-xs"` with Lucide `RotateCcw`, `aria-label="คืนค่าเริ่มต้น"`. Rendered only when the field is overridden (keep the space reserved so rows do not jump).
- Row height 32px (`h-8` controls), `gap-2` between rows, `space-y-3` inside a section, sections separated by `border-t border-sidebar-border pt-3`.

---

## 2. Controls

| Control | Used for | Behavior |
|---------|----------|----------|
| **Number** | fontSize, borderRadius, borderWidth, gap | `Input type="number"` `h-8`, suffix `px` shown inside the right edge in muted text. Arrow keys step 1, Shift+Arrow step 10. Clamp to the range in §3. |
| **Number + unit** | width, height, minHeight, maxWidth | Number input plus a small unit select: `px`, `%`, `auto`. `auto` disables the number input. Saves `number` for px (schema: unitless = px), `"50%"` string for %, `"auto"` for auto. Any other existing string (for example `"100vh"`) is shown as-is in a text input with unit `—` so nothing is lost. |
| **Unitless number** | lineHeight | Number input step 0.05, range 1 to 3, no suffix. An existing string value is shown read-only with a reset button. |
| **Box spacing** | margin, padding | See §2.1. |
| **Color** | color, backgroundColor, borderColor | See §2.2. |
| **Select** | fontFamily, fontWeight, heading level | shadcn `Select` (add if missing) or native `<select>` styled with Input classes. |
| **Segmented** | textAlign, direction, align, justify, borderStyle, overflow | Button cluster like `ModeSwitch` (`rounded-md border`, `size="xs"`, active `secondary`, `aria-pressed`). Icons from Lucide with Thai `aria-label`. |
| **Slider + number** | opacity | Native `<input type="range">` 0 to 100 step 5 plus a small number box showing `%`. Saves 0 to 1 (two decimals). |

### 2.1 Box spacing (margin, padding)

Schema allows `number` (all sides) or `{ t, r, b, l }`.

```
ระยะใน   [ 16 ] px   [⛶]        ← linked (one value)
ระยะใน   บน[32] ขวา[24] ล่าง[32] ซ้าย[24]   [⛶]   ← unlinked
```

- Toggle button (Lucide `Link2` / `Unlink2`, `aria-label="แยกแต่ละด้าน"`) switches linked and unlinked.
- Linked writes a single `number`. Unlinked writes `{t,r,b,l}` with all four keys present.
- Open in unlinked mode when the effective value is an object with different sides; otherwise linked.
- Unlinked inputs: four compact number inputs in a 4-column grid with labels **บน ขวา ล่าง ซ้าย** (`text-[10px]` above each).
- Range 0 to 400 for padding; margin allows −400 to 400.

### 2.2 Color

No color library.

```
สีตัวอักษร  [■] [#0f172a     ]
```

- Swatch: native `<input type="color">` (22px square, rounded, bordered). Native pickers only support `#rrggbb`, which is fine.
- Text field: accepts `#rgb`, `#rrggbb`, and the keyword `transparent`. Validate with one small regex; on invalid input show the red ring (`aria-invalid`) and do not write.
- Background only: a small **โปร่งใส** toggle (checkerboard mini swatch) that writes `transparent`.
- Existing values in other formats (`rgb(...)`, named colors) are shown as text and kept until the user changes them; the swatch shows a checkerboard when it cannot parse.
- Optional row of 8 preset swatches under the field taken from the existing default palette (`#0f172a #334155 #ffffff #0ea5e9 #0284c7 #e2e8f0 #f8fafc transparent`). Plain buttons, no picker popover.

---

## 3. Fields per node type

`✓` = shown. Blank = hidden for that type. Keys not listed here are **not exposed in v1** (see §3.2).

### Layout (เลย์เอาต์) — writes `node.props`, not `node.style`

| Field | Thai label | Key | Control | Values | page | section | container |
|-------|-----------|-----|---------|--------|:-:|:-:|:-:|
| Direction | ทิศทาง | `props.direction` | Segmented | แนวนอน `row` / แนวตั้ง `column` | | | ✓ |
| Gap | ช่องไฟ | `props.gap` | Number px | 0 to 200 | | | ✓ |
| Align | จัดแนว | `props.align` | Segmented | เริ่ม / กลาง / ท้าย / ยืด | | | ✓ |
| Justify | กระจาย | `props.justify` | Segmented | เริ่ม / กลาง / ท้าย / ห่างเท่ากัน | | | ✓ |

- Defaults from `DEFAULT_CONTAINER_PROPS`. Reset deletes the optional prop key.
- Align/justify icons should rotate with `direction` (row vs column) so they match what the user sees.

### Heading level (inside องค์ประกอบ block, heading only)

| Field | Thai label | Key | Control |
|-------|-----------|-----|---------|
| Level | ระดับ | `props.level` | Segmented `H1`–`H6` |

Changing level changes the default font size. If `style.fontSize` is overridden, the override stays and the panel shows it as overridden.

### Size (ขนาด)

| Field | Thai | Key | Control | Range | page | section | container | heading | text | image | button | link | spacer |
|-------|------|-----|---------|-------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Width | กว้าง | `width` | Number+unit | 0 to 4000 px, 0 to 100 % | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| Height | สูง | `height` | Number+unit | 0 to 4000 | | | ✓ | | | ✓ | ✓ | | |
| Min height | สูงขั้นต่ำ | `minHeight` | Number+unit | 0 to 4000 | | ✓ | ✓ | | | | | | |
| Max width | กว้างสูงสุด | `maxWidth` | Number+unit | 0 to 4000 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | |

- Spacer height stays on `props.size` (existing spacer behaviour). Show it in Size as **สูง** bound to `props.size`, number px 0 to 400, for spacer only.
- Link is inline, so width/height are hidden.

### Spacing (ระยะห่าง)

| Field | Thai | Key | page | section | container | heading | text | image | button | link | spacer |
|-------|------|-----|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Padding | ระยะใน | `padding` | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | |
| Margin | ระยะนอก | `margin` | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Typography (ตัวอักษร)

| Field | Thai | Key | Control | Values | page | section | container | heading | text | button | link |
|-------|------|-----|---------|--------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Font | แบบอักษร | `fontFamily` | Select | presets below | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Size | ขนาด | `fontSize` | Number px | 8 to 200 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Weight | น้ำหนัก | `fontWeight` | Select | 300 บาง, 400 ปกติ, 500 กลาง, 600 กึ่งหนา, 700 หนา, 800 หนามาก | ✓ | | | ✓ | ✓ | ✓ | ✓ |
| Line height | ระยะบรรทัด | `lineHeight` | Unitless | 1 to 3 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Align | จัดข้อความ | `textAlign` | Segmented | ซ้าย / กลาง / ขวา | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Color | สีตัวอักษร | `color` | Color | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

- Typography on page/section/container is inherited by children (CSS inheritance), which is how the page defaults already work. Show a one-line hint under the section for those types: **ค่าที่ตั้งจะส่งต่อให้องค์ประกอบด้านใน**.
- `fontWeight` legacy values `"normal"` and `"bold"` display as 400 and 700. Writing always saves a number.
- Font presets (CSS stacks with system fallbacks; no web font downloads in v1):

| Label | Value |
|-------|-------|
| ระบบ (ค่าเริ่มต้น) | reset (delete key) |
| Sans ไทย | `"Noto Sans Thai", "Sarabun", ui-sans-serif, system-ui, sans-serif` |
| Serif | `ui-serif, Georgia, "Times New Roman", serif` |
| Mono | `ui-monospace, "SFMono-Regular", Menlo, monospace` |

  An existing value that matches no preset shows as **กำหนดเอง** with the raw stack in a tooltip.

### Background (พื้นหลัง)

| Field | Thai | Key | Types |
|-------|------|-----|-------|
| Color | สีพื้นหลัง | `backgroundColor` | page, section, container, button, heading, text |

Hidden for image, link, spacer.

### Border (เส้นขอบ)

| Field | Thai | Key | Control | Range | Types |
|-------|------|-----|---------|-------|-------|
| Style | รูปแบบ | `borderStyle` | Segmented ไม่มี / เส้นทึบ | | section, container, image, button |
| Width | ความหนา | `borderWidth` | Number px | 0 to 20 | same |
| Color | สีเส้น | `borderColor` | Color | | same |
| Radius | มุมโค้ง | `borderRadius` | Number px | 0 to 200 | section, container, image, button |

- Width and color are disabled (muted) while style is `none`, with hint **เลือก "เส้นทึบ" เพื่อแสดงเส้นขอบ**.
- Setting width above 0 while style is `none` is not possible from the UI, so users do not get an invisible border.

### Display (การแสดงผล)

| Field | Thai | Key | Control | Types |
|-------|------|-----|---------|-------|
| Opacity | ความทึบ | `opacity` | Slider + % | all except page |
| Overflow | ส่วนเกิน | `overflow` | Segmented แสดง / ซ่อน | section, container, image |

### 3.2 In schema but not exposed in v1

- `display`: changing it can break layout (for example making a container `block` kills flex). Keep whatever is saved. Visibility stays on the node's `visible` flag in Layers.
- Any string value the controls cannot represent is preserved and shown read-only with a reset button.

---

## 4. Selection behaviour

| Selection | Panel |
|-----------|-------|
| **None** | Existing empty state **เลือกองค์ประกอบเพื่อแก้ไข**. |
| **Root (page)** | Header shows **หน้า**. Sections limited to page column above (Size: max width; Spacing: padding; Typography; Background). Hint under header: **สไตล์ของหน้าจะใช้กับทั้งหน้า**. |
| **Locked node** | All controls disabled; banner at top `text-xs` with Lucide `Lock`: **องค์ประกอบถูกล็อก ปลดล็อกในเลเยอร์เพื่อแก้ไข**. Reset buttons hidden. |
| **Hidden node** (`visible: false`) | Editable. Small muted note **ซ่อนอยู่บนผืนผ้าใบ**. |
| **Multi-select** | Not supported (store holds one `selectedNodeId`). No multi UI in v1. When multi-select arrives later: show only fields shared by all selected types, show **หลายค่า** where values differ, and apply a change to every node in one update. |
| **Preview mode** | Panel is not mounted (existing behaviour). |
| **Selected node deleted** | Falls back to the None state (store clears selection). |

Switching selection must not carry a half-typed value to the next node: uncommitted input is discarded when `selectedNodeId` changes.

---

## 5. Writing values (live update and dirty)

All writes go through one helper in `document-ops.ts`, used by every control:

```ts
setNodeStyle(doc, nodeId, key, value | undefined): PageDocument | null
setNodeProp(doc, nodeId, key, value | undefined): PageDocument | null   // layout, level, spacer size
```

Rules:
1. `undefined` deletes the key (reset). If `node.style` becomes `{}`, keep it as `{}` (schema requires `style`).
2. **Sparse normalisation:** if the new value deep-equals the type default from `DEFAULT_STYLES` (or `HEADING_FONT_SIZE` for heading font size, or `DEFAULT_CONTAINER_PROPS`), delete the key instead of saving it.
3. Locked nodes: helper returns `null` (no-op), matching `moveNodeInDocument`.
4. Result goes to `updateOpenDocument`, which already sets `dirty: true`, so the Save button shows **บันทึก\*** with no extra wiring.

Commit timing:

| Control | Commits |
|---------|---------|
| Segmented, select, color swatch, toggles, reset | Immediately on change |
| Number inputs | On each valid parse while typing, coalesced to one write per animation frame; invalid or empty text is not written. Enter or blur finalises; Escape restores the last committed value. |
| Color text field | On blur/Enter when the regex passes |
| Opacity slider | During drag, coalesced per animation frame |

- Canvas re-renders from `openDocument`, so edits appear live with no extra state.
- Future undo/redo: one drag or one typing burst should count as one step. Keep writes going through the single helper so undo can group them later.

---

## 6. Performance

- Subscribe the panel to `openDocument.nodes[selectedNodeId]` only (selector by id), not the whole document, so edits elsewhere do not re-render it.
- Split sections into memoised components that take `(node, effective)`.
- Compute `resolvedStyle(node)` once per render of the panel and pass it down.
- No color, unit-parsing, or form libraries. Native `input[type=color]` and `input[type=range]`.
- Coalesce high-frequency writes per animation frame (see §5).

---

## 7. Accessibility

- Every control has a visible Thai label bound with `htmlFor`/`id`, or `aria-label` for icon-only buttons.
- Segmented groups use `role="group"` with a Thai `aria-label` and `aria-pressed` on each button (same pattern as `ModeSwitch`).
- Override state is announced: the reset button label includes the field name, for example `คืนค่าเริ่มต้น: ขนาดตัวอักษร`.
- Invalid input sets `aria-invalid` and shows a one-line hint under the field.
- Tab order follows visual order; collapsed sections remove their controls from the tab order.

---

## 8. Copy sheet

| Sense | Thai |
|-------|------|
| Layout | เลย์เอาต์ |
| Size | ขนาด |
| Spacing | ระยะห่าง |
| Typography | ตัวอักษร |
| Background | พื้นหลัง |
| Border | เส้นขอบ |
| Display | การแสดงผล |
| Reset section | รีเซ็ต |
| Reset field | คืนค่าเริ่มต้น |
| Not set | ไม่ได้ตั้งค่า |
| Mixed values (future) | หลายค่า |
| Custom | กำหนดเอง |
| Transparent | โปร่งใส |
| Link sides | แยกแต่ละด้าน |
| Top / right / bottom / left | บน / ขวา / ล่าง / ซ้าย |
| Locked banner | องค์ประกอบถูกล็อก ปลดล็อกในเลเยอร์เพื่อแก้ไข |
| Hidden note | ซ่อนอยู่บนผืนผ้าใบ |
| Inherit hint | ค่าที่ตั้งจะส่งต่อให้องค์ประกอบด้านใน |
| Page hint | สไตล์ของหน้าจะใช้กับทั้งหน้า |
| Border hint | เลือก "เส้นทึบ" เพื่อแสดงเส้นขอบ |

Replace the English placeholders currently in `StylePanel.tsx` (`padding`, `gap`, `align`, `justify`).

---

## 9. Suggested files

```
src/lib/document-ops.ts                 # + setNodeStyle, setNodeProp, isDefaultValue
src/lib/style-fields.ts                 # NEW: field table (key, label, control, range, types) from §3
src/components/editor/StylePanel.tsx    # renders sections from style-fields
src/components/editor/style/
  FieldRow.tsx          # label, override dot, reset
  NumberField.tsx
  UnitField.tsx
  BoxSpacingField.tsx
  ColorField.tsx
  SegmentedField.tsx
  SelectField.tsx
  OpacityField.tsx
```

Driving the panel from one field table keeps type rules in one place and makes the compiler team's check easy.

---

## 10. Out of scope

- Any new `StyleProps` key (shadows, gradients, transforms, transitions, animations, positions, z-index)
- Responsive or per-breakpoint styles
- Hover/active states
- Class-based styles (`classNames`) editing
- Web font downloading
- Multi-select editing (behaviour described in §4 for later)
- Undo/redo (writes are structured for it)

---

## 11. Acceptance checklist

- [ ] No selection shows the empty state; selecting a node shows only the sections and fields allowed for its type (§3)
- [ ] Every field shows the effective value from `resolvedStyle`; heading size follows level
- [ ] Overridden fields show the dot, stronger label, and a reset button; defaults show muted
- [ ] Field reset deletes the key; section **รีเซ็ต** deletes all overridden keys in that section
- [ ] Setting a value equal to the default stores nothing (sparse)
- [ ] Container layout writes `props.direction/gap/align/justify`; spacer height writes `props.size`; heading level writes `props.level`
- [ ] Box spacing link/unlink writes `number` vs `{t,r,b,l}` correctly and round-trips existing values
- [ ] Width/height units save `number` (px), `"N%"`, or `"auto"`; unknown strings are preserved
- [ ] Color accepts `#rgb`, `#rrggbb`, `transparent`; invalid input is not written and is marked invalid
- [ ] Border width/color disabled while style is ไม่มี
- [ ] Root page shows only page-level fields and the page hint
- [ ] Locked node: all controls disabled with banner; hidden node stays editable
- [ ] Edits update the canvas live and set dirty; Save clears dirty and persists; reopening the project shows the same values
- [ ] Changing selection discards half-typed input
- [ ] No new dependencies for color, units, or forms; panel does not re-render on edits to other nodes
- [ ] All labels Thai per §8; no English placeholders left
- [ ] `src/schema.ts` and `defaults.rs` untouched
