import { isOverlayOpen } from "@/lib/modal";
import { useEditorStore } from "@/stores/editor-store";

/** Frames to keep trying after insert, covering menu close + focus restore. */
const MAX_FRAMES = 30;

/**
 * Move keyboard focus to the layer row `id` once no overlay is open.
 * A menu or the command palette restores focus on close *after* insert, so
 * one immediate focus() is not enough. Clears `focusLayerId` when the row
 * holds focus for a second frame (restore already happened) or when the
 * selection moved away. Does not change `selectedNodeId`.
 */
export function focusInsertedLayer(id: string): () => void {
  let cancelled = false;
  let raf = 0;
  let frames = 0;
  /** Consecutive frames where this row is the active element. */
  let held = 0;

  const tick = () => {
    if (cancelled) return;
    frames += 1;
    const s = useEditorStore.getState();
    if (s.focusLayerId !== id || s.selectedNodeId !== id) {
      if (s.focusLayerId === id) s.setFocusLayerId(null);
      return;
    }
    const row = document.querySelector<HTMLElement>(
      `[data-layer-row][data-layer-id="${CSS.escape(id)}"]`,
    );
    if (!isOverlayOpen() && row) {
      if (document.activeElement !== row) row.focus({ preventScroll: false });
      if (document.activeElement === row) {
        held += 1;
        // Second quiet frame: a close-restore scheduled for the next task
        // has already run, and it did not take focus back.
        if (held >= 2) {
          s.setFocusLayerId(null);
          return;
        }
      } else {
        held = 0;
      }
    } else {
      held = 0;
    }
    if (frames >= MAX_FRAMES) {
      s.setFocusLayerId(null);
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
