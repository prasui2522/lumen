import { describe, expect, test } from "bun:test";
import { glassLevelOf, glassStyle, opaqueFill } from "./glass-material";

describe("glass thickness", () => {
  test("regular matches the glass preset blur", () => {
    expect(glassStyle("regular").backdropFilter?.blur).toBe(16);
    expect(glassLevelOf(glassStyle("thick"))).toBe("thick");
    expect(glassLevelOf({ backdropFilter: { blur: 3 } })).toBe("");
  });

  test("opaque fill drops alpha", () => {
    expect(opaqueFill("#ffffff2e")).toBe("#ffffff");
    expect(opaqueFill("#fff")).toBe("#ffffff");
    expect(opaqueFill(undefined)).toBe("#f8fafc");
  });
});
