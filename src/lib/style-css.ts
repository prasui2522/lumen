import type { CSSProperties } from "react";
import type {
  BackdropFilterValue,
  BorderRadiusCorners,
  BorderSide,
  BorderSides,
  BoxShadowLayer,
  BoxSpacing,
  FilterValue,
  GradientValue,
  StyleProps,
  TransformValue,
  TransitionValue,
} from "@/schema";
import { opaqueFill } from "@/lib/glass-material";
import {
  BORDER_SIDE_STYLES,
  TRANSFORM_ORIGINS,
  TRANSITION_PAINT_PROPS,
  TRANSITION_SPRING_BEZIER,
} from "@/schema";

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

function numCss(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/** B3.1: mirror of Rust `gradient_css`. Needs ≥2 valid colour stops. */
export function gradientToCss(g: GradientValue | undefined): string | undefined {
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

/** B4.1: allowlisted border style (mirror Rust `border_style_kw`). */
export function borderStyleKw(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase();
  return (BORDER_SIDE_STYLES as readonly string[]).includes(t) ? t : undefined;
}

function applyBorderSide(
  out: CSSProperties,
  side: BorderSide | undefined,
  widthK: keyof CSSProperties,
  colorK: keyof CSSProperties,
  styleK: keyof CSSProperties,
): void {
  if (!side) return;
  if (side.width !== undefined) {
    (out as Record<string, unknown>)[widthK] = `${clampNum(side.width, 0, 20)}px`;
  }
  const color = cssColor(side.color);
  if (color) (out as Record<string, unknown>)[colorK] = color;
  const st = borderStyleKw(side.style);
  if (st) (out as Record<string, unknown>)[styleK] = st;
}

export function applyBorderSides(out: CSSProperties, sides: BorderSides | undefined): void {
  if (!sides) return;
  applyBorderSide(out, sides.t, "borderTopWidth", "borderTopColor", "borderTopStyle");
  applyBorderSide(out, sides.r, "borderRightWidth", "borderRightColor", "borderRightStyle");
  applyBorderSide(out, sides.b, "borderBottomWidth", "borderBottomColor", "borderBottomStyle");
  applyBorderSide(out, sides.l, "borderLeftWidth", "borderLeftColor", "borderLeftStyle");
}

export function applyBorderRadiusCorners(
  out: CSSProperties,
  corners: BorderRadiusCorners | undefined,
): void {
  if (!corners) return;
  if (corners.tl !== undefined) out.borderTopLeftRadius = `${clampNum(corners.tl, 0, 400)}px`;
  if (corners.tr !== undefined) out.borderTopRightRadius = `${clampNum(corners.tr, 0, 400)}px`;
  if (corners.br !== undefined) out.borderBottomRightRadius = `${clampNum(corners.br, 0, 400)}px`;
  if (corners.bl !== undefined) out.borderBottomLeftRadius = `${clampNum(corners.bl, 0, 400)}px`;
}

export function isEmptyBorderSides(sides: BorderSides | undefined): boolean {
  if (!sides) return true;
  for (const s of [sides.t, sides.r, sides.b, sides.l]) {
    if (!s) continue;
    if (s.width !== undefined || s.color !== undefined || s.style !== undefined) return false;
  }
  return true;
}

export function isEmptyBorderRadiusCorners(c: BorderRadiusCorners | undefined): boolean {
  if (!c) return true;
  return c.tl === undefined && c.tr === undefined && c.br === undefined && c.bl === undefined;
}

export function isEmptyTransform(t: TransformValue | undefined): boolean {
  if (!t) return true;
  return (
    t.translateX === undefined &&
    t.translateY === undefined &&
    t.scale === undefined &&
    t.scaleX === undefined &&
    t.scaleY === undefined &&
    t.rotate === undefined &&
    t.skewX === undefined &&
    t.skewY === undefined &&
    t.origin === undefined
  );
}

export function isEmptyTransition(t: TransitionValue | undefined): boolean {
  if (!t) return true;
  return (
    t.durationMs === undefined &&
    t.delayMs === undefined &&
    t.easing === undefined &&
    t.property === undefined
  );
}

/** B5.1: mirror Rust `transform_css` — translate → rotate → scale → skew. */
export function transformToCss(t: TransformValue | undefined): string | undefined {
  if (!t || isEmptyTransform(t)) return undefined;
  const parts: string[] = [];
  if (t.translateX !== undefined || t.translateY !== undefined) {
    parts.push(
      `translate(${numCss(clampNum(t.translateX ?? 0, -1000, 1000))}px, ${numCss(clampNum(t.translateY ?? 0, -1000, 1000))}px)`,
    );
  }
  if (t.rotate !== undefined) {
    parts.push(`rotate(${numCss(clampNum(t.rotate, -360, 360))}deg)`);
  }
  if (t.scale !== undefined) {
    parts.push(`scale(${numCss(clampNum(t.scale, 0, 5))})`);
  } else if (t.scaleX !== undefined || t.scaleY !== undefined) {
    parts.push(
      `scale(${numCss(clampNum(t.scaleX ?? 1, 0, 5))}, ${numCss(clampNum(t.scaleY ?? 1, 0, 5))})`,
    );
  }
  if (t.skewX !== undefined || t.skewY !== undefined) {
    parts.push(
      `skew(${numCss(clampNum(t.skewX ?? 0, -360, 360))}deg, ${numCss(clampNum(t.skewY ?? 0, -360, 360))}deg)`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function transformOriginKw(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase();
  return (TRANSFORM_ORIGINS as readonly string[]).includes(t) ? t : undefined;
}

/** A3 item 4: largest |y1| / |y2| in `cubic-bezier()` (Rust `BEZIER_Y_MAX`). */
export const BEZIER_Y_MAX = 5;
/** A3 item 4: Rust `bezier_num` grammar — sign, digits, optional fraction; no exponent / hex / inf / nan / empty. */
const BEZIER_NUM = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** Rust `str::trim` (Unicode White_Space; unlike JS `trim`, U+FEFF is kept). */
const RUST_WS = "\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const RUST_TRIM = new RegExp(`^[${RUST_WS}]+|[${RUST_WS}]+$`, "g");
const rustTrim = (s: string) => s.replace(RUST_TRIM, "");

export function transitionEasingCss(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = rustTrim(raw).replace(/[A-Z]/g, (c) => c.toLowerCase());
  if (["ease", "ease-in", "ease-out", "ease-in-out", "linear"].includes(t)) return t;
  if (t === "spring") return TRANSITION_SPRING_BEZIER;
  if (t.startsWith("cubic-bezier(") && t.endsWith(")")) {
    // A3 item 4 (mirror of Rust `transition_easing`): strict numbers, x1 / x2 in [0, 1], |y| ≤ BEZIER_Y_MAX.
    const parts = t.slice("cubic-bezier(".length, -1).split(",").map(rustTrim);
    if (parts.length !== 4 || !parts.every((s) => BEZIER_NUM.test(s) && s.replace(/^[+-]/, "").length <= 16)) return undefined;
    const nums = parts.map((s) => Number(s) + 0);
    if (nums[0]! < 0 || nums[0]! > 1 || nums[2]! < 0 || nums[2]! > 1) return undefined;
    if (Math.abs(nums[1]!) > BEZIER_Y_MAX || Math.abs(nums[3]!) > BEZIER_Y_MAX) return undefined;
    return `cubic-bezier(${numCss(nums[0]!)},${numCss(nums[1]!)},${numCss(nums[2]!)},${numCss(nums[3]!)})`;
  }
  return undefined;
}

export function applyTransition(out: CSSProperties, t: TransitionValue | undefined): void {
  if (!t || isEmptyTransition(t)) return;
  if ((t.property ?? "paint") !== "paint") return;
  out.transitionProperty = TRANSITION_PAINT_PROPS;
  if (t.durationMs !== undefined) {
    out.transitionDuration = `${numCss(clampNum(t.durationMs, 0, 2000))}ms`;
  }
  const ease = transitionEasingCss(t.easing);
  if (ease) out.transitionTimingFunction = ease;
  if (t.delayMs !== undefined) {
    out.transitionDelay = `${numCss(clampNum(t.delayMs, 0, 2000))}ms`;
  }
}

export function isEmptyFilter(f: FilterValue | undefined): boolean {
  if (!f) return true;
  return (
    f.blur === undefined &&
    f.brightness === undefined &&
    f.contrast === undefined &&
    f.saturate === undefined &&
    f.grayscale === undefined &&
    f.hueRotate === undefined
  );
}

export function isEmptyBackdropFilter(f: BackdropFilterValue | undefined): boolean {
  if (!f) return true;
  return f.blur === undefined && f.saturate === undefined && f.brightness === undefined;
}

/** B6.1: mirror Rust `filter_css`. */
export function filterToCss(f: FilterValue | undefined): string | undefined {
  if (!f || isEmptyFilter(f)) return undefined;
  const parts: string[] = [];
  if (f.blur !== undefined) parts.push(`blur(${numCss(clampNum(f.blur, 0, 40))}px)`);
  if (f.brightness !== undefined) {
    parts.push(`brightness(${numCss(clampNum(f.brightness, 0, 300))}%)`);
  }
  if (f.contrast !== undefined) parts.push(`contrast(${numCss(clampNum(f.contrast, 0, 300))}%)`);
  if (f.saturate !== undefined) parts.push(`saturate(${numCss(clampNum(f.saturate, 0, 300))}%)`);
  if (f.grayscale !== undefined) parts.push(`grayscale(${numCss(clampNum(f.grayscale, 0, 100))}%)`);
  if (f.hueRotate !== undefined) {
    parts.push(`hue-rotate(${numCss(clampNum(f.hueRotate, 0, 360))}deg)`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

export function backdropFilterToCss(f: BackdropFilterValue | undefined): string | undefined {
  if (!f || isEmptyBackdropFilter(f)) return undefined;
  const parts: string[] = [];
  if (f.blur !== undefined) parts.push(`blur(${numCss(clampNum(f.blur, 0, 40))}px)`);
  if (f.saturate !== undefined) parts.push(`saturate(${numCss(clampNum(f.saturate, 0, 300))}%)`);
  if (f.brightness !== undefined) {
    parts.push(`brightness(${numCss(clampNum(f.brightness, 0, 300))}%)`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

export function styleToCss(
  style: StyleProps,
  extra?: CSSProperties,
): CSSProperties {
  const bgGrad = gradientToCss(style.backgroundGradient);
  const textGrad = bgGrad ? undefined : gradientToCss(style.textGradient);
  const out: CSSProperties = {
    display: style.display,
    width: cssLen(style.width),
    height: cssLen(style.height),
    minHeight: cssLen(style.minHeight),
    maxWidth: cssLen(style.maxWidth),
    margin: spacingToCss(style.margin),
    padding: spacingToCss(style.padding),
    backgroundColor: style.backgroundColor,
    color: textGrad ? "transparent" : style.color,
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
    borderStyle: borderStyleKw(style.borderStyle) as CSSProperties["borderStyle"],
    opacity: style.opacity,
    cursor: style.cursor,
    overflow: style.overflow,
    boxShadow: boxShadowToCss(style.boxShadow),
  };
  applyBorderRadiusCorners(out, style.borderRadiusCorners);
  applyBorderSides(out, style.borderSides);
  const xform = transformToCss(style.transform);
  // B5.1 T105: inline + transform → inline-block (canvas / preview parity with export).
  if (out.display === "inline" && xform) out.display = "inline-block";
  if (xform) out.transform = xform;
  const origin = transformOriginKw(style.transform?.origin);
  if (origin) out.transformOrigin = origin;
  applyTransition(out, style.transition);
  const filt = filterToCss(style.filter);
  if (filt) out.filter = filt;
  const bfilt = backdropFilterToCss(style.backdropFilter);
  if (bfilt) {
    out.WebkitBackdropFilter = bfilt;
    out.backdropFilter = bfilt;
    (out as CSSProperties & { "--wb-glass-solid"?: string })["--wb-glass-solid"] = opaqueFill(
      style.backgroundColor,
    );
  }
  const img = bgGrad ?? textGrad;
  if (img) {
    out.backgroundImage = img;
    if (textGrad) {
      out.WebkitBackgroundClip = "text";
      out.backgroundClip = "text";
    }
  }
  // B7.3: `extra` last so canvas can force `transition: "none"` over authored timing.
  return extra ? { ...out, ...extra } : out;
}
