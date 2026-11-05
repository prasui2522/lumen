import { describe, expect, test } from "bun:test";
import { STYLE_SECTIONS } from "./style-fields";

describe("style panel section order", () => {
  test("display (ความทึบ) comes right after layout; effects after border", () => {
    expect(STYLE_SECTIONS.map((s) => s.id)).toEqual([
      "layout",
      "display",
      "size",
      "spacing",
      "typography",
      "background",
      "border",
      "effects",
    ]);
  });

  test("effects section label is T60a เอฟเฟกต์", () => {
    expect(STYLE_SECTIONS.find((s) => s.id === "effects")?.label).toBe("เอฟเฟกต์");
  });
});
