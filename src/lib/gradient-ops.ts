/**
 * B3.2 pure helpers for the gradient editor (2–8 stops, kind/angle, exclusivity).
 */
import type { GradientKind, GradientStop, GradientValue } from "@/schema";
import { GRADIENT_MAX_STOPS, GRADIENT_MIN_STOPS } from "@/schema";

/** T80 — both fill modes present; compile keeps background. */
export const GRADIENT_EXCLUSIVE_MSG =
  "ใช้ได้อย่างใดอย่างหนึ่ง: ไล่สีพื้นหลังหรือไล่สีตัวอักษร";

/** Soft default when enabling a gradient for the first time. */
export const DEFAULT_GRADIENT: GradientValue = {
  kind: "linear",
  angle: 180,
  stops: [
    { color: "#0ea5e9", at: 0 },
    { color: "#0369a1", at: 100 },
  ],
};

export const DEFAULT_GRADIENT_STOP: GradientStop = {
  color: "#64748b",
  at: 50,
};

export function normalizeGradient(g: GradientValue | undefined): GradientValue | undefined {
  if (!g) return undefined;
  const stops = (g.stops ?? []).slice(0, GRADIENT_MAX_STOPS);
  if (stops.length < GRADIENT_MIN_STOPS) return undefined;
  const kind: GradientKind =
    g.kind === "radial" || g.kind === "conic" ? g.kind : "linear";
  const out: GradientValue = { kind, stops: stops.map((s) => ({ ...s })) };
  if (kind !== "radial" && g.angle !== undefined) out.angle = g.angle;
  else if (kind === "linear" && g.angle === undefined) out.angle = 180;
  else if (kind === "conic" && g.angle === undefined) out.angle = 0;
  return out;
}

export function canAddGradientStop(stops: readonly GradientStop[]): boolean {
  return stops.length < GRADIENT_MAX_STOPS;
}

/** Returns next stops, or `null` when the 9th would be added. */
export function addGradientStop(
  stops: readonly GradientStop[],
): GradientStop[] | null {
  if (!canAddGradientStop(stops)) return null;
  const last = stops[stops.length - 1]?.at ?? 0;
  const at = stops.length === 0 ? 50 : Math.min(100, Math.round((last + 100) / 2));
  return [...stops, { ...DEFAULT_GRADIENT_STOP, at }];
}

/**
 * Remove stop at `index`. Refuses when that would leave fewer than
 * GRADIENT_MIN_STOPS (returns the original array copy).
 */
export function removeGradientStop(
  stops: readonly GradientStop[],
  index: number,
): GradientStop[] {
  if (index < 0 || index >= stops.length) return [...stops];
  if (stops.length <= GRADIENT_MIN_STOPS) return [...stops];
  return stops.filter((_, i) => i !== index);
}

/** Focus target after removing `index`: neighbour at same slot, else previous. */
export function focusStopIndexAfterRemove(lengthBefore: number, index: number): number {
  if (lengthBefore <= 1) return -1;
  if (index < lengthBefore - 1) return index;
  return index - 1;
}

export function patchGradientStop(
  stops: readonly GradientStop[],
  index: number,
  patch: Partial<GradientStop>,
): GradientStop[] {
  if (index < 0 || index >= stops.length) return [...stops];
  return stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop));
}

export function patchGradient(
  current: GradientValue | undefined,
  patch: Partial<GradientValue>,
): GradientValue {
  const base = current ?? DEFAULT_GRADIENT;
  return {
    kind: patch.kind ?? base.kind ?? "linear",
    angle: patch.angle !== undefined ? patch.angle : base.angle,
    stops: patch.stops ?? base.stops ?? DEFAULT_GRADIENT.stops,
  };
}

/** Which style key is active for the editor (background wins if both set). */
export function activeGradientMode(
  background: GradientValue | undefined,
  text: GradientValue | undefined,
): "background" | "text" | "none" {
  if (background !== undefined) return "background";
  if (text !== undefined) return "text";
  return "none";
}

export function activeGradientValue(
  background: GradientValue | undefined,
  text: GradientValue | undefined,
): GradientValue | undefined {
  const mode = activeGradientMode(background, text);
  if (mode === "background") return background;
  if (mode === "text") return text;
  return undefined;
}
