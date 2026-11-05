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

/**
 * B0 (PHASE-11 §9.B B-prelude P1): breakpoint CSS is no longer built here. The Rust generator writes it, with the
 * static export's own bytes, into the generated `src/styles/site.css`, targeting this attribute on a node root.
 */
export const HOOK_ATTR = "data-wb-id";

/**
 * Longhands and their shorthand move together. Same table as `prop_family` in compiler.rs.
 */
export function propFamily(p: string): string {
  if (p.startsWith("margin")) return "margin";
  if (p.startsWith("padding")) return "padding";
  if (p.startsWith("overflow")) return "overflow";
  if (p === "border-radius" || (p.startsWith("border-") && p.endsWith("-radius"))) return "border-radius";
  return p;
}

/** CSS families a node overrides at any breakpoint (empty → the node has no hook). */
export function overriddenFamilies(bp: Record<string, StyleProps> | undefined): Set<string> {
  const out = new Set<string>();
  if (!bp) return out;
  for (const s of Object.values(bp)) {
    for (const k of Object.keys(styleToReact(s))) out.add(propFamily(kebab(k)));
  }
  return out;
}

/**
 * PM ruling 2026-11-04: keys with breakpoint overrides leave the inline style, so the generated class/attribute
 * rules (base restatement first, then the media blocks) win by normal cascade. No `!important`.
 */
export function withoutFamilies(style: CSSProperties | undefined, fams: Set<string>): CSSProperties | undefined {
  if (!style || fams.size === 0) return style;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (!fams.has(propFamily(kebab(k)))) out[k] = v;
  return out as CSSProperties;
}
