/**
 * S4: Ctrl+1–4 switch modes; F6 cycles panes. Pure helpers (no DOM).
 */
import type { EditorMode } from "@/stores/editor-store";

const DIGIT: Record<string, EditorMode> = {
  "1": "design",
  "2": "split",
  "3": "code",
  "4": "preview",
};

export function modeShortcut(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): EditorMode | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return null;
  return DIGIT[e.key] ?? null;
}

/** Focus order: mode switch → canvas → right pane (code / preview) → style. */
export const PANE_SELECTOR = "[data-kbd-pane]";

export function cyclePane(
  current: Element | null,
  panes: Element[],
  reverse: boolean,
): Element | null {
  if (panes.length === 0) return null;
  const i = current ? panes.indexOf(current) : -1;
  if (i < 0) return panes[reverse ? panes.length - 1 : 0] ?? null;
  const next = reverse
    ? (i - 1 + panes.length) % panes.length
    : (i + 1) % panes.length;
  return panes[next] ?? null;
}
