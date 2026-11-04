import { describe, expect, test } from "bun:test";
import { focusCaretAtEnd, type CaretTarget } from "./caret";

function fake(value: string) {
  const calls: { focused: boolean; sel: [number, number] | null } = { focused: false, sel: null };
  const el: CaretTarget = {
    value,
    focus: () => {
      calls.focused = true;
    },
    setSelectionRange: (a, b) => {
      calls.sel = [a, b];
    },
  };
  return { el, calls };
}

describe("focusCaretAtEnd", () => {
  test("seeded text: caret at end, nothing selected", () => {
    const { el, calls } = fake("h");
    expect(focusCaretAtEnd(el)).toBe(true);
    expect(calls.focused).toBe(true);
    expect(calls.sel).toEqual([1, 1]);
    const thai = fake("กา");
    focusCaretAtEnd(thai.el);
    expect(thai.calls.sel).toEqual([2, 2]);
  });
  test("unseeded open: empty input focused, caret at 0", () => {
    const { el, calls } = fake("");
    focusCaretAtEnd(el);
    expect(calls.sel).toEqual([0, 0]);
  });
  test("missing input is a no-op", () => {
    expect(focusCaretAtEnd(null)).toBe(false);
  });
});
