/**
 * PageDocument schema — shared contract for canvas (TS) and compiler (Rust).
 * `version` 1 is schema v1.1. `version` 2 is written only when a node has a
 * `styleBreakpoints` override and the document has no input or switch.
 * `version` 3 is written when the document contains an input or a switch
 * and none of the phase 6b kinds. `version` 4 is written when any phase 6b
 * kind is present. `version` 5 is written only when the project has two or
 * more pages (`pages` on disk; no top-level root/nodes). Breakpoint overrides
 * still apply. Saved JSON is sparse.
 */

export type NodeId = string;

export type DocumentVersion = 1 | 2 | 3 | 4 | 5;

/** One page in a multi-page project (and always in memory after open/create). */
export type ProjectPage = {
  id: string;
  name: string;
  /** Home is always `/`. Other pages: `/` + one segment. */
  path: string;
  root: NodeId;
  nodes: Record<NodeId, Node>;
};

export type PageDocument = {
  version: DocumentVersion;
  meta: PageMeta;
  /** Open page tree. Must reference a node with type "page". */
  root: NodeId;
  nodes: Record<NodeId, Node>;
  /**
   * All pages; first entry is home. Always length >= 1 in memory after
   * open/create. Omitted on disk for a one-page save (versions 1–4).
   */
  pages?: ProjectPage[];
};

export type PageMeta = {
  title: string;
  description?: string;
  /** Default: "th" */
  lang?: string;
  favicon?: AssetRef;
  /** S5: export dark mode. Absent or `"off"` leaves zip bytes unchanged. */
  darkMode?: "off" | "auto";
};

export type AssetRef = {
  id: string;
  alt?: string;
};

export type NodeType =
  | "page"
  | "section"
  | "container"
  | "heading"
  | "text"
  | "image"
  | "button"
  | "link"
  | "spacer"
  | "input"
  | "switch"
  | "textarea"
  | "kbd"
  | "avatar"
  | "progress"
  | "slider"
  | "empty"
  | "item"
  | "marker"
  | "bubble"
  | "message"
  | "select"
  | "radio"
  | "toggle"
  | "toggleGroup"
  | "tabs"
  | "inputGroup"
  | "inputOtp"
  | "accordion"
  | "collapsible"
  | "breadcrumb"
  | "pagination"
  | "navigationMenu"
  | "menubar"
  | "dropdownMenu"
  | "dialog"
  | "alertDialog"
  | "sheet"
  | "drawer"
  | "popover"
  | "tooltip"
  | "hoverCard"
  // Phase 11 A2.1
  | "card"
  | "alert"
  | "badge"
  | "separator"
  | "skeleton"
  | "spinner"
  | "aspectRatio"
  | "scrollArea"
  | "buttonGroup"
  // Phase 11 A3.1
  | "checkbox"
  // Phase 11 A3.3
  | "field"
  // Phase 11 A4.1
  | "list"
  // Phase 11 A4.2
  | "table"
  // Phase 11 A4.5
  | "icon"
  // Phase 11 A5.1
  | "carousel"
  // Phase 11 A5.3
  | "chart"
  // Phase 11 A5.5
  | "calendar";

/** Base node — no children here; children live only on container-like props. */
export type Node = {
  id: NodeId;
  type: NodeType;
  name?: string;
  /** undefined = true */
  visible?: boolean;
  /** undefined = false */
  locked?: boolean;
  classNames?: string[];
  props: NodeProps;
  style: StyleProps;
  /**
   * Sparse overrides for tablet / phone / fold-open. Omitted when empty.
   * May hold the Phase 11 B style keys; states/motion are node-level (§4.4).
   */
  styleBreakpoints?: StyleBreakpoints;
  /**
   * B7.1: hover / active / focusVisible paint overrides (not per-breakpoint).
   * Empty object omitted on save. Shape: see `NodeStates` after StyleProps.
   */
  states?: NodeStates;
  /**
   * E1: entrance motion (not per-breakpoint). Empty / invalid dropped on save.
   * Shape: see `NodeMotion` after StyleProps.
   */
  motion?: NodeMotion;
};

export type NodeProps =
  | PageProps
  | SectionProps
  | ContainerProps
  | HeadingProps
  | TextProps
  | ImageProps
  | ButtonProps
  | LinkProps
  | SpacerProps
  | InputProps
  | SwitchProps
  | TextareaProps
  | KbdProps
  | AvatarProps
  | ProgressProps
  | SliderProps
  | EmptyProps
  | ItemProps
  | MarkerProps
  | BubbleProps
  | MessageProps
  | SelectProps
  | RadioProps
  | ToggleProps
  | ToggleGroupProps
  | TabsProps
  | InputGroupProps
  | InputOtpProps
  | AccordionProps
  | CollapsibleProps
  | BreadcrumbProps
  | PaginationProps
  | NavigationMenuProps
  | MenubarProps
  | DropdownMenuProps
  | DialogProps
  | AlertDialogProps
  | SheetProps
  | DrawerProps
  | PopoverProps
  | TooltipProps
  | HoverCardProps
  | CardProps
  | AlertProps
  | BadgeProps
  | SeparatorProps
  | SkeletonProps
  | SpinnerProps
  | AspectRatioProps
  | ScrollAreaProps
  | ButtonGroupProps
  | CheckboxProps
  | FieldProps
  | ListProps
  | TableProps
  | IconProps
  | CarouselProps
  | ChartProps
  | CalendarProps;

export type PageProps = {
  type: "page";
  children: NodeId[];
};

export type SectionProps = {
  type: "section";
  children: NodeId[];
};

export type ContainerProps = {
  type: "container";
  children: NodeId[];
  direction?: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
};

export type HeadingProps = {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: string;
};

export type TextProps = {
  type: "text";
  content: string;
};

export type ImageProps = {
  type: "image";
  src: AssetRef;
  objectFit?: "cover" | "contain" | "fill";
};

export type ButtonProps = {
  type: "button";
  label: string;
  href?: string;
  action?: "link" | "none";
};

export type LinkProps = {
  type: "link";
  label: string;
  href: string;
  openInNewTab?: boolean;
};

export type SpacerProps = {
  type: "spacer";
  /** Height in px. */
  size: number;
};

export type InputProps = {
  type: "input";
  /** Empty string when there is no caption. */
  label: string;
  placeholder: string;
  /**
   * Phase 11 A3.5: native `<datalist>` suggestions. Sparse — omit or `[]` means
   * no `list` / no `<datalist>` in the export.
   */
  suggestions?: string[];
};

export type SwitchProps = {
  type: "switch";
  label: string;
  /** Saved on/off. Always stored, including false. */
  checked: boolean;
};

export type LabelTextItem = { label: string; text: string };
export type LabelHrefItem = { label: string; href: string };
/** shadcn MenubarMenu: trigger label + items (empty href = inert label). */
export type MenubarMenu = { label: string; items: LabelHrefItem[] };

export type TextareaProps = { type: "textarea"; label: string; placeholder: string };
export type KbdProps = { type: "kbd"; text: string };
export type AvatarProps = { type: "avatar"; src: AssetRef; fallback: string };
export type ProgressProps = { type: "progress"; value: number };
/** `min`/`max`/`step` omitted → 0 / 100 / 1 (native range defaults). */
export type SliderProps = {
  type: "slider";
  value: number;
  min?: number;
  max?: number;
  step?: number;
};
export type EmptyProps = {
  type: "empty";
  title: string;
  message: string;
  /** Optional CTA (shadcn EmptyContent); omit both when unused. */
  actionLabel?: string;
  actionHref?: string;
};
export type ItemProps = { type: "item"; title: string; description: string };
export type MarkerProps = { type: "marker"; text: string };
export type BubbleProps = { type: "bubble"; text: string; align: "start" | "end" };
export type MessageProps = { type: "message"; sender: string; text: string; align: "start" | "end" };
export type SelectProps = { type: "select"; value: string; options: string[] };
export type RadioProps = { type: "radio"; value: string; options: string[] };
export type ToggleProps = { type: "toggle"; label: string; pressed: boolean };
export type ToggleGroupProps = { type: "toggleGroup"; active: number; items: string[] };
export type TabsProps = { type: "tabs"; active: number; items: LabelTextItem[] };
export type InputGroupProps = { type: "inputGroup"; prefix: string; placeholder: string; suffix: string };
export type InputOtpProps = { type: "inputOtp"; length: number; value: string };
export type AccordionProps = { type: "accordion"; open: number; items: LabelTextItem[] };
export type CollapsibleProps = { type: "collapsible"; label: string; text: string; open: boolean };
export type BreadcrumbProps = { type: "breadcrumb"; items: LabelHrefItem[] };
export type PaginationProps = { type: "pagination"; active: number; items: LabelHrefItem[] };
export type NavigationMenuProps = { type: "navigationMenu"; items: LabelHrefItem[] };
export type MenubarProps = { type: "menubar"; items: MenubarMenu[] };
export type DropdownMenuProps = { type: "dropdownMenu"; label: string; items: LabelHrefItem[] };
export type DialogProps = { type: "dialog"; title: string; message: string; open: boolean };
export type AlertDialogProps = {
  type: "alertDialog";
  title: string;
  message: string;
  confirm: string;
  cancel: string;
  confirmHref?: string;
  cancelHref?: string;
};
export type OverlaySide = "top" | "right" | "bottom" | "left";
export type SheetProps = { type: "sheet"; title: string; message: string; side: OverlaySide; open: boolean };
export type DrawerProps = { type: "drawer"; title: string; message: string; side: OverlaySide; open: boolean };
export type PopoverProps = { type: "popover"; label: string; text: string };
export type TooltipProps = { type: "tooltip"; label: string; tip: string };
export type HoverCardProps = { type: "hoverCard"; title: string; text: string };

/** Phase 11 A2.1: layout props shared by the container-like kinds (same as `ContainerProps`). */
type LayoutProps = {
  children: NodeId[];
  direction?: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
};

export type CardProps = { type: "card" } & LayoutProps;
export type AlertProps = { type: "alert" } & LayoutProps;
export type BadgeProps = { type: "badge"; label: string };
export type SeparatorProps = { type: "separator"; orientation: "horizontal" | "vertical" };
export type SkeletonProps = { type: "skeleton" };
/** `size` is px, 12–64. */
export type SpinnerProps = { type: "spinner"; size: number };
export const ASPECT_RATIOS = ["16/9", "4/3", "1/1", "3/2", "21/9"] as const;
export type AspectRatioProps = { type: "aspectRatio"; ratio: (typeof ASPECT_RATIOS)[number] } & LayoutProps;
export type ScrollAreaProps = {
  type: "scrollArea";
  orientation: "vertical" | "horizontal" | "both";
  /** Accessible name; omitted when empty. */
  label?: string;
} & LayoutProps;
export type ButtonGroupProps = { type: "buttonGroup" } & LayoutProps;
/** Phase 11 A3.1. Both props always stored (like switch), `checked` including false. */
export type CheckboxProps = {
  type: "checkbox";
  label: string;
  checked: boolean;
};
/**
 * Phase 11 A3.3. A labelled form row (not a `<form>`). `label` is always stored (may be "");
 * `description` / `error` are omitted when empty. Holds one control as a child (any kind;
 * label pairing applies only when the first child is input / textarea / checkbox / select).
 */
export type FieldProps = {
  type: "field";
  label: string;
  description?: string;
  error?: string;
} & LayoutProps;

/** Phase 11 A4.1. Leaf list; `items` always stored (may be empty). Cap 50 at write + export. */
export type ListMarker = "disc" | "decimal" | "check" | "none";
export type ListProps = {
  type: "list";
  items: string[];
  ordered: boolean;
  marker: ListMarker;
};
export const LIST_MARKERS = ["disc", "decimal", "check", "none"] as const satisfies readonly ListMarker[];

/** Phase 11 A4.2. Leaf table; caps 20 cols × 100 rows at write + export. */
export type TableProps = {
  type: "table";
  columns: string[];
  rows: string[][];
  caption?: string;
  headerRow: boolean;
  striped: boolean;
};

/** Phase 11 A4.5. Leaf Lucide glyph; `name` is a curated icon-paths id. */
export type IconProps = {
  type: "icon";
  name: string;
  /** Accessible name; omit/blank → decorative (`aria-hidden`). */
  label?: string;
  size: number;
  strokeWidth: number;
};

/**
 * Phase 11 A5.1. Carousel: horizontal scroll-snap container.
 * `slidesPerView` sparse (omit = 1); clamp 1–4 at write + export.
 */
export type CarouselProps = {
  type: "carousel";
  children: NodeId[];
  slidesPerView?: number;
} & LayoutProps;

/** Phase 11 A5.3. Leaf chart; caps 12 categories × 3 series at write + export. */
export type ChartKind = "bar" | "line" | "area";
export type ChartSeries = {
  name: string;
  values: (number | null)[];
  color: string;
};
export type ChartProps = {
  type: "chart";
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  caption?: string;
};
export const CHART_KINDS = ["bar", "line", "area"] as const satisfies readonly ChartKind[];
export const CHART_MAX_CATEGORIES = 12;
export const CHART_MAX_SERIES = 3;

/** Phase 11 A5.5. Leaf static month grid; `year` is in the selected era. */
export type CalendarEra = "be" | "ce";
export type CalendarWeekStart = 0 | 1;
export type CalendarProps = {
  type: "calendar";
  year: number;
  /** 1–12 */
  month: number;
  selectedDay?: number;
  weekStart: CalendarWeekStart;
  era: CalendarEra;
};
export const CALENDAR_ERAS = ["be", "ce"] as const satisfies readonly CalendarEra[];

export const PHASE6B_TYPES = [
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
] as const satisfies readonly NodeType[];

export function isPhase6bType(type: string): type is (typeof PHASE6B_TYPES)[number] {
  return (PHASE6B_TYPES as readonly string[]).includes(type);
}

/**
 * Phase 11 A2.1 kinds. They count like the phase 6b kinds for the save marker
 * (a single page that holds one is version 4) but are NOT phase 6b for UI
 * routing, so `isPhase6bType` stays the routing predicate.
 */
export const A2_TYPES = [
  "card",
  "alert",
  "badge",
  "separator",
  "skeleton",
  "spinner",
  "aspectRatio",
  "scrollArea",
  "buttonGroup",
] as const satisfies readonly NodeType[];

export function isA2Type(type: string): type is (typeof A2_TYPES)[number] {
  return (A2_TYPES as readonly string[]).includes(type);
}

/** Save marker: this kind forces a single page to version 4. Mirrors `is_version4_kind` in defaults.rs. */
/** Phase 11 A3 kinds (A3.1 checkbox, A3.3 field). Mirrors `is_a3_kind` in defaults.rs. */
export const A3_TYPES = ["checkbox", "field"] as const satisfies readonly NodeType[];
export function isA3Type(type: string): type is (typeof A3_TYPES)[number] {
  return (A3_TYPES as readonly string[]).includes(type);
}

/** Phase 11 A4 kinds (list / table / icon). Mirrors `is_a4_kind` in defaults.rs. */
export const A4_TYPES = ["list", "table", "icon"] as const satisfies readonly NodeType[];
export function isA4Type(type: string): type is (typeof A4_TYPES)[number] {
  return (A4_TYPES as readonly string[]).includes(type);
}

/** Phase 11 A5 kinds (carousel / chart / calendar). Mirrors `is_a5_kind` in defaults.rs. */
export const A5_TYPES = ["carousel", "chart", "calendar"] as const satisfies readonly NodeType[];
export function isA5Type(type: string): type is (typeof A5_TYPES)[number] {
  return (A5_TYPES as readonly string[]).includes(type);
}

export function isVersion4Kind(type: string): boolean {
  return isPhase6bType(type) || isA2Type(type) || isA3Type(type) || isA4Type(type) || isA5Type(type);
}

/** Sparse style overrides. Unitless numbers = px. */
export type StyleProps = {
  display?: "block" | "flex" | "inline" | "inline-block" | "inline-flex" | "none";
  width?: number | string;
  height?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  margin?: BoxSpacing;
  padding?: BoxSpacing;
  backgroundColor?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | "normal" | "bold";
  lineHeight?: number | string;
  textAlign?: "left" | "center" | "right";
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: "solid" | "none" | "dashed" | "dotted";
  opacity?: number;
  overflow?: "visible" | "hidden" | "auto" | "scroll";
  /** B1.2 (§4.2): layered box-shadow. Empty array ≡ unset. */
  boxShadow?: BoxShadowLayer[];
  /** B3.1 (§4.2): fill gradient. Empty / <2 valid stops ≡ unset. Exclusive with textGradient. */
  backgroundGradient?: GradientValue;
  /** B3.1 (§4.2): text fill gradient (clip). Empty / <2 valid stops ≡ unset. */
  textGradient?: GradientValue;
  /** B4.1 (§4.2): per-side border overrides (after uniform border). Empty ≡ unset. */
  borderSides?: BorderSides;
  /** B4.1 (§4.2): per-corner radius overrides (after borderRadius). Empty ≡ unset. */
  borderRadiusCorners?: BorderRadiusCorners;
  /** B5.1 (§4.2): transform. Empty ≡ unset. Order: translate → rotate → scale → skew. */
  transform?: TransformValue;
  /** B5.1 (§4.2): transition longhands. Empty ≡ unset. `property:"paint"` only in v1. */
  transition?: TransitionValue;
  /** B6.1 (§4.2): CSS filter. Empty ≡ unset. */
  filter?: FilterValue;
  /** B6.1 (§4.2): backdrop-filter (+ -webkit-). Empty ≡ unset. blur capped 40. */
  backdropFilter?: BackdropFilterValue;
};

/** B1.2: one `box-shadow` layer. Colour via `css_color` (hex3/4/6/8 / transparent / currentColor). */
export type BoxShadowLayer = {
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  color?: string;
  inset?: boolean;
};

/** B3.1: linear / radial / conic gradient (2–8 stops; `at` 0–100; angle 0–360). */
export type GradientKind = "linear" | "radial" | "conic";
export type GradientStop = {
  color?: string;
  /** 0–100 */
  at?: number;
};
export type GradientValue = {
  kind?: GradientKind;
  angle?: number;
  stops?: GradientStop[];
};
export const GRADIENT_KINDS = ["linear", "radial", "conic"] as const satisfies readonly GradientKind[];
export const GRADIENT_MIN_STOPS = 2;
export const GRADIENT_MAX_STOPS = 8;

/** B4.1: one side's border override. Width 0–20; style allowlist. */
export type BorderSideStyle = "solid" | "dashed" | "dotted" | "none";
export type BorderSide = {
  width?: number;
  color?: string;
  style?: BorderSideStyle;
};
export type BorderSides = {
  t?: BorderSide;
  r?: BorderSide;
  b?: BorderSide;
  l?: BorderSide;
};
/** B4.1: per-corner radius (0–400). */
export type BorderRadiusCorners = {
  tl?: number;
  tr?: number;
  br?: number;
  bl?: number;
};
export const BORDER_SIDE_STYLES = [
  "solid",
  "dashed",
  "dotted",
  "none",
] as const satisfies readonly BorderSideStyle[];

/** B5.1: transform-origin keywords (9). */
export type TransformOrigin =
  | "top left"
  | "top"
  | "top right"
  | "left"
  | "center"
  | "right"
  | "bottom left"
  | "bottom"
  | "bottom right";
export type TransformValue = {
  translateX?: number;
  translateY?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  skewX?: number;
  skewY?: number;
  origin?: TransformOrigin;
};
export const TRANSFORM_ORIGINS = [
  "top left",
  "top",
  "top right",
  "left",
  "center",
  "right",
  "bottom left",
  "bottom",
  "bottom right",
] as const satisfies readonly TransformOrigin[];

/** B5.1: transition. `property: "paint"` → fixed paint list (no layout). */
export type TransitionEasing =
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "linear"
  | "spring";
export type TransitionValue = {
  durationMs?: number;
  delayMs?: number;
  easing?: TransitionEasing | string;
  property?: "paint";
};
export const TRANSITION_EASINGS = [
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "linear",
  "spring",
] as const satisfies readonly TransitionEasing[];
/** Compiled `transition-property` when `property:"paint"`. */
export const TRANSITION_PAINT_PROPS =
  "background-color,color,border-color,box-shadow,opacity,transform,filter,backdrop-filter";
/** spring → cubic-bezier (T108a). */
export const TRANSITION_SPRING_BEZIER = "cubic-bezier(0.34,1.56,0.64,1)";

/** B6.1: filter functions. */
export type FilterValue = {
  blur?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  grayscale?: number;
  hueRotate?: number;
};
/** B6.1: backdrop-filter subset. */
export type BackdropFilterValue = {
  blur?: number;
  saturate?: number;
  brightness?: number;
};

/**
 * B1 (§4.5.1): every StyleProps key, in struct order. Parity tests regex-scan
 * `defaults.rs` for each key's snake_case field in the struct / `is_empty` / `overlay_style`.
 */
export const STYLE_KEYS = [
  "display",
  "width",
  "height",
  "minHeight",
  "maxWidth",
  "margin",
  "padding",
  "backgroundColor",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "borderRadius",
  "borderWidth",
  "borderColor",
  "borderStyle",
  "opacity",
  "overflow",
  "boxShadow",
  "backgroundGradient",
  "textGradient",
  "borderSides",
  "borderRadiusCorners",
  "transform",
  "transition",
  "filter",
  "backdropFilter",
] as const satisfies readonly (keyof StyleProps)[];

/** B7.1: paint-only keys allowed inside `Node.states` (§4.3 / §9.B). */
export const STATE_PAINT_KEYS = [
  "backgroundColor",
  "color",
  "borderColor",
  "opacity",
  "boxShadow",
  "backgroundGradient",
  "textGradient",
  "filter",
  "backdropFilter",
  "transform",
] as const satisfies readonly (keyof StyleProps)[];
export type StatePaintKey = (typeof STATE_PAINT_KEYS)[number];
/** Sparse paint subset used by hover / active / focusVisible. */
export type StateStyle = {
  [K in StatePaintKey]?: StyleProps[K];
};
export type NodeStateName = "hover" | "active" | "focusVisible";
export type NodeStates = {
  hover?: StateStyle;
  active?: StateStyle;
  focusVisible?: StateStyle;
};
export const NODE_STATE_NAMES = [
  "hover",
  "active",
  "focusVisible",
] as const satisfies readonly NodeStateName[];

/** E1: entrance presets (transform/opacity only). */
export type MotionEntrancePreset =
  | "fade"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "scaleIn";
export const MOTION_ENTRANCE_PRESETS = [
  "fade",
  "slideUp",
  "slideDown",
  "slideLeft",
  "slideRight",
  "scaleIn",
] as const satisfies readonly MotionEntrancePreset[];
export type MotionTrigger = "load" | "view";
export const MOTION_TRIGGERS = ["load", "view"] as const satisfies readonly MotionTrigger[];
export const MOTION_DURATION_MIN = 100;
export const MOTION_DURATION_MAX = 2000;
export const MOTION_DELAY_MIN = 0;
export const MOTION_DELAY_MAX = 2000;
export type MotionEntrance = {
  preset: MotionEntrancePreset;
  trigger: MotionTrigger;
  durationMs: number;
  delayMs: number;
  easing: TransitionEasing;
};
export type NodeMotion = {
  entrance?: MotionEntrance;
};

export type BoxSpacing =
  | number
  | { t?: number; r?: number; b?: number; l?: number };

/** Breakpoint ids. `foldOpen` is not a width; the compiler slice emits it later. */
export type StyleBreakpoint = "tablet" | "phone" | "foldOpen";

export type StyleBreakpoints = {
  tablet?: StyleProps;
  phone?: StyleProps;
  foldOpen?: StyleProps;
};

/** Default container layout props (not style). */
export const DEFAULT_CONTAINER_PROPS = {
  direction: "column",
  gap: 0,
  align: "stretch",
  justify: "start",
} as const;

export const DEFAULT_IMAGE_OBJECT_FIT = "cover" as const;

export const HEADING_FONT_SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 40,
  2: 32,
  3: 28,
  4: 24,
  5: 20,
  6: 18,
};

/**
 * Per-type style defaults. Saved documents omit these;
 * canvas + compiler merge node.style on top.
 */
export const DEFAULT_STYLES: Record<NodeType, StyleProps> = {
  page: {
    display: "block",
    width: "100%",
    minHeight: "100%",
    margin: 0,
    padding: 0,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 16,
    lineHeight: 1.5,
  },
  section: {
    display: "block",
    width: "100%",
    padding: { t: 32, r: 24, b: 32, l: 24 },
    backgroundColor: "transparent",
  },
  container: {
    display: "flex",
    width: "100%",
  },
  heading: {
    display: "block",
    margin: { t: 0, r: 0, b: 8, l: 0 },
    padding: 0,
    color: "#0f172a",
    fontWeight: 700,
    lineHeight: 1.25,
    textAlign: "left",
  },
  text: {
    display: "block",
    margin: { t: 0, r: 0, b: 8, l: 0 },
    padding: 0,
    color: "#334155",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.6,
    textAlign: "left",
  },
  image: {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    margin: 0,
    padding: 0,
    borderRadius: 0,
    overflow: "hidden",
  },
  button: {
    display: "inline-block",
    margin: 0,
    padding: { t: 10, r: 16, b: 10, l: 16 },
    backgroundColor: "#0ea5e9",
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.25,
    textAlign: "center",
    borderRadius: 8,
    borderWidth: 0,
    borderStyle: "none",
  },
  link: {
    display: "inline",
    margin: 0,
    padding: 0,
    color: "#0284c7",
    fontSize: 16,
    fontWeight: 500,
    textAlign: "left",
  },
  spacer: {
    display: "block",
    width: "100%",
    margin: 0,
    padding: 0,
  },
  input: {
    display: "block",
    width: "100%",
    margin: 0,
    padding: { t: 8, r: 12, b: 8, l: 12 },
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "solid",
  },
  switch: {
    display: "flex",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  textarea: {
    display: "block",
    width: "100%",
    margin: 0,
    padding: { t: 8, r: 12, b: 8, l: 12 },
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "solid",
  },
  kbd: {
    display: "inline-block",
    margin: 0,
    padding: { t: 2, r: 6, b: 2, l: 6 },
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 400,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "solid",
  },
  avatar: {
    display: "block",
    width: 40,
    height: 40,
    margin: 0,
    padding: 0,
    backgroundColor: "#e2e8f0",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
    textAlign: "center",
    borderRadius: 999,
    overflow: "hidden",
  },
  progress: {
    display: "block",
    width: "100%",
    margin: 0,
    padding: 0,
  },
  slider: {
    display: "block",
    width: "100%",
    margin: 0,
    padding: 0,
  },
  empty: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  item: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  marker: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  bubble: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  message: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  select: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  radio: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  toggle: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  toggleGroup: {
    display: "flex",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  tabs: {
    display: "flex",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  inputGroup: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  inputOtp: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  accordion: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  collapsible: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  breadcrumb: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  pagination: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  navigationMenu: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  menubar: {
    display: "flex",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  dropdownMenu: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  dialog: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  alertDialog: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  sheet: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  drawer: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  popover: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  tooltip: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  hoverCard: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  // Phase 11 A2.1 (existing 20 keys, literal hex). Layout props are props, not style.
  // Designer ruling (A2.3 part 2): badge is `inline-flex` and scrollArea `overflow:auto`; both keys
  // were already among the 20, only the unions grew. Non-StyleProps parts (badge align-items / gap)
  // live in kind-looks.json `a2.kinds.badge`, never display / overflow (they must not be in both).
  card: {
    display: "flex",
    width: "100%",
    padding: 24,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "solid",
  },
  alert: {
    display: "flex",
    width: "100%",
    padding: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "solid",
  },
  badge: {
    display: "inline-flex",
    padding: { t: 2, r: 10, b: 2, l: 10 },
    backgroundColor: "#0f172a",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 200,
  },
  separator: {
    display: "block",
    width: "100%",
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  skeleton: {
    display: "block",
    width: "100%",
    height: 16,
    backgroundColor: "#e2e8f0",
    borderRadius: 6,
  },
  spinner: {
    display: "inline-block",
    color: "#0f172a",
  },
  aspectRatio: {
    display: "flex",
    width: "100%",
    overflow: "hidden",
  },
  scrollArea: {
    display: "flex",
    width: "100%",
    overflow: "auto",
  },
  buttonGroup: {
    display: "flex",
  },
  // Phase 11 A3.1: the label row (like switch). The box is a kind-looks constant, never a style key.
  checkbox: {
    display: "flex",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
  },
  // Phase 11 A3.3: flex column; gap 6 comes from A3_LAYOUT_DEFAULTS (prop), not a style key.
  // Label / description / error colours live in kind-looks `a3.kinds.field` (shared with export).
  field: {
    display: "flex",
  },
  // Phase 11 A4.1: list body text. Marker look lives in kind-looks `a4.kinds.list`.
  list: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
  },
  // Phase 11 A4.2: table body text. Grid look lives in kind-looks `a4.kinds.table`.
  table: {
    display: "block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
  },
  // Phase 11 A4.5: icon colour via currentColor; size/stroke are props.
  icon: {
    display: "inline-block",
    margin: 0,
    padding: 0,
    color: "#0f172a",
  },
  // Phase 11 A5.1: carousel (flex row, scroll-snap). Layout props are props, not style.
  carousel: {
    display: "flex",
    width: "100%",
  },
  // Phase 11 A5.3: chart fills width; SVG viewBox is 600×300.
  chart: {
    display: "block",
    width: "100%",
    margin: 0,
    padding: 0,
  },
  // Phase 11 A5.5: calendar month grid.
  calendar: {
    display: "block",
    width: "100%",
    margin: 0,
    padding: 0,
    color: "#0f172a",
    fontSize: 14,
  },
};

/** Types that may carry children in props. */
export const CONTAINER_NODE_TYPES: readonly NodeType[] = [
  "page",
  "section",
  "container",
  // Phase 11 A2.2: the A2 kinds with `children` (badge, separator, skeleton and
  // spinner stay leaves). Mirrors `Node::children()` in defaults.rs.
  "card",
  "alert",
  "aspectRatio",
  "scrollArea",
  "buttonGroup",
  // Phase 11 A3.3
  "field",
  // Phase 11 A5.1
  "carousel",
] as const;

/**
 * Phase 11 A2.2: effective layout props of the A2 container kinds when the
 * node leaves them unset (PHASE-11-SPEC §9 A2 table: card column/16, alert gap 8,
 * buttonGroup row/0; aspectRatio and scrollArea use the container defaults).
 * Mirrors `a2_layout_defaults` in defaults.rs. Stored props stay sparse: a value
 * equal to its default is not written.
 */
export const A2_LAYOUT_DEFAULTS = {
  card: { direction: "column", gap: 16, align: "stretch", justify: "start" },
  alert: { direction: "column", gap: 8, align: "stretch", justify: "start" },
  aspectRatio: { direction: "column", gap: 0, align: "stretch", justify: "start" },
  scrollArea: { direction: "column", gap: 0, align: "stretch", justify: "start" },
  buttonGroup: { direction: "row", gap: 0, align: "stretch", justify: "start" },
} as const;

/** Phase 11 A3.3: field layout defaults (column / gap 6). Mirrors `a3_layout_defaults` in defaults.rs. */
export const A3_LAYOUT_DEFAULTS = {
  field: { direction: "column", gap: 6, align: "stretch", justify: "start" },
} as const;

/** Phase 11 A5.1: carousel layout defaults (row / gap 16). Mirrors `a5_layout_defaults` in defaults.rs. */
export const A5_LAYOUT_DEFAULTS = {
  carousel: { direction: "row", gap: 16, align: "stretch", justify: "start" },
} as const;

export const CAROUSEL_MIN_SLIDES = 1;
export const CAROUSEL_MAX_SLIDES = 4;
export const CAROUSEL_DEFAULT_SLIDES = 1;

export function isContainerType(type: NodeType): boolean {
  return (CONTAINER_NODE_TYPES as readonly string[]).includes(type);
}

export function isVisible(node: Node): boolean {
  return node.visible !== false;
}

export function isLocked(node: Node): boolean {
  return node.locked === true;
}

/**
 * Resolve effective style for canvas / preview.
 * Does not apply spacer height — use props.size for that at render time.
 */
export function resolvedStyle(node: Node): StyleProps {
  const base: StyleProps = { ...DEFAULT_STYLES[node.type] };

  if (node.type === "heading" && node.props.type === "heading") {
    base.fontSize = HEADING_FONT_SIZE[node.props.level];
  }

  return { ...base, ...node.style };
}

export function getChildren(node: Node): NodeId[] {
  const { props } = node;
  switch (props.type) {
    case "page":
    case "section":
    case "container":
    case "card":
    case "alert":
    case "aspectRatio":
    case "scrollArea":
    case "buttonGroup":
    case "field":
    case "carousel":
      return props.children;
    default:
      return [];
  }
}
