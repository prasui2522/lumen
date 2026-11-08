/**
 * Phase 11 C8: presets registry + picker chunk budgets (§5.1 / §9.C).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const DIST = join(ROOT, "dist", "assets");

describe("C8 preset chunk budgets", () => {
  test("StylePanel lazy-loads picker; no whenIdle preload", () => {
    const panel = readFileSync(join(ROOT, "src/components/editor/StylePanel.tsx"), "utf8");
    expect(panel).toContain('import("@/components/editor/preset-picker")');
    expect(panel.includes("whenIdle(() => void PresetPicker")).toBe(false);
  });

  test("dist chunks within budget (if build present)", () => {
    if (!existsSync(DIST)) return;
    const files = readdirSync(DIST);
    const registry = files.find((f) => f.startsWith("presets-registry-") && f.endsWith(".js"));
    const picker = files.find((f) => f.startsWith("preset-picker-") && f.endsWith(".js"));
    expect(registry, "presets-registry chunk missing").toBeTruthy();
    expect(picker, "preset-picker chunk missing").toBeTruthy();
    const regGz = gzipSync(readFileSync(join(DIST, registry!)), { level: 9 }).byteLength;
    const pickGz = gzipSync(readFileSync(join(DIST, picker!)), { level: 9 }).byteLength;
    expect(regGz).toBeLessThanOrEqual(6 * 1024);
    expect(pickGz).toBeLessThanOrEqual(3 * 1024);
    const index = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    if (index) {
      const entry = readFileSync(join(DIST, index), "utf8");
      expect(entry).not.toContain("button-3d");
      expect(entry).not.toContain("loadBuiltInPresets");
    }
  });
});
