/**
 * B5.1 (§9.B / §4.2): transform + transition plumbing and effects-panels wiring.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { STYLE_KEYS, type StyleProps } from "@/schema";
import {
  isEmptyTransform,
  isEmptyTransition,
  styleToCss,
  transformToCss,
  transitionEasingCss,
} from "@/lib/style-css";
import { cleanStyle } from "@/lib/breakpoints";

const STYLE_FX = join(import.meta.dir, "../../src-tauri/src/fixtures/style");
const src = (rel: string) => readFileSync(join(import.meta.dir, "..", rel), "utf8");

function cssFromStyle(style: StyleProps): string {
  const react = styleToCss(style);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(react)) {
    if (v === undefined || v === null || v === "") continue;
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

describe("B5 STYLE_KEYS", () => {
  test("includes transform + transition (27 keys)", () => {
    expect(STYLE_KEYS.length).toBe(31);
    expect(STYLE_KEYS).toContain("transform");
    expect(STYLE_KEYS).toContain("transition");
  });
});

describe("B5 transform/transition goldens", () => {
  test.each(["transform-rotate", "transform-full", "transition-paint"] as const)("%s", (name) => {
    const style = JSON.parse(
      readFileSync(join(STYLE_FX, `${name}.json`), "utf8"),
    ) as StyleProps;
    expect(cssFromStyle(style)).toBe(readFileSync(join(STYLE_FX, `${name}.css`), "utf8"));
  });
});

describe("B5 helpers", () => {
  test("order + spring + empty cleanStyle", () => {
    expect(
      transformToCss({
        translateX: 1,
        rotate: 2,
        scale: 1,
        skewX: 3,
      }),
    ).toBe("translate(1px, 0px) rotate(2deg) scale(1) skew(3deg, 0deg)");
    expect(transitionEasingCss("spring")).toContain("cubic-bezier");
    expect(isEmptyTransform({})).toBe(true);
    expect(isEmptyTransition({})).toBe(true);
    expect(cleanStyle({ transform: {}, color: "#111" })).toEqual({ color: "#111" });
  });
});

describe("B5 effects-panels wiring", () => {
  test("T98–T108 labels + Transform/Transition subgroups", () => {
    const ep = src("components/editor/effects-panels.tsx");
    for (const t of [
      "เลื่อนแนวนอน",
      "เลื่อนแนวตั้ง",
      "ขยาย",
      "หมุน",
      "เอียงแนวนอน",
      "เอียงแนวตั้ง",
      "จุดหมุน",
      "องค์ประกอบแบบอินไลน์จะถูกส่งออกเป็นอินไลน์บล็อกเพื่อให้การแปลงทำงาน",
      "ระยะเวลา",
      "หน่วงเวลา",
      "จังหวะ",
      "เด้ง",
      "ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวจะไม่เห็นการเลื่อนย้ายและการเปลี่ยนผ่าน",
    ]) {
      expect(ep).toContain(t);
    }
    expect(ep).toContain('data-effects-panel="transform"');
    expect(ep).toContain('data-effects-panel="transition"');
    const sp = src("components/editor/StylePanel.tsx");
    expect(sp).toContain("TransformSubGroup");
    expect(sp).toContain("TransitionSubGroup");
  });
});
