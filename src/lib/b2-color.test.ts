import { describe, expect, test } from "bun:test";
import {
  COLOR_ERR_T69,
  COLOR_RE,
  formatColor,
  parseColorParts,
  toOpaqueHex6,
  withPreservedAlpha,
} from "@/lib/color-hex";

describe("B2.1 ColorField alpha (COLOR_RE / parse / format)", () => {
  test("accepts #rgb #rgba #rrggbb #rrggbbaa transparent", () => {
    for (const ok of ["#abc", "#abcd", "#aabbcc", "#aabbcc80", "#AABBCC", "transparent", "TRANSPARENT"]) {
      expect(COLOR_RE.test(ok)).toBe(true);
    }
    for (const bad of ["#ab", "#gg0000", "rgb(0,0,0)", "", "#aabbccff00", "currentColor"]) {
      expect(COLOR_RE.test(bad)).toBe(false);
    }
  });

  test("existing 6-digit still parses to alpha 100", () => {
    expect(parseColorParts("#0ea5e9")).toEqual({ rgb: "#0ea5e9", alpha: 100 });
    expect(parseColorParts("#ABC")).toEqual({ rgb: "#aabbcc", alpha: 100 });
  });

  test("8-digit and 4-digit expose alpha", () => {
    expect(parseColorParts("#00000080")!.alpha).toBe(50);
    expect(parseColorParts("#0008")!.rgb).toBe("#000000");
    expect(parseColorParts("#0008")!.alpha).toBe(53); // 0x88/255 ≈ 53%
    expect(parseColorParts("transparent")).toBeNull();
  });

  test("formatColor keeps 6-digit at 100%, else #rrggbbaa lowercase", () => {
    expect(formatColor("#0EA5E9", 100)).toBe("#0ea5e9");
    expect(formatColor("#000000", 50)).toBe("#00000080");
    expect(formatColor("#aabbcc", 0)).toBe("#aabbcc00");
  });

  test("native picker preserves prior alpha", () => {
    expect(withPreservedAlpha("#ff0000", "#00000080")).toBe("#ff000080");
    expect(withPreservedAlpha("#ff0000", "#000000")).toBe("#ff0000");
    expect(withPreservedAlpha("#ff0000", undefined)).toBe("#ff0000");
  });

  test("toOpaqueHex6 strips alpha for <input type=color>", () => {
    expect(toOpaqueHex6("#abc")).toBe("#aabbcc");
    expect(toOpaqueHex6("#aabbcc80")).toBe("#aabbcc");
    expect(toOpaqueHex6("transparent")).toBeNull();
  });

  test("T69 error string is exact", () => {
    expect(COLOR_ERR_T69).toBe("รูปแบบสีไม่ถูกต้อง (#rgb, #rrggbb, #rrggbbaa, transparent)");
  });

  test("ColorField re-exports COLOR_RE and wires T56 label", () => {
    const src = require("fs").readFileSync(
      require("path").join(import.meta.dir, "../components/editor/style/ColorField.tsx"),
      "utf8",
    );
    expect(src).toContain("ความโปร่งของสี");
    expect(src).toContain('export { COLOR_RE }');
    expect(src).toContain("COLOR_ERR_T69");
  });
});
