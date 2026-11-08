import type { PaletteType } from "@/lib/document-ops";

/**
 * In-memory HTML5 drag payload. dataTransfer.getData() is unreadable during
 * dragover, so the canvas reads the active drag from here. Not persisted.
 */
export type DragPayload =
  | { kind: "move"; nodeId: string }
  | { kind: "new"; nodeType: PaletteType }
  /** Phase 11 D5 — block card → canvas. */
  | { kind: "block"; blockId: string; scope: "page" | "inline" };

let current: DragPayload | null = null;

export function setDragPayload(p: DragPayload | null): void {
  current = p;
}

export function getDragPayload(): DragPayload | null {
  return current;
}

export const PALETTE_DRAG_MIME = "application/x-webapp-new-node";
/** Distinct MIME so legacy drop handlers ignore block drags until wired. */
export const BLOCK_DRAG_MIME = "application/x-webapp-block";
