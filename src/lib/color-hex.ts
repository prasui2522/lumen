/**
 * B2.1: hex colour parse/format for ColorField (#rgb/#rgba/#rrggbb/#rrggbbaa + transparent).
 * Stored values are lowercase. Alpha 100% keeps 6-digit form so existing docs stay stable.
 */

/** Accepts #rgb, #rgba, #rrggbb, #rrggbbaa, transparent (PHASE-11-SPEC §9.B B2.1). */
export const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent)$/i;

/** T69 — used when transparent is allowed. */
export const COLOR_ERR_T69 =
  "รูปแบบสีไม่ถูกต้อง (#rgb, #rrggbb, #rrggbbaa, transparent)";

/** Same shapes without transparent (text/border colour fields). */
export const COLOR_ERR_NO_TRANSPARENT =
  "รูปแบบสีไม่ถูกต้อง (#rgb, #rrggbb, #rrggbbaa)";

export type ColorParts = { rgb: string; alpha: number };

/** Expand a valid non-transparent colour to opaque #rrggbb + alpha 0–100. */
export function parseColorParts(v: string | undefined): ColorParts | null {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  if (t === "transparent" || !COLOR_RE.test(t)) return null;
  const h = t.slice(1);
  if (h.length === 3) {
    return { rgb: `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`, alpha: 100 };
  }
  if (h.length === 4) {
    const a = parseInt(h[3] + h[3], 16);
    return {
      rgb: `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`,
      alpha: Math.round((a / 255) * 100),
    };
  }
  if (h.length === 6) return { rgb: `#${h}`, alpha: 100 };
  if (h.length === 8) {
    const a = parseInt(h.slice(6, 8), 16);
    return { rgb: `#${h.slice(0, 6)}`, alpha: Math.round((a / 255) * 100) };
  }
  return null;
}

/** Opaque #rrggbb for the native `<input type="color">` (no alpha). */
export function toOpaqueHex6(v: string | undefined): string | null {
  return parseColorParts(v)?.rgb ?? null;
}

/**
 * Rebuild a stored colour. Alpha ≥ 100 → `#rrggbb`; else `#rrggbbaa`.
 * `rgb` must already be `#rrggbb`.
 */
export function formatColor(rgb: string, alpha: number): string {
  const a = Math.round(Math.min(100, Math.max(0, alpha)));
  const r = rgb.toLowerCase();
  if (a >= 100) return r;
  const hexA = Math.round((a / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${r}${hexA}`;
}

/** Keep prior alpha when the native picker emits a fresh `#rrggbb`. */
export function withPreservedAlpha(nextRgb: string, prior: string | undefined): string {
  const parts = parseColorParts(prior);
  if (!parts || parts.alpha >= 100) return nextRgb.toLowerCase();
  return formatColor(nextRgb, parts.alpha);
}
