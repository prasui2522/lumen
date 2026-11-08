/**
 * WCAG 2.1 contrast helpers for Phase 11 C (preset text on opaque backgrounds).
 * Uses sRGB relative luminance (WCAG 2.x).
 */
import { parseColorParts } from "@/lib/color-hex";

function srgbChannel(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance 0–1 for opaque `#rrggbb` / short hex / with alpha ignored if 100%. */
export function relativeLuminance(hex: string): number | null {
  const parts = parseColorParts(hex);
  if (!parts || parts.alpha < 100) return null; // translucent: no verdict (spec §6.4)
  const h = parts.rgb.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

/** Contrast ratio ≥ 1. Null if either colour is missing / translucent. */
export function contrastRatio(fg: string, bg: string): number | null {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  if (L1 === null || L2 === null) return null;
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when text contrast ≥ 4.5:1 on an opaque background. */
export function meetsTextContrast(fg: string, bg: string, min = 4.5): boolean {
  const r = contrastRatio(fg, bg);
  return r !== null && r >= min;
}
