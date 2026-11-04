import { describe, expect, test } from "bun:test";
import { saveShortcutAction, type SaveKey, type SaveState } from "./save-shortcut";
import { commitProjectTitle, DEFAULT_PROJECT_TITLE, titleBlurShouldSave } from "./project-title";

const k = (over: Partial<SaveKey> = {}): SaveKey => ({
  key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...over,
});
const s = (over: Partial<SaveState> = {}): SaveState => ({
  blocked: false, editing: false, dirty: true, saving: false, ...over,
});

describe("saveShortcutAction", () => {
  test("Ctrl+S and Cmd+S save when dirty", () => {
    expect(saveShortcutAction(k(), s())).toBe("save");
    expect(saveShortcutAction(k({ ctrlKey: false, metaKey: true, key: "S" }), s())).toBe("save");
  });
  test("other keys pass through", () => {
    expect(saveShortcutAction(k({ key: "k" }), s())).toBe("pass");
    expect(saveShortcutAction(k({ ctrlKey: false }), s())).toBe("pass");
    expect(saveShortcutAction(k({ altKey: true }), s())).toBe("pass");
  });
  test("prevent only: repeat, blocked, clean, in flight", () => {
    expect(saveShortcutAction(k({ repeat: true }), s())).toBe("prevent");
    expect(saveShortcutAction(k(), s({ blocked: true }))).toBe("prevent");
    expect(saveShortcutAction(k(), s({ blocked: true, editing: true }))).toBe("prevent");
    expect(saveShortcutAction(k(), s({ dirty: false }))).toBe("prevent");
    expect(saveShortcutAction(k(), s({ saving: true }))).toBe("prevent");
  });
  test("inline edit commits first, even when clean", () => {
    expect(saveShortcutAction(k(), s({ editing: true, dirty: false }))).toBe("commit");
  });
  test("title field focused commits the title first", () => {
    expect(saveShortcutAction(k(), s({ titleFocused: true, dirty: false }))).toBe("commit-title");
    expect(saveShortcutAction(k(), s({ titleFocused: true, blocked: true }))).toBe("prevent");
    expect(saveShortcutAction(k({ repeat: true }), s({ titleFocused: true }))).toBe("prevent");
    // after the commit the caller asks again without titleFocused
    expect(saveShortcutAction(k(), s({ dirty: false }))).toBe("prevent");
  });
});

describe("commitProjectTitle (same rule as blur)", () => {
  test("trims and falls back on empty / whitespace", () => {
    expect(commitProjectTitle("  ร้านกาแฟ  ")).toBe("ร้านกาแฟ");
    expect(commitProjectTitle("")).toBe(DEFAULT_PROJECT_TITLE);
    expect(commitProjectTitle("   ")).toBe(DEFAULT_PROJECT_TITLE);
  });
});

describe("titleBlurShouldSave", () => {
  test("saves only when dirty and not already saving", () => {
    expect(titleBlurShouldSave({ dirty: true, saving: false })).toBe(true);
    expect(titleBlurShouldSave({ dirty: false, saving: false })).toBe(false);
    expect(titleBlurShouldSave({ dirty: true, saving: true })).toBe(false);
  });
});
