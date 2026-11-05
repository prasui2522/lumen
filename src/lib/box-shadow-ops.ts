/**
 * B2.2 pure helpers for the shadow editor (≤6 layers, reorder, default layer).
 */
import type { BoxShadowLayer } from "@/schema";

export const MAX_BOX_SHADOW_LAYERS = 6;

/** T79a — refused when the user tries to add a 7th layer. */
export const BOX_SHADOW_MAX_MSG = "ใช้เงาได้สูงสุด 6 ชั้น";

/** Soft default for a newly added layer. */
export const DEFAULT_SHADOW_LAYER: BoxShadowLayer = {
  x: 0,
  y: 4,
  blur: 8,
  spread: 0,
  color: "#00000040",
};

export function canAddShadowLayer(layers: readonly BoxShadowLayer[]): boolean {
  return layers.length < MAX_BOX_SHADOW_LAYERS;
}

/** Returns the next layers array, or `null` when the 7th would be added. */
export function addShadowLayer(
  layers: readonly BoxShadowLayer[],
): BoxShadowLayer[] | null {
  if (!canAddShadowLayer(layers)) return null;
  return [...layers, { ...DEFAULT_SHADOW_LAYER }];
}

export function removeShadowLayer(
  layers: readonly BoxShadowLayer[],
  index: number,
): BoxShadowLayer[] {
  if (index < 0 || index >= layers.length) return [...layers];
  return layers.filter((_, i) => i !== index);
}

/** Focus target after removing `index`: neighbour at same slot, else previous. */
export function focusIndexAfterRemove(lengthBefore: number, index: number): number {
  if (lengthBefore <= 1) return -1;
  if (index < lengthBefore - 1) return index; // next slid into this slot
  return index - 1;
}

export function moveShadowLayer(
  layers: readonly BoxShadowLayer[],
  index: number,
  dir: -1 | 1,
): BoxShadowLayer[] {
  const j = index + dir;
  if (index < 0 || index >= layers.length || j < 0 || j >= layers.length) {
    return [...layers];
  }
  const next = [...layers];
  const tmp = next[index]!;
  next[index] = next[j]!;
  next[j] = tmp;
  return next;
}

export function patchShadowLayer(
  layers: readonly BoxShadowLayer[],
  index: number,
  patch: Partial<BoxShadowLayer>,
): BoxShadowLayer[] {
  if (index < 0 || index >= layers.length) return [...layers];
  return layers.map((layer, i) => (i === index ? { ...layer, ...patch } : layer));
}
