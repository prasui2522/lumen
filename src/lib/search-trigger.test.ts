import { describe, expect, test } from "bun:test";
import { searchKeyAction, type SearchKey } from "./search-trigger";

const k = (key: string, over: Partial<SearchKey> = {}): SearchKey => ({
  key, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...over,
});

describe("searchKeyAction", () => {
  test("Enter and Space open without adding text", () => {
    expect(searchKeyAction(k("Enter"))).toEqual({ type: "open", append: "" });
    expect(searchKeyAction(k(" "))).toEqual({ type: "open", append: "" });
  });
  test("first printable character opens and is carried over (Latin and Thai)", () => {
    expect(searchKeyAction(k("a"))).toEqual({ type: "open", append: "a" });
    expect(searchKeyAction(k("ก"))).toEqual({ type: "open", append: "ก" });
    expect(searchKeyAction(k("้"))).toEqual({ type: "open", append: "้" });
  });
  test("Tab, Shift, arrows, modifier combos and IME keys pass", () => {
    for (const key of ["Tab", "Shift", "ArrowDown", "Escape", "Backspace"]) {
      expect(searchKeyAction(k(key))).toEqual({ type: "pass" });
    }
    expect(searchKeyAction(k("k", { ctrlKey: true }))).toEqual({ type: "pass" });
    expect(searchKeyAction(k("k", { metaKey: true }))).toEqual({ type: "pass" });
    expect(searchKeyAction(k("a", { altKey: true }))).toEqual({ type: "pass" });
    expect(searchKeyAction(k("Process"))).toEqual({ type: "pass" });
    expect(searchKeyAction(k("ก", { isComposing: true }))).toEqual({ type: "pass" });
  });
});
