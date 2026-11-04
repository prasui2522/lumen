import { describe, expect, test } from "bun:test";
import { isOverlayOpen, nativeUndoOk } from "./modal";

/** Minimal stand-ins: no DOM in bun test. */
type Fake = { attrs: string[]; tooltip: boolean };
const el = (f: Fake) => ({
  hasAttribute: (a: string) => f.attrs.includes(a),
  querySelector: () => (f.tooltip ? {} : null),
});
const root = (...els: Fake[]) => ({ querySelectorAll: () => els.map(el) }) as unknown as Pick<ParentNode, "querySelectorAll">;
const POPPER = "data-radix-popper-content-wrapper";

describe("isOverlayOpen (Ctrl+K root cause)", () => {
  test("nothing open", () => expect(isOverlayOpen(root())).toBe(false));
  test("a keyboard-focus tooltip (popper wrapper around tooltip content) does not count", () => {
    expect(isOverlayOpen(root({ attrs: [POPPER], tooltip: true }))).toBe(false);
  });
  test("a popover/select popper still counts", () => {
    expect(isOverlayOpen(root({ attrs: [POPPER], tooltip: false }))).toBe(true);
  });
  test("a dialog counts even while a tooltip is open", () => {
    expect(isOverlayOpen(root({ attrs: [POPPER], tooltip: true }, { attrs: ["role"], tooltip: false }))).toBe(true);
  });
});

describe("native text undo guard (fail 2 root cause: WebKit's document-wide undo stack)", () => {
  test("undo only while the field differs from its value on focus", () => {
    expect(nativeUndoOk("12", { baseline: "12", redo: 0 }, false)).toBe(false);
    expect(nativeUndoOk("123", { baseline: "12", redo: 0 }, false)).toBe(true);
    expect(nativeUndoOk("x", undefined, false)).toBe(false);
  });
  test("redo only after the field's own native undos", () => {
    expect(nativeUndoOk("12", { baseline: "12", redo: 0 }, true)).toBe(false);
    expect(nativeUndoOk("12", { baseline: "12", redo: 1 }, true)).toBe(true);
  });
});
