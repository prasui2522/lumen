// PHASE-11 A5.3: chart kind — schema mirror, createNode, palette, SVG goldens + canvas.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node, PageDocument } from "@/schema";
import {
  A5_TYPES,
  CHART_KINDS,
  CHART_MAX_CATEGORIES,
  CHART_MAX_SERIES,
  DEFAULT_STYLES,
  isA5Type,
  isVersion4Kind,
} from "@/schema";
import {
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  createNode,
  insertNode,
} from "@/lib/document-ops";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { documentForSave } from "@/lib/breakpoints";
import {
  renderChartSvg,
  type ChartModel,
} from "@/lib/chart-render";
import { ChartGlyph } from "@/components/editor/chart-render";

const RS = join(import.meta.dir, "..", "..", "src-tauri", "src");
const DEFAULTS_RS = readFileSync(join(RS, "defaults.rs"), "utf8");
const FIX = join(RS, "fixtures", "a5");

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a53", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};
const ch = (): Node => ({ ...createNode("chart"), id: "c" });

describe("A5.3 schema mirror", () => {
  test("A5_TYPES includes chart; version-4 marker", () => {
    const body = DEFAULTS_RS.slice(DEFAULTS_RS.indexOf("pub fn is_a5_kind(t: NodeType) -> bool {"));
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::Chart");
    expect([...A5_TYPES]).toEqual(["carousel", "chart", "calendar"]);
    expect(isA5Type("chart") && isVersion4Kind("chart")).toBe(true);
    expect(documentForSave(doc1(ch())).version).toBe(4);
  });

  test("DEFAULT_STYLES.chart + caps + kinds", () => {
    expect(DEFAULT_STYLES.chart).toEqual({
      display: "block",
      width: "100%",
      margin: 0,
      padding: 0,
    });
    expect([...CHART_KINDS]).toEqual(["bar", "line", "area"]);
    expect(CHART_MAX_CATEGORIES).toBe(12);
    expect(CHART_MAX_SERIES).toBe(3);
  });

  test("createNode + palette Data", () => {
    const n = createNode("chart");
    expect(n.props).toEqual({
      type: "chart",
      kind: "bar",
      categories: ["A", "B", "C"],
      series: [{ name: "ชุดที่ 1", values: [3, 5, 2], color: "#2563eb" }],
      caption: "กราฟตัวอย่าง",
    });
    expect(NODE_TYPE_LABEL.chart).toBe("Chart");
    expect(PALETTE_TYPES.includes("chart")).toBe(true);
    expect(PALETTE_META.chart.group).toBe("Data");
    expect(filterPaletteGroups("กราฟ").some((g) => g.types.includes("chart"))).toBe(true);
  });
});

describe("A5.3 SVG goldens (parity with Rust)", () => {
  test.each(["a53-bar", "a53-line", "a53-area"] as const)("%s", (name) => {
    const model = JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8")) as ChartModel;
    const svg = renderChartSvg(model);
    expect(svg).toBe(readFileSync(join(FIX, `${name}.svg`), "utf8"));
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title>");
    expect(svg).toContain("<desc>");
  });

  test("null / NaN values skip safely", () => {
    const svg = renderChartSvg({
      kind: "bar",
      categories: ["A", "B"],
      series: [{ name: "S", values: [3, null], color: "#2563eb" }],
      caption: "t",
    });
    expect(svg.match(/<rect /g)?.length ?? 0).toBe(1);
    expect(svg).toContain("S A: 3");
    expect(svg).not.toContain("S B:");

    const line = renderChartSvg({
      kind: "line",
      categories: ["A", "B", "C"],
      series: [{ name: "L", values: [1, null, 3], color: "#16a34a" }],
    });
    expect(line.match(/<circle /g)?.length ?? 0).toBe(2);
    expect(line).not.toContain("<polyline ");
  });
});

describe("A5.3 canvas glyph", () => {
  test("ChartGlyph SSR matches renderChartSvg", () => {
    const model: ChartModel = {
      kind: "bar",
      categories: ["A", "B", "C"],
      series: [{ name: "ชุดที่ 1", values: [3, 5, 2], color: "#2563eb" }],
      caption: "ยอดขาย",
    };
    const html = renderToStaticMarkup(createElement(ChartGlyph, { model }));
    expect(html).toContain("t-chart");
    expect(html).toContain(renderChartSvg(model));
  });
});
