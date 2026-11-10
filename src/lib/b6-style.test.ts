/**
 * B6.1 (§9.B / §4.2): filter + backdropFilter.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { STYLE_KEYS, type StyleProps } from "@/schema";
import { opaqueFill } from "@/lib/glass-material";
import {
  backdropFilterToCss,
  filterToCss,
  styleToCss,
} from "@/lib/style-css";

const STYLE_FX = join(import.meta.dir, "../../src-tauri/src/fixtures/style");
const src = (rel: string) => readFileSync(join(import.meta.dir, "..", rel), "utf8");

function cssFromStyle(style: StyleProps): string {
  const react = styleToCss(style);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(react)) {
    if (v === undefined || v === null || v === "") continue;
    // A2: canvas-only custom properties are not export declarations (see the glass fallback test below).
    if (k.startsWith("--")) continue;
    const inputHad = (style as Record<string, unknown>)[k] !== undefined;
    if (!inputHad && k === "borderColor") continue;
    const kebab = k
      .replace(/Webkit/g, "-webkit")
      .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    lines.push(`${kebab}: ${v};`);
  }
  lines.sort();
  return lines.length ? lines.join("\n") + "\n" : "";
}

describe("B6 STYLE_KEYS", () => {
  test("includes filter + backdropFilter (31 keys)", () => {
    expect(STYLE_KEYS.length).toBe(31);
    expect(STYLE_KEYS).toContain("filter");
    expect(STYLE_KEYS).toContain("backdropFilter");
  });
});

describe("B6 filter goldens", () => {
  test.each(["filter-basic", "backdrop-blur"] as const)("%s", (name) => {
    const style = JSON.parse(
      readFileSync(join(STYLE_FX, `${name}.json`), "utf8"),
    ) as StyleProps;
    expect(cssFromStyle(style)).toBe(readFileSync(join(STYLE_FX, `${name}.css`), "utf8"));
  });
});

describe("B6 canvas glass fallback (a4cb5eb --wb-glass-solid)", () => {
  test("backdrop blur sets --wb-glass-solid to the opaque fill; index.css .wb-glass reads it", () => {
    const solid = (st: StyleProps) => (styleToCss(st) as Record<string, unknown>)["--wb-glass-solid"];
    expect(solid({ backdropFilter: { blur: 12 } } as StyleProps)).toBe(opaqueFill(undefined));
    expect(opaqueFill(undefined)).toBe("#f8fafc");
    expect(solid({ backdropFilter: { blur: 12 }, backgroundColor: "#ffffff80" } as StyleProps)).toBe(opaqueFill("#ffffff80"));
    expect(solid({ filter: { blur: 4 } } as StyleProps)).toBeUndefined();
    expect(src("index.css")).toContain("background-color: var(--wb-glass-solid, #f8fafc) !important;");
  });
});

describe("B6 helpers + wiring", () => {
  test("blur capped; T109–T114 labels", () => {
    expect(filterToCss({ blur: 99 })).toBe("blur(40px)");
    expect(backdropFilterToCss({ blur: 12, saturate: 150 })).toBe("blur(12px) saturate(150%)");
    const ep = src("components/editor/effects-panels.tsx");
    for (const t of [
      "ความสว่าง",
      "คอนทราสต์",
      "ความอิ่มสี",
      "ขาวดำ",
      "เบลอฉากหลัง",
      "ฉากหลังเบลอเปลืองหน่วยความจำ ใช้เท่าที่จำเป็น",
    ]) {
      expect(ep).toContain(t);
    }
    expect(ep).toContain('data-effects-panel="filter"');
    expect(src("components/editor/StylePanel.tsx")).toContain("FilterSubGroup");
  });
});
