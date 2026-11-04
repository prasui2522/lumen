import { useCallback, useRef } from "react";

/**
 * True while any Radix/shadcn overlay is open: dialog, alert-dialog,
 * dropdown/context menu or popover. Global editor shortcuts (undo/redo,
 * Delete, arrows, Esc) must not touch the document behind an overlay.
 */
const OPEN_OVERLAY =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], ' +
  '[role="menu"][data-state="open"], [data-radix-popper-content-wrapper], ' +
  // Radix Select (item-aligned) has no popper wrapper; its content is a listbox.
  '[data-slot="select-content"][data-state="open"]';

/**
 * Tooltips are popper content too, but they never own the keyboard: a tooltip
 * opened by keyboard focus (e.g. a ฐานข้อมูล table row) must not block Ctrl+K,
 * undo or other global shortcuts.
 */
const TOOLTIP_CONTENT = '[data-slot="tooltip-content"], [role="tooltip"]';

function ownsKeyboard(el: Element): boolean {
  return !(el.hasAttribute("data-radix-popper-content-wrapper") && el.querySelector(TOOLTIP_CONTENT));
}

export function isOverlayOpen(root: Pick<ParentNode, "querySelectorAll"> = document): boolean {
  return [...root.querySelectorAll(OPEN_OVERLAY)].some(ownsKeyboard);
}

/** Text-editable element inside an open overlay (keeps its own native text undo). */
export function isEditableInOverlay(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const editable =
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(t.type)) ||
    t.isContentEditable;
  const overlay = t.closest(OPEN_OVERLAY);
  return editable && overlay !== null && ownsKeyboard(overlay);
}

const DIALOG_SEL = '[role="dialog"], [role="alertdialog"]';

/** Where focus should go back to: the element that opened the dialog (a menu item → its menu trigger). */
function returnTargetOf(a: Element | null): HTMLElement | null {
  if (!(a instanceof HTMLElement) || a === document.body || a.closest(DIALOG_SEL)) return null;
  const menu = a.closest('[role="menu"]');
  if (menu) {
    const id = menu.getAttribute("aria-labelledby");
    const trigger = id ? document.getElementById(id) : null;
    return trigger instanceof HTMLElement ? trigger : null;
  }
  return a;
}

/** Canvas in the editor, otherwise the page's marked primary control. */
function focusFallback() {
  const el =
    document.querySelector<HTMLElement>('[data-kbd-scope="canvas"]') ??
    document.querySelector<HTMLElement>("[data-focus-fallback]");
  el?.focus({ preventScroll: true });
}

/**
 * `onCloseAutoFocus` for controlled dialogs without a Radix Trigger (focus
 * would otherwise land on <body>). Captures the focused element during the
 * render that opens the dialog — before Radix moves focus in, which also holds
 * for lazy dialogs mounted already open — and restores it on close; falls back
 * to the canvas (or `[data-focus-fallback]`) if that element is gone.
 */
export function useRestoreFocus(open: boolean): (e: Event) => void {
  const target = useRef<HTMLElement | null>(null);
  if (open) {
    const t = returnTargetOf(document.activeElement);
    if (t) target.current = t;
  }
  return useCallback((e: Event) => {
    e.preventDefault();
    const t = target.current;
    target.current = null;
    lastRestored = null;
    if (t?.isConnected) {
      t.focus({ preventScroll: true });
      if (document.activeElement === t) {
        lastRestored = t;
        return;
      }
    }
    focusFallback();
  }, []);
}

let lastRestored: HTMLElement | null = null;
/**
 * The element the last closed dialog (e.g. the command palette) returned focus
 * to, or null when it had no opener. Lets a command that outlives the palette
 * (an async save dialog) put focus back there afterwards.
 */
export function lastRestoredFocus(): HTMLElement | null {
  return lastRestored?.isConnected ? lastRestored : null;
}

/*
 * Native text undo guard. WebKit keeps ONE undo stack for the whole document,
 * so Ctrl+Z in a field with nothing of its own to undo reverts the previous
 * edit in ANOTHER field: that field gets focus, an open popover/dialog loses
 * focus and closes, and the stray draft can then be saved. We allow native
 * undo only while the focused field differs from its value when it was
 * focused, and native redo only after its own native undos.
 */
export type NativeHistory = { baseline: string; redo: number };
const nativeHistory = new WeakMap<EventTarget, NativeHistory>();

const isTextField = (t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement =>
  typeof HTMLElement !== "undefined" &&
  (t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(t.type)));

/** Pure rule (unit-tested): may this field run the browser's own undo/redo? */
export function nativeUndoOk(value: string, h: NativeHistory | undefined, redo: boolean): boolean {
  if (!h) return false;
  return redo ? h.redo > 0 : value !== h.baseline;
}

/** For a keydown target: false = the key must be blocked (preventDefault). */
export function nativeUndoAllowed(t: EventTarget | null, redo: boolean): boolean {
  if (!isTextField(t)) return (t instanceof HTMLElement && t.isContentEditable) || false;
  return nativeUndoOk(t.value, nativeHistory.get(t), redo);
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (e) => {
      if (isTextField(e.target)) nativeHistory.set(e.target, { baseline: e.target.value, redo: 0 });
    },
    true,
  );
  document.addEventListener(
    "input",
    (e) => {
      const h = nativeHistory.get(e.target!);
      if (!h) return;
      const type = (e as InputEvent).inputType;
      if (type === "historyUndo") h.redo++;
      else if (type === "historyRedo") h.redo = Math.max(0, h.redo - 1);
      else h.redo = 0;
    },
    true,
  );
}
