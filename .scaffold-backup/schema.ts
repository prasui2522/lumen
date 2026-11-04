/**
 * PageDocument schema v1.1 — shared contract for canvas (TS) and compiler (Rust).
 * Saved JSON is sparse; merge with defaults from the same module / defaults.rs.
 */

export type NodeId = string;

export type PageDocument = {
  version: 1;
  meta: PageMeta;
  /** Must reference a node with type "page". */
  root: NodeId;
  nodes: Record<NodeId, Node>;
};

export type PageMeta = {
  title: string;
  description?: string;
  /** Default: "th" */
  lang?: string;
  favicon?: AssetRef;
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
  | "spacer";

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
  | SpacerProps;

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

/** Sparse style overrides. Unitless numbers = px. */
export type StyleProps = {
  display?: "block" | "flex" | "inline" | "inline-block" | "none";
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
  borderStyle?: "solid" | "none";
  opacity?: number;
  overflow?: "visible" | "hidden";
};

export type BoxSpacing =
  | number
  | { t?: number; r?: number; b?: number; l?: number };

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
};

/** Types that may carry children in props. */
export const CONTAINER_NODE_TYPES: readonly NodeType[] = [
  "page",
  "section",
  "container",
] as const;

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
  if (
    props.type === "page" ||
    props.type === "section" ||
    props.type === "container"
  ) {
    return props.children;
  }
  return [];
}
