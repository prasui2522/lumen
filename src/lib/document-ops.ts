import type {
  AspectRatioProps,
  BoxSpacing,
  ChartKind,
  ChartSeries,
  ListMarker,
  Node,
  NodeId,
  NodeProps,
  NodeType,
  PageDocument,
  StyleBreakpoint,
  StyleProps,
} from "@/schema";
import {
  A2_LAYOUT_DEFAULTS,
  A3_LAYOUT_DEFAULTS,
  A5_LAYOUT_DEFAULTS,
  ASPECT_RATIOS,
  DEFAULT_CONTAINER_PROPS,
  DEFAULT_STYLES,
  HEADING_FONT_SIZE,
  LIST_MARKERS,
  getChildren,
  isContainerType,
  isLocked,
  isPhase6bType,
  resolvedStyle,
} from "@/schema";
import { MAX_SELECT_OPTIONS } from "@/lib/select-options";
import { MAX_LIST_ITEMS } from "@/lib/list-items";
import { capColumns, normalizeTableRows, tableModelEqual } from "@/lib/table-model";
import { chartModelEqual, normalizeChartModel } from "@/lib/chart-model";
import { labelHrefItemsEqual, labelTextItemsEqual, menubarMenusEqual } from "@/lib/pair-options";
import type { LabelHrefItem, LabelTextItem, MenubarMenu } from "@/schema";

/**
 * Phase 11 A3.5: replace `input.suggestions` (sparse). Empty → key absent.
 * Capped at {@link MAX_SELECT_OPTIONS} (same line-list cap as select T22).
 */
export function setInputSuggestions(
  doc: PageDocument,
  nodeId: NodeId,
  suggestions: string[],
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node) || node.props.type !== "input") return null;
  const p = node.props;
  const next = suggestions.slice(0, MAX_SELECT_OPTIONS);
  const cur = p.suggestions ?? [];
  if (next.length === 0) {
    if (p.suggestions === undefined) return null;
    const { suggestions: _drop, ...rest } = p;
    return replaceNode(doc, { ...node, props: rest });
  }
  if (p.suggestions !== undefined && next.length === cur.length && next.every((s, i) => s === cur[i])) {
    return null;
  }
  return replaceNode(doc, { ...node, props: { ...p, suggestions: next } });
}

/**
 * Phase 11 A4.1: replace `list.items`. Capped at {@link MAX_LIST_ITEMS}.
 * Empty array is stored (a blank list is valid).
 */
export function setListItems(
  doc: PageDocument,
  nodeId: NodeId,
  items: string[],
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node) || node.props.type !== "list") return null;
  const p = node.props;
  const next = items.slice(0, MAX_LIST_ITEMS);
  if (next.length === p.items.length && next.every((s, i) => s === p.items[i])) return null;
  return replaceNode(doc, { ...node, props: { ...p, items: next } });
}

/**
 * Phase 11 A4.2: replace table columns + rows. Capped at {@link MAX_TABLE_COLS} /
 * {@link MAX_TABLE_ROWS}; rows are padded/truncated to the column width.
 */
export function setTableModel(
  doc: PageDocument,
  nodeId: NodeId,
  model: { columns: string[]; rows: string[][] },
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node) || node.props.type !== "table") return null;
  const p = node.props;
  const columns = capColumns(model.columns);
  const rows = normalizeTableRows(columns, model.rows);
  const next = { columns, rows };
  if (tableModelEqual(p, next)) return null;
  return replaceNode(doc, { ...node, props: { ...p, ...next } });
}

/**
 * Phase 11 A5.4: commit the chart editor in one history step —
 * kind / categories / series / caption.
 */
export function setChartEditorCommit(
  doc: PageDocument,
  nodeId: NodeId,
  model: {
    kind: ChartKind;
    categories: string[];
    series: ChartSeries[];
    caption: string;
  },
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node) || node.props.type !== "chart") return null;
  const p = node.props;
  const next = normalizeChartModel(model);
  const cur = {
    kind: p.kind,
    categories: p.categories,
    series: p.series,
    caption: p.caption,
  };
  if (chartModelEqual(cur, next)) return null;
  const props = {
    ...p,
    kind: next.kind,
    categories: next.categories,
    series: next.series,
  };
  if (next.caption === undefined) delete (props as { caption?: string }).caption;
  else props.caption = next.caption;
  return replaceNode(doc, { ...node, props });
}

/**
 * Phase 11 A4.3: commit the table editor in one history step —
 * columns/rows plus caption / headerRow / striped.
 */
export function setTableEditorCommit(
  doc: PageDocument,
  nodeId: NodeId,
  model: {
    columns: string[];
    rows: string[][];
    caption: string;
    headerRow: boolean;
    striped: boolean;
  },
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node) || node.props.type !== "table") return null;
  const p = node.props;
  const columns = capColumns(model.columns);
  const rows = normalizeTableRows(columns, model.rows);
  const caption = model.caption.trim() === "" ? undefined : model.caption;
  const headerRow = model.headerRow;
  const striped = model.striped;
  const gridSame = tableModelEqual(p, { columns, rows });
  const captionSame = (p.caption ?? undefined) === caption;
  const headerSame = p.headerRow === headerRow;
  const stripedSame = p.striped === striped;
  if (gridSame && captionSame && headerSame && stripedSame) return null;
  const props = { ...p, columns, rows, headerRow, striped };
  if (caption === undefined) delete (props as { caption?: string }).caption;
  else props.caption = caption;
  return replaceNode(doc, { ...node, props });
}

/**
 * True when the node must not be edited: itself locked, or the open page
 * root is locked (Phase 8 cascade). Unlocked pages keep per-node lock only.
 */
export function isContentLocked(doc: PageDocument, node: Node): boolean {
  if (isLocked(node)) return true;
  const root = doc.nodes[doc.root];
  return !!root && isLocked(root);
}

/**
 * Toggle node.locked. Allowed even when the page is content-locked so the
 * user can unlock from the layer / page menu.
 */
export function toggleNodeLocked(doc: PageDocument, nodeId: NodeId): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node) return null;
  const nextLocked = !isLocked(node);
  let next: Node;
  if (nextLocked) {
    next = { ...node, locked: true };
  } else {
    const { locked: _drop, ...rest } = node;
    next = rest;
  }
  return { ...doc, nodes: { ...doc.nodes, [nodeId]: next } };
}

/** Thai-first layer / inspector labels (schema types unchanged). */
export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  page: "หน้า",
  section: "ส่วน",
  container: "กล่อง",
  heading: "หัวข้อ",
  text: "ข้อความ",
  image: "รูปภาพ",
  button: "ปุ่ม",
  link: "ลิงก์",
  spacer: "ช่องว่าง",
  input: "ช่องข้อความ",
  switch: "Switch",
  textarea: "Textarea",
  kbd: "Kbd",
  avatar: "Avatar",
  progress: "Progress",
  slider: "Slider",
  empty: "Empty",
  item: "Item",
  marker: "Marker",
  bubble: "Bubble",
  message: "Message",
  // Phase 11 A3.4: existing native <select>; tile relabelled (FOLLOWUPS 68.2).
  select: "Native Select",
  radio: "Radio Group",
  toggle: "Toggle",
  toggleGroup: "Toggle Group",
  tabs: "Tabs",
  inputGroup: "Input Group",
  inputOtp: "Input OTP",
  accordion: "Accordion",
  collapsible: "Collapsible",
  breadcrumb: "Breadcrumb",
  pagination: "Pagination",
  navigationMenu: "Navigation Menu",
  menubar: "Menubar",
  dropdownMenu: "Dropdown Menu",
  dialog: "Dialog",
  alertDialog: "Alert Dialog",
  sheet: "Sheet",
  drawer: "Drawer",
  popover: "Popover",
  tooltip: "Tooltip",
  hoverCard: "Hover Card",
  card: "Card",
  alert: "Alert",
  badge: "Badge",
  separator: "Separator",
  skeleton: "Skeleton",
  spinner: "Spinner",
  aspectRatio: "Aspect Ratio",
  scrollArea: "Scroll Area",
  buttonGroup: "Button Group",
  checkbox: "Checkbox",
  field: "Field",
  list: "List",
  table: "Table",
  icon: "Icon",
  carousel: "Carousel",
  chart: "Chart",
  calendar: "Calendar",
};


/** F2 D7: default title of a new Alert Dialog (see `nodeDisplayName`). */
export const ALERT_DIALOG_DEFAULT_TITLE = "Alert";

export function nodeDisplayName(node: Node): string {
  if (node.name?.trim()) return node.name.trim();
  const p = node.props;
  if (p.type === "heading" || p.type === "text") {
    const t = p.content.trim();
    if (t) return t.length > 28 ? `${t.slice(0, 28)}…` : t;
  }
  // A3.1: the checkbox is not here; like the A2 kinds it shows its English kind name (FOLLOWUPS 66 rule).
  if (p.type === "button" || p.type === "link" || p.type === "input" || p.type === "switch") {
    const t = p.label.trim();
    if (t) return t.length > 28 ? `${t.slice(0, 28)}…` : t;
  }
  // F2 D7: a new Alert Dialog keeps its default title "Alert", which read like the Alert kind in Layers.
  // Until the title is edited the layer shows the kind name "Alert Dialog" (no stored name; export aria comes from the title).
  if (p.type === "alertDialog" && p.title.trim() === ALERT_DIALOG_DEFAULT_TITLE) return NODE_TYPE_LABEL.alertDialog;
  if (
    p.type === "empty" || p.type === "item" || p.type === "dialog" || p.type === "alertDialog" ||
    p.type === "sheet" || p.type === "drawer" || p.type === "hoverCard"
  ) {
    const t = p.title.trim();
    if (t) return t.length > 28 ? `${t.slice(0, 28)}…` : t;
  }
  if (
    p.type === "kbd" || p.type === "marker" || p.type === "bubble" || p.type === "message" ||
    p.type === "collapsible" || p.type === "popover" || p.type === "hoverCard"
  ) {
    const t = p.text.trim();
    if (t) return t.length > 28 ? `${t.slice(0, 28)}…` : t;
  }
  // A2.5.1 (F13 reversed by the Designer): every kind, the nine A2 kinds included, shows its English component
  // name (`NODE_TYPE_LABEL`); Thai words are palette search synonyms only (palette-meta.ts).
  return NODE_TYPE_LABEL[node.type];
}

export type ParentRef = { parentId: NodeId; index: number };

/** Find parent + index of a node among siblings. Root has no parent. */
export function findParent(
  doc: PageDocument,
  nodeId: NodeId,
): ParentRef | null {
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (!isContainerType(node.type)) continue;
    const kids = getChildren(node);
    const index = kids.indexOf(nodeId);
    if (index >= 0) return { parentId: id, index };
  }
  return null;
}

export function isDescendant(
  doc: PageDocument,
  ancestorId: NodeId,
  maybeDescendantId: NodeId,
): boolean {
  if (ancestorId === maybeDescendantId) return true;
  const node = doc.nodes[ancestorId];
  if (!node) return false;
  for (const childId of getChildren(node)) {
    if (isDescendant(doc, childId, maybeDescendantId)) return true;
  }
  return false;
}

/**
 * Whether `nodeId` may be dropped into `targetParentId` at `index`
 * (0..children.length). Rejects root moves, locked targets, self-nesting.
 */
export function canDropNode(
  doc: PageDocument,
  nodeId: NodeId,
  targetParentId: NodeId,
  index: number,
): boolean {
  if (nodeId === doc.root) return false;
  if (nodeId === targetParentId) return false;
  const moving = doc.nodes[nodeId];
  const parent = doc.nodes[targetParentId];
  if (!moving || !parent) return false;
  if (!isContainerType(parent.type)) return false;
  if (isContentLocked(doc, parent) || isContentLocked(doc, moving)) return false;
  if (isDescendant(doc, nodeId, targetParentId)) return false;

  const kids = getChildren(parent);
  if (index < 0 || index > kids.length) return false;

  // Same-parent no-op (already at that slot or adjacent equivalent).
  const current = findParent(doc, nodeId);
  if (current && current.parentId === targetParentId) {
    if (index === current.index || index === current.index + 1) return false;
  }
  return true;
}

function withChildren(node: Node, children: NodeId[]): Node {
  // Every kind in CONTAINER_NODE_TYPES carries `children` in its props (A2.2);
  // a leaf is returned unchanged (callers check `canInsertInto` first).
  if (!isContainerType(node.type)) return node;
  return { ...node, props: { ...node.props, children } as Node["props"] };
}

/**
 * Immutable move/reparent. Returns null if the drop is invalid.
 * `index` is the insertion index in the target parent's children
 * *before* removing from the old parent when parents differ; when
 * same parent, index is interpreted in the pre-remove list and
 * adjusted.
 */
export function moveNodeInDocument(
  doc: PageDocument,
  nodeId: NodeId,
  targetParentId: NodeId,
  index: number,
): PageDocument | null {
  if (!canDropNode(doc, nodeId, targetParentId, index)) return null;

  const current = findParent(doc, nodeId);
  if (!current) return null;

  const nodes = { ...doc.nodes };

  const oldParent = nodes[current.parentId];
  if (!oldParent) return null;
  const oldKids = [...getChildren(oldParent)];
  oldKids.splice(current.index, 1);

  let insertAt = index;
  if (current.parentId === targetParentId && insertAt > current.index) {
    insertAt -= 1;
  }

  if (current.parentId === targetParentId) {
    oldKids.splice(insertAt, 0, nodeId);
    nodes[current.parentId] = withChildren(oldParent, oldKids);
  } else {
    nodes[current.parentId] = withChildren(oldParent, oldKids);
    const newParent = nodes[targetParentId];
    if (!newParent) return null;
    const newKids = [...getChildren(newParent)];
    newKids.splice(insertAt, 0, nodeId);
    nodes[targetParentId] = withChildren(newParent, newKids);
  }

  return { ...doc, nodes };
}

export type LayerRow = {
  id: NodeId;
  type: NodeType;
  label: string;
  depth: number;
  locked: boolean;
};

/** Depth-first flatten for Layers panel (includes invisible nodes). */
export function flattenLayers(
  doc: PageDocument,
  rootId: NodeId = doc.root,
  depth = 0,
  out: LayerRow[] = [],
): LayerRow[] {
  const node = doc.nodes[rootId];
  if (!node) return out;
  out.push({
    id: node.id,
    type: node.type,
    label: nodeDisplayName(node),
    depth,
    locked: isLocked(node),
  });
  for (const childId of getChildren(node)) {
    flattenLayers(doc, childId, depth + 1, out);
  }
  return out;
}

/** Build a small demo tree under an empty page (existing node types only). */
export function seedDemoUnderPage(doc: PageDocument): PageDocument | null {
  const page = doc.nodes[doc.root];
  if (!page || page.props.type !== "page") return null;
  if (page.props.children.length > 0) return null;

  const sectionId = crypto.randomUUID();
  const headingId = crypto.randomUUID();
  const textId = crypto.randomUUID();
  const buttonId = crypto.randomUUID();

  const nodes: PageDocument["nodes"] = {
    ...doc.nodes,
    [doc.root]: withChildren(page, [sectionId]),
    [sectionId]: {
      id: sectionId,
      type: "section",
      name: "ส่วนแนะนำ",
      props: { type: "section", children: [headingId, textId, buttonId] },
      style: {},
    },
    [headingId]: {
      id: headingId,
      type: "heading",
      props: { type: "heading", level: 1, content: "ยินดีต้อนรับ" },
      style: {},
    },
    [textId]: {
      id: textId,
      type: "text",
      props: {
        type: "text",
        content: "ลากองค์ประกอบบนผ้าใบเพื่อจัดเรียง หรือเลือกเพื่อดูสไตล์",
      },
      style: {},
    },
    [buttonId]: {
      id: buttonId,
      type: "button",
      props: { type: "button", label: "เริ่มต้น", action: "none" },
      style: {},
    },
  };

  return { ...doc, nodes };
}

/* ------------------------------------------------------------------ */
/* Phase 2b — palette insert / delete / keyboard navigation helpers   */
/* ------------------------------------------------------------------ */

/** A new badge's label (Thai-first; the Phase 5B block called it "ป้าย"). */
export const A2_NEW_BADGE_LABEL = "ป้าย";
/** PHASE-11-SPEC §9: spinner `size` 24 (12–64 allowed). */
export const A2_SPINNER_DEFAULT_SIZE = 24;
export const A2_SPINNER_MIN_SIZE = 12;
export const A2_SPINNER_MAX_SIZE = 64;

/** Phase 11 A4.5: icon size / stroke defaults and clamps. */
export const ICON_DEFAULT_NAME = "star";
export const ICON_DEFAULT_SIZE = 24;
export const ICON_MIN_SIZE = 12;
export const ICON_MAX_SIZE = 128;
export const ICON_DEFAULT_STROKE = 2;
export const ICON_MIN_STROKE = 1;
export const ICON_MAX_STROKE = 4;

/** Types offered in the add-element palette (page is root-only). */
export const PALETTE_TYPES = [
  "section",
  "container",
  "heading",
  "text",
  "image",
  "button",
  "link",
  "spacer",
  "input",
  "switch",
  "textarea",
  "kbd",
  "avatar",
  "progress",
  "slider",
  "empty",
  "item",
  "marker",
  "bubble",
  "message",
  "select",
  "radio",
  "toggle",
  "toggleGroup",
  "tabs",
  "inputGroup",
  "inputOtp",
  "accordion",
  "collapsible",
  "breadcrumb",
  "pagination",
  "navigationMenu",
  "menubar",
  "dropdownMenu",
  "dialog",
  "alertDialog",
  "sheet",
  "drawer",
  "popover",
  "tooltip",
  "hoverCard",
  // Phase 11 A2.5: the nine A2 kinds (palette groups: palette-meta.ts).
  "card",
  "alert",
  "badge",
  "separator",
  "skeleton",
  "spinner",
  "aspectRatio",
  "scrollArea",
  "buttonGroup",
  // Phase 11 A3.1
  "checkbox",
  // Phase 11 A3.3
  "field",
  // Phase 11 A4.1
  "list",
  // Phase 11 A4.2
  "table",
  // Phase 11 A4.5
  "icon",
  // Phase 11 A5.1
  "carousel",
  // Phase 11 A5.3
  "chart",
  // Phase 11 A5.5
  "calendar",
] as const satisfies readonly NodeType[];

export type PaletteType = (typeof PALETTE_TYPES)[number];

export function isPaletteType(v: string): v is PaletteType {
  return (PALETTE_TYPES as readonly string[]).includes(v);
}

/**
 * Minimal valid schema v1.1 node. Only required props are set; optional
 * props + style stay sparse so DEFAULT_STYLES / DEFAULT_CONTAINER_PROPS apply.
 */
export function createNode(type: PaletteType): Node {
  const id = crypto.randomUUID();
  const base = { id, type, style: {} } as const;
  switch (type) {
    case "section":
      return { ...base, props: { type: "section", children: [] } };
    case "container":
      return { ...base, props: { type: "container", children: [] } };
    // Phase 11 A2.5. Required props only; layout props and style stay sparse (A2_LAYOUT_DEFAULTS / DEFAULT_STYLES apply).
    case "card":
      return { ...base, props: { type: "card", children: [] } };
    case "alert":
      return { ...base, props: { type: "alert", children: [] } };
    case "buttonGroup":
      return { ...base, props: { type: "buttonGroup", children: [] } };
    case "aspectRatio":
      return { ...base, props: { type: "aspectRatio", ratio: "16/9", children: [] } };
    case "scrollArea":
      return { ...base, props: { type: "scrollArea", orientation: "vertical", children: [] } };
    case "badge":
      return { ...base, props: { type: "badge", label: A2_NEW_BADGE_LABEL } };
    case "separator":
      return { ...base, props: { type: "separator", orientation: "horizontal" } };
    case "skeleton":
      return { ...base, props: { type: "skeleton" } };
    case "spinner":
      return { ...base, props: { type: "spinner", size: A2_SPINNER_DEFAULT_SIZE } };
    case "heading":
      return {
        ...base,
        props: { type: "heading", level: 2, content: "หัวข้อใหม่" },
      };
    case "text":
      return { ...base, props: { type: "text", content: "ข้อความใหม่" } };
    case "image":
      // Asset pipeline not wired yet — empty asset id placeholder.
      return { ...base, props: { type: "image", src: { id: "" } } };
    case "button":
      return { ...base, props: { type: "button", label: "ปุ่ม" } };
    case "link":
      return {
        ...base,
        props: { type: "link", label: "ลิงก์", href: "#" },
      };
    case "spacer":
      return { ...base, props: { type: "spacer", size: 32 } };
    case "input":
      return {
        ...base,
        props: { type: "input", label: "", placeholder: "พิมพ์ที่นี่" },
      };
    case "switch":
      return {
        ...base,
        props: { type: "switch", label: "Switch", checked: false }, // A3.2 (changed ruling 6): new nodes only
      };
    case "checkbox":
      return {
        ...base,
        props: { type: "checkbox", label: "ยอมรับเงื่อนไข", checked: false },
      };
    case "field":
      // Phase 11 A3.3: empty children; label always stored; description/error sparse.
      return {
        ...base,
        props: { type: "field", label: "Label", children: [] },
      };
    case "list":
      // Phase 11 A4.1: three sample items; unordered disc by default.
      return {
        ...base,
        props: {
          type: "list",
          items: ["รายการ 1", "รายการ 2", "รายการ 3"],
          ordered: false,
          marker: "disc",
        },
      };
    case "table":
      // Phase 11 A4.2: three columns, two empty rows; header row on, not striped.
      return {
        ...base,
        props: {
          type: "table",
          columns: ["คอลัมน์ 1", "คอลัมน์ 2", "คอลัมน์ 3"],
          rows: [
            ["", "", ""],
            ["", "", ""],
          ],
          headerRow: true,
          striped: false,
        },
      };
    case "icon":
      // Phase 11 A4.5: curated Lucide glyph; decorative by default (no label).
      return {
        ...base,
        props: {
          type: "icon",
          name: ICON_DEFAULT_NAME,
          size: ICON_DEFAULT_SIZE,
          strokeWidth: ICON_DEFAULT_STROKE,
        },
      };

    case "carousel":
      // Phase 11 A5.1: empty children; layout props + slidesPerView sparse (A5_LAYOUT_DEFAULTS apply).
      return { ...base, props: { type: "carousel", children: [] } };
    case "chart":
      // Phase 11 A5.3: sample bar chart (≤12×3); editor UI is A5.4.
      return {
        ...base,
        props: {
          type: "chart",
          kind: "bar",
          categories: ["A", "B", "C"],
          series: [{ name: "ชุดที่ 1", values: [3, 5, 2], color: "#2563eb" }],
          caption: "กราฟตัวอย่าง",
        },
      };
    case "calendar":
      // Phase 11 A5.5: Thai-first BE month grid (no navigation).
      return {
        ...base,
        props: {
          type: "calendar",
          year: 2569,
          month: 11,
          weekStart: 0,
          era: "be",
        },
      };
    case "textarea":
      return { ...base, props: { type: "textarea", label: "", placeholder: "Type here" } };
    case "kbd":
      return { ...base, props: { type: "kbd", text: "Kbd" } };
    case "avatar":
      return { ...base, props: { type: "avatar", src: { id: "" }, fallback: "A" } };
    case "progress":
      return { ...base, props: { type: "progress", value: 40 } };
    case "slider":
      return { ...base, props: { type: "slider", value: 40 } };
    case "empty":
      return { ...base, props: { type: "empty", title: "Empty", message: "Nothing here" } };
    case "item":
      return { ...base, props: { type: "item", title: "Item", description: "Description" } };
    case "marker":
      return { ...base, props: { type: "marker", text: "Marker" } };
    case "bubble":
      return { ...base, props: { type: "bubble", text: "Message", align: "start" } };
    case "message":
      return { ...base, props: { type: "message", sender: "Name", text: "Message", align: "start" } };
    case "select":
      return { ...base, props: { type: "select", value: "One", options: ["One", "Two"] } };
    case "radio":
      return { ...base, props: { type: "radio", value: "One", options: ["One", "Two"] } };
    case "toggle":
      return { ...base, props: { type: "toggle", label: "Toggle", pressed: false } };
    case "toggleGroup":
      return { ...base, props: { type: "toggleGroup", active: 0, items: ["One", "Two"] } };
    case "tabs":
      return { ...base, props: { type: "tabs", active: 0, items: [{ label: "Tab 1", text: "One" }, { label: "Tab 2", text: "Two" }] } };
    case "inputGroup":
      return { ...base, props: { type: "inputGroup", prefix: "", placeholder: "Type here", suffix: "" } };
    case "inputOtp":
      return { ...base, props: { type: "inputOtp", length: 6, value: "" } };
    case "accordion":
      return { ...base, props: { type: "accordion", open: 0, items: [{ label: "One", text: "Content" }, { label: "Two", text: "Content" }] } };
    case "collapsible":
      return { ...base, props: { type: "collapsible", label: "Details", text: "Content", open: true } };
    case "breadcrumb":
      return { ...base, props: { type: "breadcrumb", items: [{ label: "Home", href: "" }, { label: "Page", href: "" }] } };
    case "pagination":
      return {
        ...base,
        props: {
          type: "pagination",
          active: 0,
          items: [
            { label: "1", href: "" },
            { label: "2", href: "" },
            { label: "3", href: "" },
          ],
        },
      };
    case "navigationMenu":
      return { ...base, props: { type: "navigationMenu", items: [{ label: "Home", href: "" }, { label: "Page", href: "" }] } };
    case "menubar":
      return {
        ...base,
        props: {
          type: "menubar",
          items: [
            {
              label: "File",
              items: [
                { label: "New Tab", href: "" },
                { label: "New Window", href: "" },
              ],
            },
            {
              label: "Edit",
              items: [
                { label: "Undo", href: "" },
                { label: "Redo", href: "" },
              ],
            },
          ],
        },
      };
    case "dropdownMenu":
      return {
        ...base,
        props: {
          type: "dropdownMenu",
          label: "Menu",
          items: [
            { label: "One", href: "" },
            { label: "Two", href: "" },
          ],
        },
      };
    case "dialog":
      return { ...base, props: { type: "dialog", title: "Dialog", message: "Note", open: true } };
    case "alertDialog":
      return {
        ...base,
        props: {
          type: "alertDialog",
          title: ALERT_DIALOG_DEFAULT_TITLE,
          message: "Note",
          confirm: "OK",
          cancel: "Cancel",
        },
      };
    case "sheet":
      return { ...base, props: { type: "sheet", title: "Sheet", message: "Note", side: "right", open: true } };
    case "drawer":
      return { ...base, props: { type: "drawer", title: "Drawer", message: "Note", side: "bottom", open: true } };
    case "popover":
      return { ...base, props: { type: "popover", label: "Open", text: "Note" } };
    case "tooltip":
      return { ...base, props: { type: "tooltip", label: "Tip", tip: "More" } };
    case "hoverCard":
      return { ...base, props: { type: "hoverCard", title: "Title", text: "Details" } };
  }
}

/** Can a brand-new node be inserted into `parentId` at `index`? */
export function canInsertInto(
  doc: PageDocument,
  parentId: NodeId,
  index: number,
): boolean {
  const parent = doc.nodes[parentId];
  if (!parent || !isContainerType(parent.type) || isContentLocked(doc, parent)) {
    return false;
  }
  const len = getChildren(parent).length;
  return index >= 0 && index <= len;
}

/**
 * Where a palette click inserts: into selected container (append),
 * after selected leaf, or append to page root when nothing is selected.
 */
export function resolveInsertTarget(
  doc: PageDocument,
  selectedId: NodeId | null,
): ParentRef | null {
  const sel = selectedId ? doc.nodes[selectedId] : undefined;
  let target: ParentRef | null = null;
  if (!sel) {
    const root = doc.nodes[doc.root];
    if (root) target = { parentId: doc.root, index: getChildren(root).length };
  } else if (isContainerType(sel.type)) {
    target = { parentId: sel.id, index: getChildren(sel).length };
  } else {
    const p = findParent(doc, sel.id);
    if (p) target = { parentId: p.parentId, index: p.index + 1 };
  }
  if (!target || !canInsertInto(doc, target.parentId, target.index)) {
    return null;
  }
  return target;
}

export function insertNode(
  doc: PageDocument,
  node: Node,
  parentId: NodeId,
  index: number,
): PageDocument | null {
  if (doc.nodes[node.id]) return null;
  if (!canInsertInto(doc, parentId, index)) return null;
  const parent = doc.nodes[parentId];
  const kids = [...getChildren(parent)];
  kids.splice(index, 0, node.id);
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [node.id]: node,
      [parentId]: withChildren(parent, kids),
    },
  };
}

function collectSubtree(doc: PageDocument, id: NodeId, out: NodeId[]): void {
  const node = doc.nodes[id];
  if (!node) return;
  out.push(id);
  for (const c of getChildren(node)) collectSubtree(doc, c, out);
}

/**
 * Remove a non-root node and its whole subtree.
 * Returns the new doc and the id that should be selected next
 * (next sibling → previous sibling → parent).
 */
export function removeNode(
  doc: PageDocument,
  nodeId: NodeId,
): { document: PageDocument; nextSelectedId: NodeId } | null {
  if (nodeId === doc.root) return null;
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node)) return null;
  const p = findParent(doc, nodeId);
  if (!p) return null;
  const parent = doc.nodes[p.parentId];
  if (!parent || isContentLocked(doc, parent)) return null;

  const kids = [...getChildren(parent)];
  kids.splice(p.index, 1);
  const nextSelectedId = kids[p.index] ?? kids[p.index - 1] ?? p.parentId;

  const nodes = { ...doc.nodes, [p.parentId]: withChildren(parent, kids) };
  const drop: NodeId[] = [];
  collectSubtree(doc, nodeId, drop);
  for (const id of drop) delete nodes[id];

  return { document: { ...doc, nodes }, nextSelectedId };
}

/** Sibling in direction (-1 = previous, +1 = next), or null at the edge. */
export function siblingOf(
  doc: PageDocument,
  nodeId: NodeId,
  dir: -1 | 1,
): NodeId | null {
  const p = findParent(doc, nodeId);
  if (!p) return null;
  const kids = getChildren(doc.nodes[p.parentId]);
  return kids[p.index + dir] ?? null;
}

/* ------------------------------------------------------------------ */
/* Style panel writes (docs/STYLE-PANEL-SPEC.md §5)                   */
/* ------------------------------------------------------------------ */

export type StyleKey = keyof StyleProps;
export type Sides = { t: number; r: number; b: number; l: number };

/** BoxSpacing → explicit four sides (missing sides = 0, as rendered). */
export function normalizeSpacing(s: BoxSpacing | undefined): Sides | undefined {
  if (s === undefined) return undefined;
  if (typeof s === "number") return { t: s, r: s, b: s, l: s };
  return { t: s.t ?? 0, r: s.r ?? 0, b: s.b ?? 0, l: s.l ?? 0 };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const boxish = (v: unknown) =>
    typeof v === "number" || (typeof v === "object" && v !== null);
  if (
    (typeof a === "object" || typeof b === "object") &&
    boxish(a) &&
    boxish(b)
  ) {
    const na = normalizeSpacing(a as BoxSpacing)!;
    const nb = normalizeSpacing(b as BoxSpacing)!;
    return na.t === nb.t && na.r === nb.r && na.b === nb.b && na.l === nb.l;
  }
  return false;
}

/** Type default for a style key (heading fontSize follows level). */
export function styleDefault<K extends StyleKey>(
  node: Node,
  key: K,
): StyleProps[K] | undefined {
  if (key === "fontSize" && node.props.type === "heading") {
    return HEADING_FONT_SIZE[node.props.level] as StyleProps[K];
  }
  return DEFAULT_STYLES[node.type][key];
}

export function isDefaultValue(node: Node, key: StyleKey, value: unknown) {
  return valuesEqual(value, styleDefault(node, key));
}

function replaceNode(doc: PageDocument, node: Node): PageDocument {
  return { ...doc, nodes: { ...doc.nodes, [node.id]: node } };
}

/**
 * Set / reset one `node.style` key. `undefined` deletes (reset); a value equal
 * to the type default is also deleted (sparse). Returns null for locked nodes
 * or when nothing changes (so no spurious dirty flag).
 */
export function setNodeStyle<K extends StyleKey>(
  doc: PageDocument,
  nodeId: NodeId,
  key: K,
  value: StyleProps[K] | undefined,
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node)) return null;
  const had = Object.prototype.hasOwnProperty.call(node.style, key);
  const store = value !== undefined && !isDefaultValue(node, key, value);
  if (!store && !had) return null;
  if (store && had && JSON.stringify(node.style[key]) === JSON.stringify(value)) {
    return null;
  }
  const style: StyleProps = { ...node.style };
  if (store) style[key] = value;
  else delete style[key];
  return replaceNode(doc, { ...node, style });
}

/** True when this breakpoint stores `key` (the dot). Absent means "use the base". */
export function breakpointKeySet(node: Node, bp: StyleBreakpoint, key: StyleKey): boolean {
  const map = node.styleBreakpoints?.[bp];
  return !!map && Object.prototype.hasOwnProperty.call(map, key);
}

/**
 * Write one key on a breakpoint override. The base `style` is not touched.
 * A value equal to the desktop base is not stored. `undefined` clears that
 * key (`ใช้ค่าหลัก`). Returns null when locked or nothing changed.
 */
export function setNodeBreakpointStyle<K extends StyleKey>(
  doc: PageDocument,
  nodeId: NodeId,
  bp: StyleBreakpoint,
  key: K,
  value: StyleProps[K] | undefined,
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node)) return null;
  const current = node.styleBreakpoints?.[bp];
  const had = !!current && Object.prototype.hasOwnProperty.call(current, key);
  const base = resolvedStyle(node)[key];
  // Opacity's shown base is 1 when the key is absent (CSS initial).
  const sameAsBase =
    value !== undefined &&
    (valuesEqual(value, base) ||
      (key === "opacity" && value === 1 && (base === undefined || base === 1)));
  const store = value !== undefined && !sameAsBase;
  if (!store && !had) return null;
  if (store && had && valuesEqual(current![key], value)) return null;
  const nextStyle: StyleProps = { ...(current ?? {}) };
  if (store) nextStyle[key] = value;
  else delete nextStyle[key];
  const map = { ...(node.styleBreakpoints ?? {}) };
  if (Object.keys(nextStyle).length > 0) map[bp] = nextStyle;
  else delete map[bp];
  const next: Node = { ...node, style: node.style };
  if (Object.keys(map).length > 0) next.styleBreakpoints = map;
  else delete next.styleBreakpoints;
  return replaceNode(doc, next);
}

export type NodePropKey =
  | "direction"
  | "gap"
  | "align"
  | "justify"
  | "level"
  | "size"
  /** heading/text `content` */
  | "content"
  /** button/link/input/switch `label` */
  | "label"
  /** Phase 11 A3.3: field `description` (blank = key absent) */
  | "description"
  /** Phase 11 A3.3: field `error` (blank = key absent) */
  | "error"
  /** input `placeholder` */
  | "placeholder"
  /** switch `checked` (always stored, including false) */
  | "checked"
  /**
   * link `href`; button `href` + `action` (non-blank → trimmed href and
   * `action: "link"`; blank → href removed and `action: "none"`)
   */
  | "href"
  /** link `openInNewTab` (false/undefined = key absent) */
  | "openInNewTab"
  /** image `src.id` (AssetRef id) */
  | "srcId"
  /** image `src.alt` ("" = key absent) */
  | "srcAlt"
  /** Phase 11 A2.5: separator / scrollArea `orientation` */
  | "orientation"
  /** Phase 11 A2.5: aspectRatio `ratio` (one of ASPECT_RATIOS; anything else is refused) */
  | "ratio"
  /** Phase 11 A2.5: spinner accessible name (`node.name`; blank = key absent, the default Thai name applies) */
  | "name"
  /** Phase 11 A4.1: list `ordered` */
  | "ordered"
  /** Phase 11 A4.1: list `marker` */
  | "marker"
  /** Phase 11 A4.2: table `caption` (blank = key absent) */
  | "caption"
  /** Phase 11 A4.2: table `headerRow` */
  | "headerRow"
  /** Phase 11 A4.2: table `striped` */
  | "striped"
  /** Phase 11 A4.5: icon `strokeWidth` */
  | "strokeWidth"
  /** Phase 11 A5.1: carousel `slidesPerView` (1–4) */
  | "slidesPerView"
  /** Phase 11 A5.5: calendar `year` / `month` / `selectedDay` / `weekStart` / `era` */
  | "year"
  | "month"
  | "selectedDay"
  | "weekStart"
  | "era";

/** Plain-text prop edited inline on the canvas, or null for non-text nodes. */
export function textPropKey(node: Node): "content" | "label" | null {
  const t = node.props.type;
  if (t === "heading" || t === "text") return "content";
  if (t === "button" || t === "link") return "label";
  return null;
}

export function nodeText(node: Node): string {
  const p = node.props;
  if (p.type === "heading" || p.type === "text") return p.content;
  if (p.type === "button" || p.type === "link") return p.label;
  return "";
}

type ContainerPropKey = keyof typeof DEFAULT_CONTAINER_PROPS;

/**
 * Set / reset a prop the Style panel owns: container layout
 * (direction/gap/align/justify — optional, sparse vs DEFAULT_CONTAINER_PROPS),
 * heading `level` and spacer `size` (required — undefined is a no-op).
 */
export function setNodeProp(
  doc: PageDocument,
  nodeId: NodeId,
  key: NodePropKey,
  value: string | number | boolean | undefined,
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node)) return null;
  const p = node.props;

  // Plain-text content / label (required strings).
  if (key === "content" && (p.type === "heading" || p.type === "text")) {
    if (typeof value !== "string" || value === p.content) return null;
    return replaceNode(doc, { ...node, props: { ...p, content: value } });
  }
  if (
    key === "label" &&
    (p.type === "button" || p.type === "link" || p.type === "input" || p.type === "switch" || p.type === "checkbox" || p.type === "field")
  ) {
    if (typeof value !== "string" || value === p.label) return null;
    return replaceNode(doc, { ...node, props: { ...p, label: value } });
  }
  // Phase 11 A3.3: field description / error (optional; blank / whitespace = key absent)
  if ((key === "description" || key === "error") && p.type === "field") {
    if (typeof value !== "string") return null;
    const next = value.trim() === "" ? undefined : value;
    const cur = key === "description" ? p.description : p.error;
    if (next === cur) return null;
    const props = { ...p };
    if (key === "description") {
      if (next === undefined) delete props.description;
      else props.description = next;
    } else if (next === undefined) delete props.error;
    else props.error = next;
    return replaceNode(doc, { ...node, props });
  }
  if (key === "label" && p.type === "badge") {
    if (typeof value !== "string" || value === p.label) return null;
    return replaceNode(doc, { ...node, props: { ...p, label: value } });
  }
  // scrollArea `label` = accessible name (optional; blank / whitespace = key absent)
  if (key === "label" && p.type === "scrollArea") {
    if (typeof value !== "string") return null;
    const label = value.trim() === "" ? undefined : value;
    if (label === p.label) return null;
    const props = { ...p };
    if (label === undefined) delete props.label;
    else props.label = label;
    return replaceNode(doc, { ...node, props });
  }
  if (key === "orientation" && p.type === "separator") {
    if ((value !== "horizontal" && value !== "vertical") || value === p.orientation) return null;
    return replaceNode(doc, { ...node, props: { ...p, orientation: value } });
  }
  if (key === "orientation" && p.type === "scrollArea") {
    if ((value !== "vertical" && value !== "horizontal" && value !== "both") || value === p.orientation) return null;
    return replaceNode(doc, { ...node, props: { ...p, orientation: value } });
  }
  if (key === "ratio" && p.type === "aspectRatio") {
    if (typeof value !== "string" || !(ASPECT_RATIOS as readonly string[]).includes(value) || value === p.ratio) return null;
    return replaceNode(doc, { ...node, props: { ...p, ratio: value as AspectRatioProps["ratio"] } });
  }
  if (key === "name" && p.type === "spinner") {
    if (typeof value !== "string") return null;
    const name = value.trim() === "" ? undefined : value;
    if (name === node.name) return null;
    const next: Node = { ...node };
    if (name === undefined) delete next.name;
    else next.name = name;
    return replaceNode(doc, next);
  }
  if (p.type === "spinner" && key === "size") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const size = Math.max(A2_SPINNER_MIN_SIZE, Math.min(A2_SPINNER_MAX_SIZE, Math.round(value)));
    if (size === p.size) return null;
    return replaceNode(doc, { ...node, props: { ...p, size } });
  }
  if (p.type === "input" && key === "placeholder") {
    if (typeof value !== "string" || value === p.placeholder) return null;
    return replaceNode(doc, { ...node, props: { ...p, placeholder: value } });
  }
  if ((p.type === "switch" || p.type === "checkbox") && key === "checked") {
    if (typeof value !== "boolean" || value === p.checked) return null;
    return replaceNode(doc, { ...node, props: { ...p, checked: value } });
  }
  if (p.type === "list" && key === "ordered") {
    if (typeof value !== "boolean" || value === p.ordered) return null;
    return replaceNode(doc, { ...node, props: { ...p, ordered: value } });
  }
  if (p.type === "list" && key === "marker") {
    if (typeof value !== "string" || !(LIST_MARKERS as readonly string[]).includes(value) || value === p.marker) {
      return null;
    }
    return replaceNode(doc, { ...node, props: { ...p, marker: value as ListMarker } });
  }
  if (key === "caption" && p.type === "table") {
    if (typeof value !== "string") return null;
    const caption = value.trim() === "" ? undefined : value;
    if (caption === p.caption) return null;
    const props = { ...p };
    if (caption === undefined) delete props.caption;
    else props.caption = caption;
    return replaceNode(doc, { ...node, props });
  }
  if (p.type === "table" && key === "headerRow") {
    if (typeof value !== "boolean" || value === p.headerRow) return null;
    return replaceNode(doc, { ...node, props: { ...p, headerRow: value } });
  }
  if (p.type === "table" && key === "striped") {
    if (typeof value !== "boolean" || value === p.striped) return null;
    return replaceNode(doc, { ...node, props: { ...p, striped: value } });
  }
  // Phase 11 A4.5: icon glyph name (curated id), optional label, size, stroke.
  if (p.type === "icon" && key === "name") {
    if (typeof value !== "string") return null;
    const name = value.trim() || ICON_DEFAULT_NAME;
    if (name === p.name) return null;
    return replaceNode(doc, { ...node, props: { ...p, name } });
  }
  if (key === "label" && p.type === "icon") {
    if (typeof value !== "string") return null;
    const label = value.trim() === "" ? undefined : value;
    if (label === p.label) return null;
    const props = { ...p };
    if (label === undefined) delete props.label;
    else props.label = label;
    return replaceNode(doc, { ...node, props });
  }
  if (p.type === "icon" && key === "size") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const size = Math.max(ICON_MIN_SIZE, Math.min(ICON_MAX_SIZE, Math.round(value)));
    if (size === p.size) return null;
    return replaceNode(doc, { ...node, props: { ...p, size } });
  }
  if (p.type === "icon" && key === "strokeWidth") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const strokeWidth = Math.max(ICON_MIN_STROKE, Math.min(ICON_MAX_STROKE, Math.round(value * 2) / 2));
    if (strokeWidth === p.strokeWidth) return null;
    return replaceNode(doc, { ...node, props: { ...p, strokeWidth } });
  }
  // Phase 11 A5.5: calendar fields (T49–T54).
  if (p.type === "calendar" && key === "year") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const year = Math.round(value);
    if (year === p.year) return null;
    return replaceNode(doc, { ...node, props: { ...p, year } });
  }
  if (p.type === "calendar" && key === "month") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const month = Math.max(1, Math.min(12, Math.round(value)));
    if (month === p.month) return null;
    return replaceNode(doc, { ...node, props: { ...p, month } });
  }
  if (p.type === "calendar" && key === "selectedDay") {
    if (value === undefined || value === null || value === "") {
      if (p.selectedDay === undefined) return null;
      const props = { ...p };
      delete props.selectedDay;
      return replaceNode(doc, { ...node, props });
    }
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const selectedDay = Math.max(1, Math.min(31, Math.round(value)));
    if (selectedDay === p.selectedDay) return null;
    return replaceNode(doc, { ...node, props: { ...p, selectedDay } });
  }
  if (p.type === "calendar" && key === "weekStart") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const weekStart = Math.round(value) === 1 ? 1 : 0;
    if (weekStart === p.weekStart) return null;
    return replaceNode(doc, { ...node, props: { ...p, weekStart } });
  }
  if (p.type === "calendar" && key === "era") {
    if (value !== "be" && value !== "ce") return null;
    if (value === p.era) return null;
    // Keep the same CE instant when flipping era: BE ↔ CE ± 543.
    const ce = p.era === "be" ? p.year - 543 : p.year;
    const year = value === "be" ? ce + 543 : ce;
    return replaceNode(doc, { ...node, props: { ...p, era: value, year } });
  }
  // Phase 11 A5.1: carousel slidesPerView (1–4).
  if (p.type === "carousel" && key === "slidesPerView") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const slidesPerView = Math.max(1, Math.min(4, Math.round(value)));
    const cur = p.slidesPerView ?? 1;
    if (slidesPerView === cur) return null;
    const store = slidesPerView !== 1;
    const props = { ...p };
    if (store) props.slidesPerView = slidesPerView;
    else delete props.slidesPerView;
    return replaceNode(doc, { ...node, props });
  }

  if (p.type === "button" && key === "href") {
    if (typeof value !== "string") return null;
    const href = value.trim();
    if (!href) {
      if (p.href === undefined && p.action !== "link") return null;
      const { href: _drop, ...rest } = p;
      return replaceNode(doc, { ...node, props: { ...rest, action: "none" } });
    }
    if (href === p.href && p.action === "link") return null;
    return replaceNode(doc, { ...node, props: { ...p, href, action: "link" } });
  }
  if (p.type === "link" && key === "href") {
    if (typeof value !== "string" || value === p.href) return null;
    return replaceNode(doc, { ...node, props: { ...p, href: value } });
  }
  if (p.type === "link" && key === "openInNewTab") {
    const on = value === true;
    if (on === (p.openInNewTab === true)) return null;
    const props = { ...p };
    if (on) props.openInNewTab = true;
    else delete props.openInNewTab;
    return replaceNode(doc, { ...node, props });
  }
  if ((p.type === "image" || p.type === "avatar") && key === "srcId") {
    if (typeof value !== "string" || value === p.src.id) return null;
    return replaceNode(doc, {
      ...node,
      props: { ...p, src: { ...p.src, id: value } },
    });
  }
  if (p.type === "image" && key === "srcAlt") {
    if (typeof value !== "string") return null;
    const alt = value === "" ? undefined : value;
    if (alt === p.src.alt) return null;
    const src = { ...p.src };
    if (alt === undefined) delete src.alt;
    else src.alt = alt;
    return replaceNode(doc, { ...node, props: { ...p, src } });
  }

  if (
    (p.type === "container" ||
      p.type === "card" ||
      p.type === "alert" ||
      p.type === "aspectRatio" ||
      p.type === "scrollArea" ||
      p.type === "buttonGroup" ||
      p.type === "field" ||
      p.type === "carousel") &&
    key in DEFAULT_CONTAINER_PROPS
  ) {
    const k = key as ContainerPropKey;
    // Phase 11 A2.2 / A3.3 / A5.1: per-kind defaults (card gap 16, field gap 6, carousel gap 16, ...).
    const defaults: Record<ContainerPropKey, string | number> =
      p.type === "container"
        ? DEFAULT_CONTAINER_PROPS
        : p.type === "field"
          ? A3_LAYOUT_DEFAULTS.field
          : p.type === "carousel"
            ? A5_LAYOUT_DEFAULTS.carousel
            : A2_LAYOUT_DEFAULTS[p.type];
    let v = value;
    if (k === "gap" && typeof v === "number") {
      v = Math.max(0, Math.round(v)); // Rust: u32
    }
    const store = v !== undefined && v !== defaults[k];
    const had = p[k] !== undefined;
    if (!store && !had) return null;
    if (store && p[k] === v) return null;
    const props = { ...p } as Record<string, unknown>;
    if (store) props[k] = v;
    else delete props[k];
    return replaceNode(doc, { ...node, props: props as typeof p });
  }

  if (p.type === "heading" && key === "level") {
    const lvl = Number(value);
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 6 || lvl === p.level) {
      return null;
    }
    return replaceNode(doc, {
      ...node,
      props: { ...p, level: lvl as 1 | 2 | 3 | 4 | 5 | 6 },
    });
  }

  if (p.type === "spacer" && key === "size") {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const size = Math.max(0, Math.round(value)); // Rust: u32
    if (size === p.size) return null;
    return replaceNode(doc, { ...node, props: { ...p, size } });
  }

  return null;
}

export type Phase6bPatch =
  | { kind: "str"; key: string; value: string }
  | { kind: "num"; key: "value" | "active" | "length" | "open" | "min" | "max" | "step"; value: number }
  | { kind: "bool"; key: "pressed" | "open"; value: boolean }
  | { kind: "align"; value: "start" | "end" }
  | { kind: "side"; value: "top" | "right" | "bottom" | "left" }
  | { kind: "opt"; index: number; value: string }
  /** Replace the whole select/radio options list (T22 one line per option). */
  | { kind: "options"; value: string[] }
  | { kind: "item"; index: number; value: string }
  /** Replace the whole string-items list (toggleGroup). */
  | { kind: "items"; value: string[] }
  | { kind: "pair"; index: number; key: "label" | "text" | "href"; value: string }
  /** Replace label+text pairs (tabs / accordion). */
  | { kind: "labelTextItems"; value: LabelTextItem[] }
  /** Replace label+href pairs (breadcrumb / navigationMenu / pagination / dropdownMenu). */
  | { kind: "labelHrefItems"; value: LabelHrefItem[] }
  /** Replace nested menubar menus (trigger + linkable items). */
  | { kind: "menubarMenus"; value: MenubarMenu[] };

const OVERLAY_SIDES = new Set(["top", "right", "bottom", "left"]);
const HREF_LIST_TYPES = new Set(["breadcrumb", "navigationMenu", "pagination", "dropdownMenu"]);

function clampInt(n: number, min: number, max: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function setPhase6bProp(
  doc: PageDocument,
  nodeId: NodeId,
  patch: Phase6bPatch,
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node || isContentLocked(doc, node) || !isPhase6bType(node.type)) return null;
  const p = node.props;
  if (!isPhase6bType(p.type)) return null;
  let next: NodeProps = p;
  if (patch.kind === "str") {
    // Sparse optional CTA / action hrefs (blank → key absent).
    if (p.type === "empty" && (patch.key === "actionLabel" || patch.key === "actionHref")) {
      const nextVal = patch.value.trim() === "" ? undefined : patch.value;
      const cur = patch.key === "actionLabel" ? p.actionLabel : p.actionHref;
      if (cur === nextVal) return null;
      const props = { ...p } as Extract<NodeProps, { type: "empty" }> & Record<string, unknown>;
      if (nextVal === undefined) delete props[patch.key];
      else props[patch.key] = nextVal;
      next = props as NodeProps;
    } else if (
      p.type === "alertDialog" &&
      (patch.key === "confirmHref" || patch.key === "cancelHref")
    ) {
      const nextVal = patch.value.trim() === "" ? undefined : patch.value;
      const cur = patch.key === "confirmHref" ? p.confirmHref : p.cancelHref;
      if (cur === nextVal) return null;
      const props = { ...p } as Extract<NodeProps, { type: "alertDialog" }> & Record<string, unknown>;
      if (nextVal === undefined) delete props[patch.key];
      else props[patch.key] = nextVal;
      next = props as NodeProps;
    } else {
      const cur = (p as unknown as Record<string, unknown>)[patch.key];
      if (typeof cur !== "string" || cur === patch.value) return null;
      next = { ...p, [patch.key]: patch.value } as NodeProps;
    }
  } else if (patch.kind === "bool") {
    if (patch.key === "pressed" && p.type === "toggle") {
      if (p.pressed === patch.value) return null;
      next = { ...p, pressed: patch.value };
    } else if (
      patch.key === "open" &&
      (p.type === "collapsible" || p.type === "dialog" || p.type === "sheet" || p.type === "drawer")
    ) {
      if (p.open === patch.value) return null;
      next = { ...p, open: patch.value };
    } else return null;
  } else if (patch.kind === "align") {
    if ((p.type === "bubble" || p.type === "message") && p.align !== patch.value) next = { ...p, align: patch.value };
    else return null;
  } else if (patch.kind === "side") {
    if (!OVERLAY_SIDES.has(patch.value)) return null;
    if ((p.type === "sheet" || p.type === "drawer") && p.side !== patch.value) {
      next = { ...p, side: patch.value };
    } else return null;
  } else if (patch.kind === "num") {
    if (patch.key === "value" && p.type === "progress") {
      const n = clampInt(patch.value, 0, 100);
      if (n === null || n === p.value) return null;
      next = { ...p, value: n };
    } else if (patch.key === "value" && p.type === "slider") {
      const min = p.min ?? 0;
      const max = Math.max(min, p.max ?? 100);
      const n = clampInt(patch.value, min, max);
      if (n === null || n === p.value) return null;
      next = { ...p, value: n };
    } else if (p.type === "slider" && (patch.key === "min" || patch.key === "max" || patch.key === "step")) {
      const n = clampInt(patch.value, patch.key === "step" ? 1 : 0, 10_000);
      if (n === null) return null;
      const cur = p[patch.key];
      if (cur === n) return null;
      const min = patch.key === "min" ? n : (p.min ?? 0);
      const max = Math.max(min, patch.key === "max" ? n : (p.max ?? 100));
      const step = patch.key === "step" ? n : (p.step ?? 1);
      const value = Math.min(max, Math.max(min, p.value));
      next = {
        ...p,
        min: min === 0 ? undefined : min,
        max: max === 100 ? undefined : max,
        step: step === 1 ? undefined : step,
        value,
      };
    } else if (patch.key === "active" && (p.type === "toggleGroup" || p.type === "tabs" || p.type === "pagination")) {
      const n = clampInt(patch.value, 0, Math.max(0, p.items.length - 1));
      if (n === null || n === p.active) return null;
      next = { ...p, active: n };
    } else if (patch.key === "open" && p.type === "accordion") {
      const n = clampInt(patch.value, 0, Math.max(0, p.items.length - 1));
      if (n === null || n === p.open) return null;
      next = { ...p, open: n };
    } else if (patch.key === "length" && p.type === "inputOtp") {
      const n = clampInt(patch.value, 1, 8);
      if (n === null || n === p.length) return null;
      next = { ...p, length: n };
    } else return null;
  } else if (patch.kind === "opt") {
    // Legacy single-index edit (select / radio); prefer `options` for whole-list replace.
    if ((p.type !== "select" && p.type !== "radio") || patch.index < 0 || patch.index >= p.options.length) return null;
    if (p.options[patch.index] === patch.value) return null;
    const options = p.options.slice();
    options[patch.index] = patch.value;
    next = { ...p, options };
  } else if (patch.kind === "options") {
    // A3.4 select + pre-A4: radio also uses T22 one-line-per-option (add/remove by lines).
    if (p.type !== "select" && p.type !== "radio") return null;
    const options = patch.value.slice(0, MAX_SELECT_OPTIONS);
    if (options.length === p.options.length && options.every((o, i) => o === p.options[i])) return null;
    next = { ...p, options };
  } else if (patch.kind === "item") {
    if (p.type !== "toggleGroup" || patch.index < 0 || patch.index >= p.items.length) return null;
    if (p.items[patch.index] === patch.value) return null;
    const items = p.items.slice();
    items[patch.index] = patch.value;
    next = { ...p, items };
  } else if (patch.kind === "items") {
    // Whole-list replace for string-item kinds (toggleGroup).
    if (p.type !== "toggleGroup") return null;
    const items = patch.value.slice(0, MAX_SELECT_OPTIONS);
    if (items.length === p.items.length && items.every((o, i) => o === p.items[i])) return null;
    const active = Math.min(p.active, Math.max(0, items.length - 1));
    next = { ...p, items, active };
  } else if (patch.kind === "pair") {
    if (p.type === "tabs" || p.type === "accordion") {
      if (patch.key === "href" || patch.index < 0 || patch.index >= p.items.length) return null;
      const cur = p.items[patch.index];
      if (cur[patch.key] === patch.value) return null;
      const items = p.items.slice();
      items[patch.index] = { ...cur, [patch.key]: patch.value };
      next = { ...p, items };
    } else if (HREF_LIST_TYPES.has(p.type)) {
      if (patch.key === "text" || patch.index < 0 || patch.index >= (p as { items: LabelHrefItem[] }).items.length) {
        return null;
      }
      const list = p as { type: string; items: LabelHrefItem[]; active?: number };
      const cur = list.items[patch.index]!;
      if (cur[patch.key as "label" | "href"] === patch.value) return null;
      const items = list.items.slice();
      items[patch.index] = { ...cur, [patch.key]: patch.value };
      next = { ...p, items } as NodeProps;
    } else return null;
  } else if (patch.kind === "labelTextItems") {
    if (p.type !== "tabs" && p.type !== "accordion") return null;
    const items = patch.value.slice(0, MAX_SELECT_OPTIONS).map((it) => ({ label: it.label, text: it.text }));
    if (labelTextItemsEqual(p.items, items)) return null;
    if (p.type === "tabs") {
      const active = Math.min(p.active, Math.max(0, items.length - 1));
      next = { ...p, items, active };
    } else {
      const open = Math.min(p.open, Math.max(0, items.length - 1));
      next = { ...p, items, open };
    }
  } else if (patch.kind === "labelHrefItems") {
    if (!HREF_LIST_TYPES.has(p.type)) return null;
    const items = patch.value.slice(0, MAX_SELECT_OPTIONS).map((it) => ({ label: it.label, href: it.href }));
    if (p.type === "pagination") {
      if (labelHrefItemsEqual(p.items, items)) return null;
      const active = Math.min(p.active, Math.max(0, items.length - 1));
      next = { ...p, items, active };
    } else if (p.type === "breadcrumb" || p.type === "navigationMenu" || p.type === "dropdownMenu") {
      if (labelHrefItemsEqual(p.items, items)) return null;
      next = { ...p, items };
    } else return null;
  } else if (patch.kind === "menubarMenus") {
    if (p.type !== "menubar") return null;
    const items = patch.value.slice(0, MAX_SELECT_OPTIONS).map((menu) => ({
      label: menu.label,
      items: menu.items.slice(0, MAX_SELECT_OPTIONS).map((it) => ({ label: it.label, href: it.href })),
    }));
    if (menubarMenusEqual(p.items, items)) return null;
    next = { ...p, items };
  }
  return replaceNode(doc, { ...node, props: next });
}
