import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceBetween,
  ArrowDown,
  ArrowRight,
  StretchHorizontal,
  StretchVertical,
  type LucideIcon,
} from "lucide-react";
import type { Node, NodeType, StyleProps } from "@/schema";
import { PHASE6B_TYPES } from "@/schema";
import { A2_LAYOUT_DEFAULTS, A3_LAYOUT_DEFAULTS, A5_LAYOUT_DEFAULTS, DEFAULT_CONTAINER_PROPS } from "@/schema";

/**
 * Style panel field table — single source of per-type rules
 * (docs/STYLE-PANEL-SPEC.md §3). Schema v1.1 keys only; no `display`.
 */

export type SectionId =
  | "layout"
  | "size"
  | "spacing"
  | "typography"
  | "background"
  | "border"
  | "effects"
  | "display";

export const STYLE_SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: "layout", label: "เลย์เอาต์" },
  // Second (step 8): keeps ความทึบ above the fold at the 640 px minimum height.
  { id: "display", label: "การแสดงผล" },
  { id: "size", label: "ขนาด" },
  { id: "spacing", label: "ระยะห่าง" },
  { id: "typography", label: "ตัวอักษร" },
  { id: "background", label: "พื้นหลัง" },
  { id: "border", label: "เส้นขอบ" },
  // B2.2: after เส้นขอบ (PHASE-11-SPEC §9.B Panel UX). Fields rendered by EffectsSection.
  { id: "effects", label: "เอฟเฟกต์" },
];

export type ControlKind =
  | "number"
  | "unit"
  | "unitless"
  | "box"
  | "color"
  | "font"
  | "weight"
  | "segmented"
  | "opacity";

export type SegOption = {
  value: string;
  label: string;
  /** Icon for row direction / default. */
  icon?: LucideIcon;
  /** Icon when container direction is column (align/justify rotate). */
  iconColumn?: LucideIcon;
};

type Common = {
  id: string;
  section: SectionId;
  label: string;
  types: readonly NodeType[];
  control: ControlKind;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  options?: readonly SegOption[];
};

export type StyleFieldDef = Common & { target: "style"; key: keyof StyleProps };
export type PropFieldDef = Common & {
  target: "prop";
  key: "direction" | "gap" | "align" | "justify" | "size" | "strokeWidth";
};
export type FieldDef = StyleFieldDef | PropFieldDef;

/**
 * Phase 11 A2.5: the A2 kinds with `children` and the same layout props as `container` (direction / gap / align /
 * justify). They take the container's field set, except where a kind's own rule differs (aspectRatio has no height:
 * the ratio decides it). badge / separator / skeleton / spinner are leaves.
 */
const A2C = ["card", "alert", "aspectRatio", "scrollArea", "buttonGroup"] as const satisfies readonly NodeType[];
const A2C_TALL = ["card", "alert", "scrollArea", "buttonGroup"] as const satisfies readonly NodeType[];
/** Phase 11 A3.3: field is a layout container (column / gap 6) like the A2 kinds. */
const A3C = ["field"] as const satisfies readonly NodeType[];
/** Phase 11 A5.1: carousel is a layout container (row / gap 16). */
const A5C = ["carousel"] as const satisfies readonly NodeType[];
const LAYOUT_KINDS: readonly NodeType[] = ["container", ...A2C, ...A3C, ...A5C];

/** True for container, the five A2 container-like kinds, and field (A3.3). */
export function hasLayoutProps(type: string): boolean {
  return (LAYOUT_KINDS as readonly string[]).includes(type);
}

/** Effective flex direction of a node with layout props (container / A2 / A3 field); null for every other kind. */
export function layoutDirection(node: Node): "row" | "column" | null {
  const p = node.props;
  if (p.type === "container") return p.direction ?? DEFAULT_CONTAINER_PROPS.direction;
  if (p.type === "card" || p.type === "alert" || p.type === "aspectRatio" || p.type === "scrollArea" || p.type === "buttonGroup") {
    return p.direction ?? A2_LAYOUT_DEFAULTS[p.type].direction;
  }
  if (p.type === "field") return p.direction ?? A3_LAYOUT_DEFAULTS.field.direction;
  if (p.type === "carousel") return p.direction ?? A5_LAYOUT_DEFAULTS.carousel.direction;
  return null;
}

/**
 * N7 (A2.5): the overflow control has three segments (แสดง / ซ่อน / เลื่อน). The schema union also holds `scroll`
 * (a hand-written or imported document); it behaves like `auto` for the user, so "เลื่อน" is the selected segment
 * for both. Anything else is returned unchanged.
 */
export function overflowSegmentValue(v: unknown): string | undefined {
  if (v === "scroll") return "auto";
  return typeof v === "string" ? v : undefined;
}

const TEXTY: readonly NodeType[] = [
  "page",
  "section",
  "container",
  "heading",
  "text",
  "button",
  "link",
  "input",
  "switch",
  "checkbox",
  "list",
  "table",
  "icon",
  "chart",
  "calendar",
  ...PHASE6B_TYPES,
  ...A2C,
  ...A3C,
  ...A5C,
  "badge",
];
const BORDERED: readonly NodeType[] = ["section", "container", "image", "button", "input", "switch", "checkbox", "list", "table", "chart", "calendar", ...PHASE6B_TYPES, ...A2C, ...A3C, ...A5C, "badge"];

export const FIELDS: readonly FieldDef[] = [
  // Layout — node.props (container only)
  {
    id: "direction", section: "layout", label: "ทิศทาง", target: "prop",
    key: "direction", control: "segmented", types: LAYOUT_KINDS,
    options: [
      { value: "row", label: "แนวนอน", icon: ArrowRight },
      { value: "column", label: "แนวตั้ง", icon: ArrowDown },
    ],
  },
  {
    id: "gap", section: "layout", label: "ช่องไฟ", target: "prop", key: "gap",
    control: "number", types: LAYOUT_KINDS, min: 0, max: 200, suffix: "px",
  },
  {
    id: "align", section: "layout", label: "จัดแนว", target: "prop", key: "align",
    control: "segmented", types: LAYOUT_KINDS,
    options: [
      { value: "start", label: "เริ่ม", icon: AlignStartHorizontal, iconColumn: AlignStartVertical },
      { value: "center", label: "กลาง", icon: AlignCenterHorizontal, iconColumn: AlignCenterVertical },
      { value: "end", label: "ท้าย", icon: AlignEndHorizontal, iconColumn: AlignEndVertical },
      { value: "stretch", label: "ยืด", icon: StretchVertical, iconColumn: StretchHorizontal },
    ],
  },
  {
    id: "justify", section: "layout", label: "กระจาย", target: "prop",
    key: "justify", control: "segmented", types: LAYOUT_KINDS,
    options: [
      { value: "start", label: "เริ่ม", icon: AlignHorizontalJustifyStart, iconColumn: AlignVerticalJustifyStart },
      { value: "center", label: "กลาง", icon: AlignHorizontalJustifyCenter, iconColumn: AlignVerticalJustifyCenter },
      { value: "end", label: "ท้าย", icon: AlignHorizontalJustifyEnd, iconColumn: AlignVerticalJustifyEnd },
      { value: "between", label: "ห่างเท่ากัน", icon: AlignHorizontalSpaceBetween, iconColumn: AlignVerticalSpaceBetween },
    ],
  },

  // Size
  {
    id: "width", section: "size", label: "กว้าง", target: "style", key: "width",
    control: "unit",
    types: ["section", "container", "heading", "text", "image", "button", "spacer", "input", "switch", "checkbox", "list", "table", "chart", "calendar", ...PHASE6B_TYPES, ...A2C, ...A3C, "badge", "separator", "skeleton"],
  },
  {
    id: "height", section: "size", label: "สูง", target: "style", key: "height",
    control: "unit", types: ["container", "image", "button", ...A2C_TALL, ...A3C, "separator", "skeleton"],
  },
  {
    id: "spacerSize", section: "size", label: "สูง", target: "prop", key: "size",
    control: "number", types: ["spacer"], min: 0, max: 400, suffix: "px",
  },
  {
    // Phase 11 A2.5: spinner `size` (px, 12–64; the setter clamps).
    id: "spinnerSize", section: "size", label: "ขนาด", target: "prop", key: "size",
    control: "number", types: ["spinner"], min: 12, max: 64, suffix: "px",
  },
  {
    // Phase 11 A4.5: icon size (px, 12–128; T37; the setter clamps).
    id: "iconSize", section: "size", label: "ขนาดไอคอน", target: "prop", key: "size",
    control: "number", types: ["icon"], min: 12, max: 128, suffix: "px",
  },
  {
    // Phase 11 A4.5: icon stroke (T38).
    id: "iconStroke", section: "size", label: "ความหนาเส้น", target: "prop", key: "strokeWidth",
    control: "number", types: ["icon"], min: 1, max: 4, step: 0.5,
  },
  {
    id: "minHeight", section: "size", label: "สูงขั้นต่ำ", target: "style",
    key: "minHeight", control: "unit", types: ["section", "container", ...A2C_TALL, ...A3C],
  },
  {
    id: "maxWidth", section: "size", label: "กว้างสูงสุด", target: "style",
    key: "maxWidth", control: "unit",
    types: ["page", "section", "container", "heading", "text", "image", "list", "table", "chart", "calendar", ...A2C, ...A3C],
  },

  // Spacing
  {
    id: "padding", section: "spacing", label: "ระยะใน", target: "style",
    key: "padding", control: "box", min: 0, max: 400,
    types: ["page", "section", "container", "heading", "text", "button", "link", "input", "switch", "checkbox", "list", "table", ...PHASE6B_TYPES, ...A2C, ...A3C, "badge"],
  },
  {
    id: "margin", section: "spacing", label: "ระยะนอก", target: "style",
    key: "margin", control: "box", min: -400, max: 400,
    types: ["section", "container", "heading", "text", "image", "button", "link", "spacer", "input", "switch", "checkbox", "list", "table", "icon", "chart", "calendar", ...PHASE6B_TYPES, ...A2C, ...A3C, "badge", "separator", "skeleton", "spinner"],
  },

  // Typography
  {
    id: "fontFamily", section: "typography", label: "แบบอักษร", target: "style",
    key: "fontFamily", control: "font", types: TEXTY,
  },
  {
    id: "fontSize", section: "typography", label: "ขนาดตัวอักษร", target: "style",
    key: "fontSize", control: "number", types: TEXTY, min: 8, max: 200, suffix: "px",
  },
  {
    id: "fontWeight", section: "typography", label: "น้ำหนัก", target: "style",
    key: "fontWeight", control: "weight",
    types: ["page", "heading", "text", "button", "link", "input", "switch", "checkbox", "list", "table", ...PHASE6B_TYPES, "badge"],
  },
  {
    id: "lineHeight", section: "typography", label: "ระยะบรรทัด", target: "style",
    key: "lineHeight", control: "unitless", min: 1, max: 3, step: 0.05,
    types: ["page", "section", "container", "heading", "text", "button", "input", "switch", "checkbox", ...PHASE6B_TYPES, ...A2C, ...A3C],
  },
  {
    id: "textAlign", section: "typography", label: "จัดข้อความ", target: "style",
    key: "textAlign", control: "segmented",
    types: ["section", "container", "heading", "text", "button", "link", "input", "switch", "checkbox", ...PHASE6B_TYPES, ...A2C, ...A3C],
    options: [
      { value: "left", label: "ซ้าย", icon: AlignLeft },
      { value: "center", label: "กลาง", icon: AlignCenter },
      { value: "right", label: "ขวา", icon: AlignRight },
    ],
  },
  {
    id: "color", section: "typography", label: "สีตัวอักษร", target: "style",
    key: "color", control: "color", types: TEXTY,
  },

  // Background
  {
    id: "backgroundColor", section: "background", label: "สีพื้นหลัง",
    target: "style", key: "backgroundColor", control: "color",
    types: ["page", "section", "container", "button", "heading", "text", "input", "switch", "checkbox", ...PHASE6B_TYPES, ...A2C, ...A3C, "badge", "skeleton"],
  },
  {
    // A2.5: the separator's line IS its background (1px high / wide); "สีเส้น" is what the user means.
    id: "separatorColor", section: "background", label: "สีเส้น",
    target: "style", key: "backgroundColor", control: "color", types: ["separator"],
  },

  // Border
  {
    id: "borderStyle", section: "border", label: "รูปแบบ", target: "style",
    key: "borderStyle", control: "segmented", types: BORDERED,
    options: [
      { value: "none", label: "ไม่มี" },
      { value: "solid", label: "เส้นทึบ" },
      { value: "dashed", label: "เส้นประ" },
      { value: "dotted", label: "จุด" },
    ],
  },
  {
    id: "borderWidth", section: "border", label: "ความหนา", target: "style",
    key: "borderWidth", control: "number", types: BORDERED, min: 0, max: 20, suffix: "px",
  },
  {
    id: "borderColor", section: "border", label: "สีเส้น", target: "style",
    key: "borderColor", control: "color", types: BORDERED,
  },
  {
    id: "borderRadius", section: "border", label: "มุมโค้ง", target: "style",
    key: "borderRadius", control: "number", types: [...BORDERED, "skeleton"], min: 0, max: 200, suffix: "px",
  },

  // Display
  {
    id: "opacity", section: "display", label: "ความทึบ", target: "style",
    key: "opacity", control: "opacity",
    types: ["section", "container", "heading", "text", "image", "button", "link", "spacer", "input", "switch", "checkbox", "icon", ...PHASE6B_TYPES, ...A2C, ...A3C, "badge", "separator", "skeleton", "spinner"],
  },
  {
    // A2.5: the spinner's arc is drawn in the text colour (currentColor); "สี" is what the user means.
    id: "spinnerColor", section: "display", label: "สี", target: "style",
    key: "color", control: "color", types: ["spinner"],
  },
  {
    id: "overflow", section: "display", label: "ส่วนเกิน", target: "style",
    key: "overflow", control: "segmented",
    // A2.5: NOT for scrollArea (item 50: it is the scroller; its axis is the orientation prop, and visible / hidden would break it).
    types: ["section", "container", "image", "card", "alert", "aspectRatio", "buttonGroup"],
    options: [
      { value: "visible", label: "แสดง" },
      { value: "hidden", label: "ซ่อน" },
      // A2.3 part 2: `auto` exists in the union now (scrollArea default); a node that has it shows a selected segment.
      // A2.5 (N7): a stored `scroll` shows this segment selected too (overflowSegmentValue).
      { value: "auto", label: "เลื่อน" },
    ],
  },
];

export const FONT_PRESETS: readonly { label: string; value: string }[] = [
  { label: "Sans ไทย", value: '"Noto Sans Thai", "Sarabun", ui-sans-serif, system-ui, sans-serif' },
  { label: "Serif", value: 'ui-serif, Georgia, "Times New Roman", serif' },
  { label: "Mono", value: 'ui-monospace, "SFMono-Regular", Menlo, monospace' },
];

export const WEIGHT_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 300, label: "300 บาง" },
  { value: 400, label: "400 ปกติ" },
  { value: 500, label: "500 กลาง" },
  { value: 600, label: "600 กึ่งหนา" },
  { value: 700, label: "700 หนา" },
  { value: 800, label: "800 หนามาก" },
];

export const COLOR_PRESETS = [
  "#0f172a", "#334155", "#ffffff", "#0ea5e9",
  "#0284c7", "#e2e8f0", "#f8fafc", "transparent",
] as const;

const fieldsCache = new Map<string, FieldDef[]>();

/** Stable (cached) list so memoised sections keep referential equality. */
export function fieldsFor(section: SectionId, type: NodeType): FieldDef[] {
  const k = `${section}:${type}`;
  let v = fieldsCache.get(k);
  if (!v) {
    v = FIELDS.filter((f) => f.section === section && f.types.includes(type));
    fieldsCache.set(k, v);
  }
  return v;
}

/** Own value saved on the node (drives dot + reset). Required props never "override". */
export function isFieldOverridden(field: FieldDef, node: Node): boolean {
  if (field.target === "style") {
    return Object.prototype.hasOwnProperty.call(node.style, field.key);
  }
  if (field.key === "size" || field.key === "strokeWidth") return false;
  const p = node.props;
  return (p.type === "container" || hasLayoutProps(p.type)) && (p as Record<string, unknown>)[field.key] !== undefined;
}

/** Effective value: resolved style, container prop defaults, spacer size. */
export function fieldEffective(
  field: FieldDef,
  node: Node,
  eff: StyleProps,
): unknown {
  if (field.target === "style") return eff[field.key];
  const p = node.props;
  if (field.key === "size") {
    if (p.type === "spacer" || p.type === "spinner" || p.type === "icon") return p.size;
    return undefined;
  }
  if (field.key === "strokeWidth") {
    return p.type === "icon" ? p.strokeWidth : undefined;
  }
  if (p.type === "container") return p[field.key] ?? DEFAULT_CONTAINER_PROPS[field.key];
  // Phase 11 A2.5: the A2 container kinds fall back to their own per-kind defaults (card gap 16, buttonGroup row, ...).
  if (p.type === "card" || p.type === "alert" || p.type === "aspectRatio" || p.type === "scrollArea" || p.type === "buttonGroup") {
    return p[field.key] ?? A2_LAYOUT_DEFAULTS[p.type][field.key];
  }
  // Phase 11 A3.3: field falls back to column / gap 6.
  if (p.type === "field") return p[field.key] ?? A3_LAYOUT_DEFAULTS.field[field.key];
  // Phase 11 A5.1: carousel falls back to row / gap 16.
  if (p.type === "carousel") return p[field.key] ?? A5_LAYOUT_DEFAULTS.carousel[field.key];
  return undefined;
}
