import type { CSSProperties } from "react";
import type { BoxSpacing, CssSize, StyleProps } from "./site-types";

function sizeCss(v: CssSize | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}px` : v;
}

function boxCss(prefix: "margin" | "padding", box: BoxSpacing | undefined, out: CSSProperties) {
  if (box === undefined) return;
  if (typeof box === "number") {
    out[prefix] = `${box}px`;
    return;
  }
  if (box.t !== undefined) out[`${prefix}Top`] = `${box.t}px`;
  if (box.r !== undefined) out[`${prefix}Right`] = `${box.r}px`;
  if (box.b !== undefined) out[`${prefix}Bottom`] = `${box.b}px`;
  if (box.l !== undefined) out[`${prefix}Left`] = `${box.l}px`;
}

/** Map builder StyleProps → React inline styles (v1: no Tailwind utility rewrite). */
export function styleToReact(style: StyleProps | undefined): CSSProperties {
  if (!style) return {};
  const out: CSSProperties = {};
  if (style.display) out.display = style.display;
  const w = sizeCss(style.width);
  if (w) out.width = w;
  const h = sizeCss(style.height);
  if (h) out.height = h;
  const minh = sizeCss(style.minHeight);
  if (minh) out.minHeight = minh;
  const maxw = sizeCss(style.maxWidth);
  if (maxw) out.maxWidth = maxw;
  boxCss("margin", style.margin, out);
  boxCss("padding", style.padding, out);
  if (style.backgroundColor) out.backgroundColor = style.backgroundColor;
  if (style.color) out.color = style.color;
  if (style.fontFamily) out.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) out.fontSize = style.fontSize;
  if (style.fontWeight !== undefined) out.fontWeight = style.fontWeight;
  if (style.lineHeight !== undefined) out.lineHeight = style.lineHeight;
  if (style.textAlign) out.textAlign = style.textAlign as CSSProperties["textAlign"];
  if (style.borderRadius !== undefined) out.borderRadius = style.borderRadius;
  if (style.borderWidth !== undefined) out.borderWidth = style.borderWidth;
  if (style.borderColor) out.borderColor = style.borderColor;
  if (style.borderStyle) out.borderStyle = style.borderStyle as CSSProperties["borderStyle"];
  if (style.opacity !== undefined) out.opacity = style.opacity;
  if (style.overflow) out.overflow = style.overflow as CSSProperties["overflow"];
  return out;
}

/** CSS property name for a React style key (`backgroundColor` → `background-color`). */
function kebab(k: string): string {
  return k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** React unitless keys; every other number is px (same as React inline styles). */
const UNITLESS = new Set(["fontWeight", "lineHeight", "opacity"]);

/**
 * F2 D8 (PREVIEW-CODE-VIEW-SPEC S1): one breakpoint's StyleProps → declarations.
 * Same mapping as `styleToReact`, so a breakpoint key means the same CSS as the base key.
 * `!important` because the base styles are inline; it wins only inside its media query.
 */
export function styleToDecls(style: StyleProps | undefined): string {
  const css = styleToReact(style) as Record<string, string | number | undefined>;
  const out: string[] = [];
  for (const [k, v] of Object.entries(css)) {
    if (v === undefined || v === "") continue;
    const val = typeof v === "number" && !UNITLESS.has(k) ? `${v}px` : String(v);
    out.push(`${kebab(k)}:${val} !important`);
  }
  return out.join(";");
}

/** Breakpoints in the static export's order (compiler.rs): tablet, then phone, then fold-open last. */
export const BREAKPOINT_MEDIA: readonly (readonly [string, string])[] = [
  ["tablet", "(max-width:1024px)"],
  ["phone", "(max-width:719px)"],
  ["foldOpen", "(horizontal-viewport-segments: 2)"],
];

/** Attribute that ties a rendered root to its breakpoint rules. */
export const BP_ATTR = "data-wb-bp";

function cssIdent(id: string): string {
  return id.replace(/["\\]/g, (m) => `\\${m}`);
}

/**
 * F2 D8: every node's `styleBreakpoints` → one stylesheet, grouped per media query in the static export's
 * order (base inline, then max-width 1024, then max-width 719, then fold-open), so a narrower query wins.
 */
export function breakpointCss(nodes: Record<string, { styleBreakpoints?: Record<string, StyleProps> }>): string {
  let css = "";
  for (const [key, media] of BREAKPOINT_MEDIA) {
    let rules = "";
    for (const [id, n] of Object.entries(nodes)) {
      const d = styleToDecls(n.styleBreakpoints?.[key]);
      if (d) rules += `[${BP_ATTR}="${cssIdent(id)}"]{${d}}`;
    }
    if (rules) css += `@media ${media}{${rules}}`;
  }
  return css;
}
