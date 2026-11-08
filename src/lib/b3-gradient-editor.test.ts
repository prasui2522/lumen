/**
 * B3.2 (§9.B): gradient editor ops + effects-panels / StylePanel wiring (T80–T89).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  DEFAULT_GRADIENT,
  GRADIENT_EXCLUSIVE_MSG,
  activeGradientMode,
  activeGradientValue,
  addGradientStop,
  canAddGradientStop,
  focusStopIndexAfterRemove,
  normalizeGradient,
  patchGradient,
  patchGradientStop,
  removeGradientStop,
} from "@/lib/gradient-ops";
import { GRADIENT_MAX_STOPS, GRADIENT_MIN_STOPS, type GradientStop } from "@/schema";

const src = (rel: string) => readFileSync(join(import.meta.dir, "..", rel), "utf8");

describe("B3.2 gradient-ops", () => {
  test("2–8 stops; refuse below min / above max", () => {
    expect(GRADIENT_MIN_STOPS).toBe(2);
    expect(GRADIENT_MAX_STOPS).toBe(8);
    let stops: GradientStop[] = [
      { color: "#000", at: 0 },
      { color: "#fff", at: 100 },
    ];
    expect(removeGradientStop(stops, 0)).toEqual(stops);
    for (let i = 0; i < 6; i++) {
      const next = addGradientStop(stops);
      expect(next).not.toBeNull();
      stops = next!;
    }
    expect(stops).toHaveLength(8);
    expect(canAddGradientStop(stops)).toBe(false);
    expect(addGradientStop(stops)).toBeNull();
  });

  test("remove + focus neighbour; patch colour/at", () => {
    const stops: GradientStop[] = [
      { color: "#000", at: 0 },
      { color: "#888", at: 50 },
      { color: "#fff", at: 100 },
    ];
    expect(removeGradientStop(stops, 1)).toEqual([
      { color: "#000", at: 0 },
      { color: "#fff", at: 100 },
    ]);
    expect(focusStopIndexAfterRemove(3, 1)).toBe(1);
    expect(focusStopIndexAfterRemove(3, 2)).toBe(1);
    expect(patchGradientStop(stops, 1, { color: "#0ea5e9", at: 40 })[1]).toEqual({
      color: "#0ea5e9",
      at: 40,
    });
  });

  test("active mode: background wins; normalize drops <2 stops", () => {
    const bg = DEFAULT_GRADIENT;
    const text = { kind: "linear" as const, stops: [{ color: "#f00", at: 0 }, { color: "#0f0", at: 100 }] };
    expect(activeGradientMode(bg, text)).toBe("background");
    expect(activeGradientValue(bg, text)).toBe(bg);
    expect(activeGradientMode(undefined, text)).toBe("text");
    expect(activeGradientMode(undefined, undefined)).toBe("none");
    expect(normalizeGradient({ kind: "linear", stops: [{ color: "#000", at: 0 }] })).toBeUndefined();
    expect(patchGradient(undefined, { kind: "radial" }).kind).toBe("radial");
  });

  test("T80 message string", () => {
    expect(GRADIENT_EXCLUSIVE_MSG).toBe(
      "ใช้ได้อย่างใดอย่างหนึ่ง: ไล่สีพื้นหลังหรือไล่สีตัวอักษร",
    );
  });
});

describe("B3.2 StylePanel + effects-panels wiring", () => {
  test("StylePanel lazyNamed imports GradientSubGroup from effects-panels", () => {
    const sp = src("components/editor/StylePanel.tsx");
    expect(sp).toContain('import("@/components/editor/effects-panels")');
    expect(sp).toContain("GradientSubGroup");
    expect(sp).toContain("EffectsSection");
    const idleBlock = sp.match(/whenIdle\([\s\S]*?\);/g) ?? [];
    for (const block of idleBlock) {
      expect(block).not.toContain("effects-panels");
    }
  });

  test("effects-panels exposes T80–T89 labels and preview bar", () => {
    const ep = src("components/editor/effects-panels.tsx");
    for (const t of [
      "GRADIENT_EXCLUSIVE_MSG",
      "เส้นตรง",
      "วงกลม",
      "กรวย",
      "มุม",
      "จุดสี",
      "เพิ่มจุดสี",
      "ลบจุดสี",
      "ตำแหน่ง",
      "ไล่สีที่ตัวอักษร",
    ]) {
      expect(ep).toContain(t);
    }
    expect(ep).toContain('data-effects-panel="gradient"');
    expect(ep).toContain("data-gradient-preview");
    expect(ep).toContain("backgroundImage");
    expect(ep).not.toContain("<canvas");
  });
});
