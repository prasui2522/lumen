import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BOX_SHADOW_MAX_MSG,
  DEFAULT_SHADOW_LAYER,
  MAX_BOX_SHADOW_LAYERS,
  addShadowLayer,
  canAddShadowLayer,
  focusIndexAfterRemove,
  moveShadowLayer,
  patchShadowLayer,
  removeShadowLayer,
} from "@/lib/box-shadow-ops";
import type { BoxShadowLayer } from "@/schema";

const src = (rel: string) => readFileSync(join(import.meta.dir, "..", rel), "utf8");

describe("B2.2 box-shadow-ops", () => {
  test("max 6 layers; 7th refused", () => {
    expect(MAX_BOX_SHADOW_LAYERS).toBe(6);
    expect(BOX_SHADOW_MAX_MSG).toBe("ใช้เงาได้สูงสุด 6 ชั้น");
    let layers: BoxShadowLayer[] = [];
    for (let i = 0; i < 6; i++) {
      const next = addShadowLayer(layers);
      expect(next).not.toBeNull();
      layers = next!;
    }
    expect(layers).toHaveLength(6);
    expect(canAddShadowLayer(layers)).toBe(false);
    expect(addShadowLayer(layers)).toBeNull();
    expect(layers[0]).toEqual(DEFAULT_SHADOW_LAYER);
  });

  test("remove + focus neighbour", () => {
    const layers: BoxShadowLayer[] = [
      { y: 1 },
      { y: 2 },
      { y: 3 },
    ];
    expect(removeShadowLayer(layers, 1)).toEqual([{ y: 1 }, { y: 3 }]);
    expect(focusIndexAfterRemove(3, 1)).toBe(1); // next slid into slot
    expect(focusIndexAfterRemove(3, 2)).toBe(1); // last → previous
    expect(focusIndexAfterRemove(1, 0)).toBe(-1);
  });

  test("up/down swap; patch colour", () => {
    const layers: BoxShadowLayer[] = [{ y: 1 }, { y: 2 }, { y: 3 }];
    expect(moveShadowLayer(layers, 1, -1).map((l) => l.y)).toEqual([2, 1, 3]);
    expect(moveShadowLayer(layers, 0, -1).map((l) => l.y)).toEqual([1, 2, 3]);
    expect(patchShadowLayer(layers, 0, { color: "#ff000080" })[0]!.color).toBe("#ff000080");
  });
});

describe("B2.2 StylePanel + lazy effects-panels wiring", () => {
  test("StylePanel lazyNamed imports effects-panels (no whenIdle)", () => {
    const sp = src("components/editor/StylePanel.tsx");
    expect(sp).toContain('import("@/components/editor/effects-panels")');
    expect(sp).toContain("ShadowSubGroup");
    expect(sp).toContain("EffectsSection");
    expect(sp).toContain("เอฟเฟกต์");
    // whenIdle must not preload effects (keep out of initial JS)
    const idleBlock = sp.match(/whenIdle\([\s\S]*?\);/g) ?? [];
    for (const block of idleBlock) {
      expect(block).not.toContain("effects-panels");
    }
  });

  test("effects-panels exposes T70–T79 labels and Thai max message", () => {
    const ep = src("components/editor/effects-panels.tsx");
    for (const t of [
      "เพิ่มเงา",
      "ลบเงา",
      "เงาชั้นที่",
      "แนวนอน",
      "แนวตั้ง",
      "เบลอ",
      "กระจาย",
      "เงาด้านใน",
      "เลื่อนชั้นขึ้น",
      "เลื่อนชั้นลง",
    ]) {
      expect(ep).toContain(t);
    }
    expect(ep).toContain("BOX_SHADOW_MAX_MSG");
    expect(ep).toContain('data-effects-panel="shadow"');
  });

  test("effects-panels is its own file (chunk anchor)", () => {
    expect(src("components/editor/effects-panels.tsx").length).toBeGreaterThan(500);
  });
});
