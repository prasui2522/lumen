/** Shape of `src/data/site.json` written by the Web Builder export. */

export type CssSize = number | string;
export type BoxSpacing = number | { t?: number; r?: number; b?: number; l?: number };

export type StyleProps = {
  display?: string;
  width?: CssSize;
  height?: CssSize;
  minHeight?: CssSize;
  maxWidth?: CssSize;
  margin?: BoxSpacing;
  padding?: BoxSpacing;
  backgroundColor?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  lineHeight?: number;
  textAlign?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  opacity?: number;
  overflow?: string;
  /** B1.2: layered box-shadow (same shape as builder StyleProps). */
  boxShadow?: BoxShadowLayer[];
  /** B3.1: fill / text gradients. */
  backgroundGradient?: GradientValue;
  textGradient?: GradientValue;
  /** B4.1: per-side border + per-corner radius. */
  borderSides?: BorderSides;
  borderRadiusCorners?: BorderRadiusCorners;
  /** B5.1: transform + transition. */
  transform?: TransformValue;
  transition?: TransitionValue;
  /** B6.1: filter + backdrop-filter. */
  filter?: FilterValue;
  backdropFilter?: BackdropFilterValue;
  /** Pointer shape. Same allowlist as the builder. */
  cursor?: string;
};

export type FilterValue = {
  blur?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  grayscale?: number;
  hueRotate?: number;
};
export type BackdropFilterValue = {
  blur?: number;
  saturate?: number;
  brightness?: number;
};

export type TransformValue = {
  translateX?: number;
  translateY?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  skewX?: number;
  skewY?: number;
  origin?: string;
};
export type TransitionValue = {
  durationMs?: number;
  delayMs?: number;
  easing?: string;
  property?: "paint";
};

export type BorderSide = {
  width?: number;
  color?: string;
  style?: "solid" | "dashed" | "dotted" | "none";
};
export type BorderSides = {
  t?: BorderSide;
  r?: BorderSide;
  b?: BorderSide;
  l?: BorderSide;
};
export type BorderRadiusCorners = {
  tl?: number;
  tr?: number;
  br?: number;
  bl?: number;
};

export type BoxShadowLayer = {
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  color?: string;
  inset?: boolean;
};

export type GradientValue = {
  kind?: "linear" | "radial" | "conic";
  angle?: number;
  stops?: { color?: string; at?: number }[];
};

export type SiteNode = {
  id: string;
  type: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  props: Record<string, unknown> & { type: string };
  style?: StyleProps;
  styleBreakpoints?: Record<string, StyleProps>;
  states?: {
    hover?: StyleProps;
    active?: StyleProps;
    focusVisible?: StyleProps;
  };
  /** E1 entrance motion (compiled by the Rust generator into `site.css`; A1: on the node's hook). */
  motion?: {
    entrance?: { preset?: string; trigger?: string; durationMs?: number; delayMs?: number; easing?: string };
  };
};

export type SitePage = {
  id: string;
  name: string;
  path: string;
  root: string;
  nodes: Record<string, SiteNode>;
};

export type SiteDocument = {
  version?: number;
  meta?: { title?: string; lang?: string; description?: string; darkMode?: "off" | "auto" };
  root: string;
  nodes: Record<string, SiteNode>;
  pages?: SitePage[];
  /** `src.id` → filename under `/assets/` (set by Web Builder export). */
  assetFiles?: Record<string, string>;
  /**
   * S2 Tier 1 Preview only: `src.id` → absolute Tauri asset URL. Never written to
   * the exported `site.json`; the Preview runtime receives it over postMessage.
   */
  assetUrls?: Record<string, string>;
  /** B0: type → default StyleProps (defaults.rs), the shared base-defaults source. */
  baseDefaults?: Record<string, StyleProps>;
  /** B0: heading font size per level 1–6 (defaults.rs `heading_font_size`). */
  headingFontSizes?: number[];
};
