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


function cssColor(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  const lower = t.toLowerCase();
  if (lower === "transparent") return "transparent";
  if (lower === "currentcolor") return "currentColor";
  if (!lower.startsWith("#")) return undefined;
  const hex = lower.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) return undefined;
  if (![...hex].every((c) => /[0-9a-f]/i.test(c))) return undefined;
  return `#${hex}`;
}

function clampNum(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(hi, Math.max(lo, n));
}

function pxNum(n: number): string {
  let body: string;
  if (!Number.isFinite(n)) body = "0";
  else if (Number.isInteger(n) && Math.abs(n) < 1e15) body = String(n);
  else body = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `${body}px`;
}

function boxShadowToCss(
  layers: import("./site-types").BoxShadowLayer[] | undefined,
): string | undefined {
  if (!layers || layers.length === 0) return undefined;
  const out: string[] = [];
  for (const layer of layers.slice(0, 6)) {
    const color = cssColor(layer.color);
    if (!color) continue;
    const x = clampNum(layer.x ?? 0, -200, 200);
    const y = clampNum(layer.y ?? 0, -200, 200);
    const blur = clampNum(layer.blur ?? 0, 0, 200);
    const spread = clampNum(layer.spread ?? 0, -100, 100);
    const inset = layer.inset === true ? "inset " : "";
    out.push(`${inset}${pxNum(x)} ${pxNum(y)} ${pxNum(blur)} ${pxNum(spread)} ${color}`);
  }
  return out.length > 0 ? out.join(", ") : undefined;
}

function numCss(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function gradientToCss(
  g: import("./site-types").GradientValue | undefined,
): string | undefined {
  if (!g?.stops || g.stops.length === 0) return undefined;
  const stops: { at: number; color: string }[] = [];
  for (const stop of g.stops.slice(0, 8)) {
    const color = cssColor(stop.color);
    if (!color) continue;
    stops.push({ at: clampNum(stop.at ?? 0, 0, 100), color });
  }
  if (stops.length < 2) return undefined;
  stops.sort((a, b) => a.at - b.at);
  const stopCss = stops.map((s) => `${s.color} ${numCss(s.at)}%`).join(", ");
  const kind = g.kind === "radial" || g.kind === "conic" ? g.kind : "linear";
  const defaultAngle = kind === "linear" ? 180 : 0;
  const angle = clampNum(g.angle ?? defaultAngle, 0, 360);
  if (kind === "radial") return `radial-gradient(circle, ${stopCss})`;
  if (kind === "conic") return `conic-gradient(from ${numCss(angle)}deg, ${stopCss})`;
  return `linear-gradient(${numCss(angle)}deg, ${stopCss})`;
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
  const bgGrad = gradientToCss(style.backgroundGradient);
  const textGrad = bgGrad ? undefined : gradientToCss(style.textGradient);
  if (textGrad) out.color = "transparent";
  else if (style.color) out.color = style.color;
  if (style.fontFamily) out.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) out.fontSize = style.fontSize;
  if (style.fontWeight !== undefined) out.fontWeight = style.fontWeight;
  if (style.lineHeight !== undefined) out.lineHeight = style.lineHeight;
  if (style.textAlign) out.textAlign = style.textAlign as CSSProperties["textAlign"];
  if (style.borderRadius !== undefined) out.borderRadius = style.borderRadius;
  const corners = style.borderRadiusCorners;
  if (corners) {
    if (corners.tl !== undefined) out.borderTopLeftRadius = `${clampNum(corners.tl, 0, 400)}px`;
    if (corners.tr !== undefined) out.borderTopRightRadius = `${clampNum(corners.tr, 0, 400)}px`;
    if (corners.br !== undefined) out.borderBottomRightRadius = `${clampNum(corners.br, 0, 400)}px`;
    if (corners.bl !== undefined) out.borderBottomLeftRadius = `${clampNum(corners.bl, 0, 400)}px`;
  }
  if (style.borderWidth !== undefined) out.borderWidth = style.borderWidth;
  if (style.borderColor) out.borderColor = style.borderColor;
  if (style.borderStyle) out.borderStyle = style.borderStyle as CSSProperties["borderStyle"];
  const sides = style.borderSides;
  if (sides) {
    const side = (
      s: import("./site-types").BorderSide | undefined,
      wk: keyof CSSProperties,
      ck: keyof CSSProperties,
      sk: keyof CSSProperties,
    ) => {
      if (!s) return;
      if (s.width !== undefined) (out as Record<string, unknown>)[wk] = `${clampNum(s.width, 0, 20)}px`;
      const c = cssColor(s.color);
      if (c) (out as Record<string, unknown>)[ck] = c;
      if (s.style) (out as Record<string, unknown>)[sk] = s.style;
    };
    side(sides.t, "borderTopWidth", "borderTopColor", "borderTopStyle");
    side(sides.r, "borderRightWidth", "borderRightColor", "borderRightStyle");
    side(sides.b, "borderBottomWidth", "borderBottomColor", "borderBottomStyle");
    side(sides.l, "borderLeftWidth", "borderLeftColor", "borderLeftStyle");
  }
  if (style.opacity !== undefined) out.opacity = style.opacity;
  if (style.overflow) out.overflow = style.overflow as CSSProperties["overflow"];
  const shadow = boxShadowToCss(style.boxShadow);
  if (shadow) out.boxShadow = shadow;
  const tf = style.transform;
  if (tf) {
    const parts: string[] = [];
    if (tf.translateX !== undefined || tf.translateY !== undefined) {
      parts.push(
        `translate(${clampNum(tf.translateX ?? 0, -1000, 1000)}px, ${clampNum(tf.translateY ?? 0, -1000, 1000)}px)`,
      );
    }
    if (tf.rotate !== undefined) parts.push(`rotate(${clampNum(tf.rotate, -360, 360)}deg)`);
    if (tf.scale !== undefined) parts.push(`scale(${clampNum(tf.scale, 0, 5)})`);
    else if (tf.scaleX !== undefined || tf.scaleY !== undefined) {
      parts.push(`scale(${clampNum(tf.scaleX ?? 1, 0, 5)}, ${clampNum(tf.scaleY ?? 1, 0, 5)})`);
    }
    if (tf.skewX !== undefined || tf.skewY !== undefined) {
      parts.push(
        `skew(${clampNum(tf.skewX ?? 0, -360, 360)}deg, ${clampNum(tf.skewY ?? 0, -360, 360)}deg)`,
      );
    }
    if (parts.length) {
      out.transform = parts.join(" ");
      if (out.display === "inline") out.display = "inline-block";
    }
    if (tf.origin) out.transformOrigin = tf.origin;
  }
  const tr = style.transition;
  if (tr && (tr.property ?? "paint") === "paint") {
    out.transitionProperty =
      "background-color,color,border-color,box-shadow,opacity,transform,filter,backdrop-filter";
    if (tr.durationMs !== undefined) {
      out.transitionDuration = `${clampNum(tr.durationMs, 0, 2000)}ms`;
    }
    if (tr.easing === "spring") out.transitionTimingFunction = "cubic-bezier(0.34,1.56,0.64,1)";
    else if (tr.easing) out.transitionTimingFunction = tr.easing;
    if (tr.delayMs !== undefined) out.transitionDelay = `${clampNum(tr.delayMs, 0, 2000)}ms`;
  }
  const filt = style.filter;
  if (filt) {
    const parts: string[] = [];
    if (filt.blur !== undefined) parts.push(`blur(${clampNum(filt.blur, 0, 40)}px)`);
    if (filt.brightness !== undefined) {
      parts.push(`brightness(${clampNum(filt.brightness, 0, 300)}%)`);
    }
    if (filt.contrast !== undefined) parts.push(`contrast(${clampNum(filt.contrast, 0, 300)}%)`);
    if (filt.saturate !== undefined) parts.push(`saturate(${clampNum(filt.saturate, 0, 300)}%)`);
    if (filt.grayscale !== undefined) parts.push(`grayscale(${clampNum(filt.grayscale, 0, 100)}%)`);
    if (filt.hueRotate !== undefined) {
      parts.push(`hue-rotate(${clampNum(filt.hueRotate, 0, 360)}deg)`);
    }
    if (parts.length) out.filter = parts.join(" ");
  }
  const bf = style.backdropFilter;
  if (bf) {
    const parts: string[] = [];
    if (bf.blur !== undefined) parts.push(`blur(${clampNum(bf.blur, 0, 40)}px)`);
    if (bf.saturate !== undefined) parts.push(`saturate(${clampNum(bf.saturate, 0, 300)}%)`);
    if (bf.brightness !== undefined) {
      parts.push(`brightness(${clampNum(bf.brightness, 0, 300)}%)`);
    }
    if (parts.length) {
      const css = parts.join(" ");
      out.WebkitBackdropFilter = css;
      out.backdropFilter = css;
    }
  }
  const img = bgGrad ?? textGrad;
  if (img) {
    out.backgroundImage = img;
    if (textGrad) {
      out.WebkitBackgroundClip = "text";
      out.backgroundClip = "text";
    }
  }
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
