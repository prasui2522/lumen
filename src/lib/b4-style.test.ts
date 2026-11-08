/**
 * B4.1 (§9.B / §4.2): borderSides + borderRadiusCorners + dashed/dotted.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { STYLE_KEYS, type StyleProps } from "@/schema";
import {
  borderStyleKw,
  isEmptyBorderRadiusCorners,
  isEmptyBorderSides,
  styleToCss,
} from "@/lib/style-css";
import { cleanStyle } from "@/lib/breakpoints";

const STYLE_FX = join(import.meta.dir, "../../src-tauri/src/fixtures/style");

/** Map styleToCss → sorted CSS lines (border/shadow-safe like B1). */
function cssFromStyle(style: StyleProps): string {
  const react = styleToCss(style);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(react)) {
    if (v === undefined || v === null || v === "") continue;
    const inputHad = (style as Record<string, unknown>)[k] !== undefined;
    if (!inputHad && k === "borderColor") continue;
    const kebab = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    lines.push(`${kebab}: ${v};`);
  }
  lines.sort();
  return lines.length ? lines.join("\n") + "\n" : "";
}

describe("B4 STYLE_KEYS", () => {
  test("includes borderSides + transform + transition (27 keys)", () => {
    expect(STYLE_KEYS.length).toBe(29);
    expect(STYLE_KEYS).toContain("borderSides");
    expect(STYLE_KEYS).toContain("borderRadiusCorners");
    expect(STYLE_KEYS).toContain("transform");
    expect(STYLE_KEYS).toContain("transition");
  });
});

describe("B4 border goldens (TS ↔ fixtures/style)", () => {
  test.each(["border-side-override", "border-corners", "border-dashed"] as const)(
    "%s",
    (name) => {
      const style = JSON.parse(
        readFileSync(join(STYLE_FX, `${name}.json`), "utf8"),
      ) as StyleProps;
      expect(cssFromStyle(style)).toBe(readFileSync(join(STYLE_FX, `${name}.css`), "utf8"));
    },
  );
});

describe("B4 helpers + cleanStyle", () => {
  test("borderStyleKw allowlist; empty sides/corners dropped", () => {
    expect(borderStyleKw("Dashed")).toBe("dashed");
    expect(borderStyleKw("groove")).toBeUndefined();
    expect(isEmptyBorderSides({})).toBe(true);
    expect(isEmptyBorderSides({ t: { width: 1 } })).toBe(false);
    expect(isEmptyBorderRadiusCorners({})).toBe(true);
    expect(isEmptyBorderRadiusCorners({ tl: 4 })).toBe(false);
    expect(cleanStyle({ borderSides: {}, color: "#111" })).toEqual({ color: "#111" });
    expect(cleanStyle({ borderRadiusCorners: {} })).toBeUndefined();
  });
});

describe("B4 StylePanel + BorderExtras wiring", () => {
  test("dashed/dotted options and BorderExtras labels T90–T97", () => {
    const sf = readFileSync(join(import.meta.dir, "style-fields.ts"), "utf8");
    expect(sf).toContain('label: "เส้นประ"');
    expect(sf).toContain('label: "จุด"');
    const be = readFileSync(
      join(import.meta.dir, "../components/editor/style/BorderExtras.tsx"),
      "utf8",
    );
    for (const t of [
      "เส้นขอบแยกด้าน",
      "มุมโค้งแยกมุม",
      "บนซ้าย",
      "บนขวา",
      "ล่างขวา",
      "ล่างซ้าย",
      "เส้นประ",
      "จุด",
    ]) {
      expect(be).toContain(t);
    }
    const sp = readFileSync(
      join(import.meta.dir, "../components/editor/StylePanel.tsx"),
      "utf8",
    );
    expect(sp).toContain("BorderExtras");
  });
});
