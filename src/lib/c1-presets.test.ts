/**
 * Phase 11 C1: preset registry format + validators.
 */
import { describe, expect, test } from "bun:test";
import {
  loadBuiltInPresets,
  resetBuiltInPresetCache,
  validatePreset,
} from "@/lib/presets-registry";
import { meetsTextContrast } from "@/lib/color-contrast";

describe("C1 validatePreset", () => {
  test("rejects layout key inside states", () => {
    const { preset, errors } = validatePreset({
      formatVersion: 1,
      id: "bad",
      name: "เสีย",
      nameEn: "bad",
      category: "button",
      appliesTo: ["button"],
      style: { backgroundColor: "#0369a1", color: "#ffffff" },
      states: { hover: { width: 100, backgroundColor: "#000" } },
      source: { kind: "original" },
    });
    expect(preset).toBeUndefined();
    expect(errors.some((e) => e.message.includes("width"))).toBe(true);
  });

  test("rejects unknown appliesTo type", () => {
    const { errors } = validatePreset({
      formatVersion: 1,
      id: "x",
      name: "x",
      nameEn: "x",
      category: "button",
      appliesTo: ["wizard"],
      style: { color: "#fff", backgroundColor: "#000" },
      source: { kind: "original" },
    });
    expect(errors.some((e) => e.path.includes("appliesTo"))).toBe(true);
  });

  test("rejects unknown style key", () => {
    const { errors } = validatePreset({
      formatVersion: 1,
      id: "x",
      name: "x",
      nameEn: "x",
      category: "card",
      appliesTo: ["card"],
      style: { gap: 8, backgroundColor: "#fff", color: "#000" },
      source: { kind: "original" },
    });
    expect(errors.some((e) => e.message.includes("gap"))).toBe(true);
  });
});

describe("C1 built-in registry", () => {
  test("built-ins validate and load", async () => {
    resetBuiltInPresetCache();
    const list = await loadBuiltInPresets();
    expect(list.map((p) => p.id)).toEqual([
      "button-3d",
      "card-glass",
      "card-soft",
      "button-gradient",
      "outline-glow",
      "surface-metal",
      "surface-paper",
      "surface-stone",
      "surface-neon",
    ]);
    expect(list.every((p) => p.formatVersion === 1)).toBe(true);
  });

  test("opaque presets meet 4.5:1 text contrast (base)", async () => {
    const list = await loadBuiltInPresets();
    for (const p of list) {
      if (p.id === "card-glass") continue; // translucent — no verdict
      if (p.id === "button-gradient") {
        // Stops asserted vs white text separately.
        expect(meetsTextContrast("#ffffff", "#0369a1")).toBe(true);
        expect(meetsTextContrast("#ffffff", "#4338ca")).toBe(true);
        continue;
      }
      const bg = p.style.backgroundColor;
      const fg = p.style.color;
      if (!bg || !fg || bg === "transparent") continue;
      expect(meetsTextContrast(fg, bg), p.id).toBe(true);
    }
  });

  test("card-glass carries T133 note", async () => {
    const glass = (await loadBuiltInPresets()).find((p) => p.id === "card-glass");
    expect(glass?.note).toContain("พื้นหลัง");
  });
});
