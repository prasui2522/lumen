import type { CSSProperties } from "react";
import type { BoxShadowLayer, BoxSpacing, StyleProps } from "@/schema";

/** Pure StyleProps -> inline CSS (no React / app imports; shared by the canvas views and tests). */
function cssLen(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}px` : v;
}

function spacingToCss(s: BoxSpacing | undefined): string | undefined {
  if (s === undefined) return undefined;
  if (typeof s === "number") return `${s}px`;
  const t = s.t ?? 0;
  const r = s.r ?? 0;
  const b = s.b ?? 0;
  const l = s.l ?? 0;
  return `${t}px ${r}px ${b}px ${l}px`;
}


/** B1.1: mirror of Rust `css_color` — hex3/4/6/8, transparent, currentColor. */
export function cssColor(raw: string | undefined): string | undefined {
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

/** Mirror Rust `num` + `px`. */
function pxNum(n: number): string {
  let body: string;
  if (!Number.isFinite(n)) body = "0";
  else if (Number.isInteger(n) && Math.abs(n) < 1e15) body = String(n);
  else {
    body = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  return `${body}px`;
}

/** B1.2: mirror of Rust `box_shadow_css`. Empty / all-invalid → undefined. */
export function boxShadowToCss(layers: BoxShadowLayer[] | undefined): string | undefined {
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

export function styleToCss(
  style: StyleProps,
  extra?: CSSProperties,
): CSSProperties {
  return {
    display: style.display,
    width: cssLen(style.width),
    height: cssLen(style.height),
    minHeight: cssLen(style.minHeight),
    maxWidth: cssLen(style.maxWidth),
    margin: spacingToCss(style.margin),
    padding: spacingToCss(style.padding),
    backgroundColor: style.backgroundColor,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize !== undefined ? `${style.fontSize}px` : undefined,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    borderRadius:
      style.borderRadius !== undefined ? `${style.borderRadius}px` : undefined,
    borderWidth:
      style.borderWidth !== undefined ? `${style.borderWidth}px` : undefined,
    // Unset → currentColor (defaults.rs / compiler), not the app's border-border gray.
    borderColor: style.borderColor ?? "currentColor",
    borderStyle: style.borderStyle,
    opacity: style.opacity,
    overflow: style.overflow,
    boxShadow: boxShadowToCss(style.boxShadow),
    ...extra,
  };
}
