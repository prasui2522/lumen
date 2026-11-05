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
};

export type BoxShadowLayer = {
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  color?: string;
  inset?: boolean;
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
  meta?: { title?: string; lang?: string; description?: string };
  root: string;
  nodes: Record<string, SiteNode>;
  pages?: SitePage[];
  /** `src.id` → filename under `/assets/` (set by Web Builder export). */
  assetFiles?: Record<string, string>;
  /** B0: type → default StyleProps (defaults.rs), the shared base-defaults source. */
  baseDefaults?: Record<string, StyleProps>;
  /** B0: heading font size per level 1–6 (defaults.rs `heading_font_size`). */
  headingFontSizes?: number[];
};
