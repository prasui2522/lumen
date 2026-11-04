import type { CSSProperties } from "react";
import type { BoxSpacing, StyleProps } from "@/schema";

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
    ...extra,
  };
}
