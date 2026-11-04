import { describe, expect, test } from "bun:test";
import { STYLE_SECTIONS } from "./style-fields";

describe("style panel section order", () => {
  test("display (ความทึบ) comes right after layout", () => {
    expect(STYLE_SECTIONS.map((s) => s.id)).toEqual([
      "layout",
      "display",
      "size",
      "spacing",
      "typography",
      "background",
      "border",
    ]);
  });
});
