/**
 * Phase 11 E4/E5: motion panel wiring + replay helpers.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOTION_PRESET_OPTIONS,
  MOTION_REPLAY,
  MOTION_REPLAY_REDUCED,
  MOTION_SECTION,
  clampMotionDuration,
  isMotionPreset,
} from "@/lib/motion";

const ROOT = join(import.meta.dir, "..", "..");

describe("E4 motion panel", () => {
  test("Thai preset labels cover six effects + none", () => {
    expect(MOTION_SECTION).toBe("การเคลื่อนไหว");
    expect(MOTION_PRESET_OPTIONS.map((o) => o.value)).toEqual([
      "none",
      "fade",
      "slideUp",
      "slideDown",
      "slideLeft",
      "slideRight",
      "scaleIn",
    ]);
    expect(isMotionPreset("fade")).toBe(true);
    expect(isMotionPreset("none")).toBe(false);
    expect(clampMotionDuration(50)).toBe(100);
    expect(clampMotionDuration(9000)).toBe(2000);
  });

  test("StylePanel lazy-loads motion-panel; DesignCanvas plays replay", () => {
    const panel = readFileSync(join(ROOT, "src/components/editor/StylePanel.tsx"), "utf8");
    expect(panel).toContain('import("@/components/editor/motion-panel")');
    expect(panel).toContain("MotionSection");
    expect(panel.includes("whenIdle(() => void MotionPanel")).toBe(false);

    const canvas = readFileSync(
      join(ROOT, "src/components/editor/DesignCanvas.tsx"),
      "utf8",
    );
    expect(canvas).toContain("playEntranceReplay");
    expect(canvas).toContain("motionReplay");

    const store = readFileSync(join(ROOT, "src/stores/editor-store.ts"), "utf8");
    expect(store).toContain("requestMotionReplay");
    expect(store).toContain("motion: true");
  });

  test("replay strings", () => {
    expect(MOTION_REPLAY).toBe("เล่นตัวอย่าง");
    expect(MOTION_REPLAY_REDUCED).toContain("ลดการเคลื่อนไหว");
  });

  test("motion panel re-evaluates page perf after writes (E6 T117)", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/motion-panel.tsx"),
      "utf8",
    );
    expect(src).toContain("evaluatePagePerf");
    expect(src).toContain('w.kind === "animated"');
  });
});
