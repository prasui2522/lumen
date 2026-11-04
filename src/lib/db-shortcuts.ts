/**
 * Undo routing in `ฐานข้อมูล` (PHASE-10-SPEC §8): Ctrl/Cmd+Z → model undo,
 * Ctrl/Cmd+Shift+Z or Ctrl+Y → model redo. A text field keeps native text
 * undo only while it has its own history (`nativeOk`, see modal.ts); else the
 * key is blocked so WebKit's document-wide undo can't edit another field.
 * An open overlay owns the keyboard: the model is never touched behind it.
 * Pure, so it is unit-tested.
 */
export type UndoKey = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

export function dbUndoAction(
  e: UndoKey,
  ctx: { textTarget: boolean; overlayOpen: boolean; nativeOk: boolean },
): "undo" | "redo" | "pass" | "block" {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return "pass";
  const k = e.key.toLowerCase();
  const action = k === "z" ? (e.shiftKey ? "redo" : "undo") : k === "y" && !e.shiftKey ? "redo" : null;
  if (!action) return "pass";
  if (ctx.textTarget) return ctx.nativeOk ? "pass" : "block";
  if (ctx.overlayOpen) return "block";
  return action;
}

/** Text-like inputs, textareas and contenteditable keep the browser's own undo. */
export function isTextTarget(t: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLTextAreaElement || t.isContentEditable) return true;
  return (
    t instanceof HTMLInputElement &&
    !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(t.type)
  );
}
