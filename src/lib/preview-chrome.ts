/** Preview selection resize. Screen deltas are divided by the device-frame scale before this runs. */

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const RESIZE_HANDLES: readonly ResizeHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

const MIN_PX = 8;

export function resizedSize(
  start: { w: number; h: number },
  handle: ResizeHandle,
  dx: number,
  dy: number,
  min = MIN_PX,
): { w: number; h: number } {
  let w = start.w;
  let h = start.h;
  if (handle.includes("e")) w = start.w + dx;
  if (handle.includes("w")) w = start.w - dx;
  if (handle.includes("s")) h = start.h + dy;
  if (handle.includes("n")) h = start.h - dy;
  return { w: Math.max(min, Math.round(w)), h: Math.max(min, Math.round(h)) };
}
