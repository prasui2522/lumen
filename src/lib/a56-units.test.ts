// PHASE-11 A5.6: batch chunk check for chart + calendar renderers (§5.1 A rows).
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const DIST = join(ROOT, "dist", "assets");

const CHART_SRC = readFileSync(join(ROOT, "src/lib/chart-render.ts"), "utf8");
const CAL_SRC = readFileSync(join(ROOT, "src/lib/calendar-render.ts"), "utf8");
const ENTRY_CANDIDATES = [
  "src/main.tsx",
  "src/App.tsx",
  "src/components/editor/EditorPage.tsx",
].map((p) => join(ROOT, p));

describe("A5.6 chunk budget", () => {
  test("chart-render + calendar-render source ≤ 8 kB gz combined", () => {
    const chartGz = gzipSync(Buffer.from(CHART_SRC), { level: 9 }).byteLength;
    const calGz = gzipSync(Buffer.from(CAL_SRC), { level: 9 }).byteLength;
    expect(chartGz + calGz).toBeLessThanOrEqual(8 * 1024);
    expect(chartGz).toBeGreaterThan(500);
    expect(calGz).toBeGreaterThan(500);
  });

  test("renderers absent from entry static imports (no whenIdle preload)", () => {
    for (const path of ENTRY_CANDIDATES) {
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      expect(src).not.toMatch(/from ["']@\/lib\/chart-render["']/);
      expect(src).not.toMatch(/from ["']@\/lib\/calendar-render["']/);
      expect(src).not.toMatch(/from ["']@\/components\/editor\/chart-render["']/);
      expect(src).not.toMatch(/from ["']@\/components\/editor\/calendar-render["']/);
    }
    const panel = readFileSync(join(ROOT, "src/components/editor/StylePanel.tsx"), "utf8");
    expect(panel).toContain('import("@/components/editor/chart-render")');
    expect(panel).toContain('import("@/components/editor/calendar-render")');
    expect(panel.includes("whenIdle(() => void ChartRender")).toBe(false);
    expect(panel.includes("whenIdle(() => void CalendarRender")).toBe(false);
  });

  test("dist chunks exist and stay under 8 kB gz (if build present)", () => {
    if (!existsSync(DIST)) return;
    const files = readdirSync(DIST);
    const chart = files.find((f) => f.startsWith("chart-render-") && f.endsWith(".js"));
    const cal = files.find((f) => f.startsWith("calendar-render-") && f.endsWith(".js"));
    expect(chart, "chart-render chunk missing — run bun run build").toBeTruthy();
    expect(cal, "calendar-render chunk missing — run bun run build").toBeTruthy();
    const chartGz = gzipSync(readFileSync(join(DIST, chart!)), { level: 9 }).byteLength;
    const calGz = gzipSync(readFileSync(join(DIST, cal!)), { level: 9 }).byteLength;
    expect(chartGz + calGz).toBeLessThanOrEqual(8 * 1024);
    // Entry index should not embed renderer bodies.
    const index = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    if (index) {
      const entry = readFileSync(join(DIST, index), "utf8");
      expect(entry).not.toContain("renderChartSvg");
      expect(entry).not.toContain("renderCalendarHtml");
    }
  });
});
