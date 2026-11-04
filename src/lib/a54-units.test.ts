// PHASE-11 A5.4: chart editor commit — one undo step; caps; keyboard model.
import { describe, expect, test } from "bun:test";
import type { Node, PageDocument } from "@/schema";
import { createNode, insertNode, setChartEditorCommit } from "@/lib/document-ops";
import { normalizeChartModel, parseChartValue } from "@/lib/chart-model";

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a54", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};

describe("A5.4 chart editor commit", () => {
  test("parseChartValue skips blank / NaN", () => {
    expect(parseChartValue("")).toBeNull();
    expect(parseChartValue("  ")).toBeNull();
    expect(parseChartValue("abc")).toBeNull();
    expect(parseChartValue("3.5")).toBe(3.5);
  });

  test("setChartEditorCommit is one document write; noop when equal", () => {
    const n = { ...createNode("chart"), id: "c" };
    const d = doc1(n);
    const next = setChartEditorCommit(d, "c", {
      kind: "line",
      categories: ["X", "Y"],
      series: [
        { name: "A", values: [1, null], color: "#16a34a" },
        { name: "B", values: [2, 4], color: "#ea580c" },
      ],
      caption: "แนวโน้ม",
    });
    expect(next).not.toBeNull();
    const p = next!.nodes.c!.props as {
      kind: string;
      categories: string[];
      series: { name: string; values: (number | null)[]; color: string }[];
      caption?: string;
    };
    expect(p.kind).toBe("line");
    expect(p.categories).toEqual(["X", "Y"]);
    expect(p.series).toHaveLength(2);
    expect(p.series[0]!.values).toEqual([1, null]);
    expect(p.caption).toBe("แนวโน้ม");
    expect(
      setChartEditorCommit(next!, "c", {
        kind: "line",
        categories: ["X", "Y"],
        series: p.series,
        caption: "แนวโน้ม",
      }),
    ).toBeNull();
  });

  test("normalize clamps 12×3 and forces ≥1 category/series", () => {
    const cats = Array.from({ length: 15 }, (_, i) => `C${i}`);
    const series = Array.from({ length: 5 }, (_, i) => ({
      name: `S${i}`,
      values: cats.map(() => i),
      color: "not-a-color",
    }));
    const n = normalizeChartModel({
      kind: "bar",
      categories: cats,
      series,
      caption: "  ",
    });
    expect(n.categories).toHaveLength(12);
    expect(n.series).toHaveLength(3);
    expect(n.series[0]!.color).toBe("#2563eb");
    expect(n.caption).toBeUndefined();

    const empty = normalizeChartModel({
      kind: "area",
      categories: [],
      series: [],
      caption: "x",
    });
    expect(empty.categories).toEqual([""]);
    expect(empty.series).toHaveLength(1);
    expect(empty.caption).toBe("x");
  });
});
