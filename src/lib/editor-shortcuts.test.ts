import { describe, expect, test } from "bun:test";
import { cyclePane, modeShortcut } from "./editor-shortcuts";

const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe("S4 mode shortcuts", () => {
  test("Ctrl+1–4 map Design / Split / Code / Preview", () => {
    expect(modeShortcut({ ...base, key: "1", ctrlKey: true })).toBe("design");
    expect(modeShortcut({ ...base, key: "2", ctrlKey: true })).toBe("split");
    expect(modeShortcut({ ...base, key: "3", ctrlKey: true })).toBe("code");
    expect(modeShortcut({ ...base, key: "4", ctrlKey: true })).toBe("preview");
    expect(modeShortcut({ ...base, key: "1" })).toBeNull();
    expect(modeShortcut({ ...base, key: "5", ctrlKey: true })).toBeNull();
    expect(modeShortcut({ ...base, key: "1", ctrlKey: true, altKey: true })).toBeNull();
  });

  test("F6 cycle wraps and reverses", () => {
    const a = { id: "a" } as unknown as Element;
    const b = { id: "b" } as unknown as Element;
    const c = { id: "c" } as unknown as Element;
    const panes = [a, b, c];
    expect(cyclePane(null, panes, false)).toBe(a);
    expect(cyclePane(a, panes, false)).toBe(b);
    expect(cyclePane(c, panes, false)).toBe(a);
    expect(cyclePane(a, panes, true)).toBe(c);
  });
});
