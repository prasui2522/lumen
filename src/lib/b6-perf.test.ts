/**
 * B6.2 (§5.3 / §9.B): per-page perf warnings T115–T117.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import type { Node, PageDocument } from "@/schema";
import {
  MAX_ANIMATED_NODES,
  MAX_BLUR_EFFECTS,
  MAX_NODE_SHADOW_BLUR,
  MAX_SHADOW_BLUR_SUM,
  countPagePerf,
  formatAnimatedWarning,
  formatBlurWarning,
  formatShadowWarning,
  toolbarPerfStatus,
  warningsFromStats,
} from "@/lib/page-perf";
import { evaluatePagePerf, resetPagePerfAnnounced } from "@/lib/page-perf-watch";
import { useEditorStore } from "@/stores/editor-store";

const src = (rel: string) => readFileSync(join(import.meta.dir, "..", rel), "utf8");

function node(
  id: string,
  style: Node["style"],
  extra?: Partial<Node>,
): Node {
  return {
    id,
    type: "container",
    name: id,
    props: { type: "container" },
    style,
    ...extra,
  } as Node;
}

function doc(nodes: Record<string, Node>): PageDocument {
  return {
    version: 1,
    meta: { title: "t" },
    root: "page",
    nodes: {
      page: {
        id: "page",
        type: "page",
        props: { type: "page" },
        style: {},
      } as Node,
      ...nodes,
    },
  };
}

describe("B6.2 page-perf counters", () => {
  test("blur: backdrop + filter.blur count once per node; warn above 6", () => {
    const nodes: Record<string, Node> = {};
    for (let i = 0; i < 7; i++) {
      nodes[`n${i}`] = node(`n${i}`, {
        backdropFilter: { blur: 8 },
      });
    }
    const stats = countPagePerf(nodes);
    expect(stats.blurEffects).toBe(7);
    expect(MAX_BLUR_EFFECTS).toBe(6);
    const w = warningsFromStats(stats);
    expect(w.some((x) => x.kind === "blur")).toBe(true);
    expect(w.find((x) => x.kind === "blur")!.message).toBe(formatBlurWarning(7, 6));
    expect(toolbarPerfStatus(stats)).toBe("เบลอ 7/6");
  });

  test("filter.blur alone counts; zero blur does not", () => {
    const stats = countPagePerf({
      a: node("a", { filter: { blur: 4 } }),
      b: node("b", { filter: { brightness: 110 } }),
      c: node("c", { backdropFilter: { saturate: 120 } }),
    });
    expect(stats.blurEffects).toBe(1);
    expect(warningsFromStats(stats)).toEqual([]);
  });

  test("shadow: sum > 1200 or single blur > 100 → T116", () => {
    expect(MAX_SHADOW_BLUR_SUM).toBe(1200);
    expect(MAX_NODE_SHADOW_BLUR).toBe(100);
    const heavy = countPagePerf({
      a: node("a", {
        boxShadow: [{ blur: 101, color: "#000" }],
      }),
    });
    expect(heavy.maxNodeShadowBlur).toBe(101);
    expect(warningsFromStats(heavy).some((w) => w.kind === "shadow")).toBe(true);
    expect(formatShadowWarning()).toBe(
      "เงาในหน้านี้ใหญ่และซ้อนกันมาก อาจทำให้เครื่องช้าลง",
    );

    const layers = Array.from({ length: 6 }, () => ({
      blur: 201,
      color: "#000",
    }));
    // 6 * 201 = 1206 > 1200
    const sum = countPagePerf({
      a: node("a", { boxShadow: layers }),
    });
    expect(sum.shadowBlurSum).toBeGreaterThan(MAX_SHADOW_BLUR_SUM);
    expect(warningsFromStats(sum).some((w) => w.kind === "shadow")).toBe(true);
  });

  test("animated: motion.entrance > 30 → T117", () => {
    expect(MAX_ANIMATED_NODES).toBe(30);
    const nodes: Record<string, Node> = {};
    for (let i = 0; i < 31; i++) {
      nodes[`n${i}`] = node(
        `n${i}`,
        {},
        { motion: { entrance: { preset: "fade" } } } as Partial<Node>,
      );
    }
    const stats = countPagePerf(nodes);
    expect(stats.animated).toBe(31);
    expect(warningsFromStats(stats)[0]!.message).toBe(formatAnimatedWarning(31, 30));
  });
});

describe("B6.2 announce-once + wiring", () => {
  let prevRaf: typeof globalThis.requestAnimationFrame | undefined;
  beforeEach(() => {
    // A2: always a synchronous rAF here. Other test files install `setTimeout`-based ones on the shared
    // global (`??=`), which made announce() land after the assertion under the full suite.
    prevRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };
    resetPagePerfAnnounced();
    useEditorStore.setState({
      announcement: "",
      pagePerfStats: null,
      pagePerfWarnings: [],
      pagePerfToolbar: null,
    });
  });

  afterEach(() => {
    if (prevRaf) globalThis.requestAnimationFrame = prevRaf;
    else delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    resetPagePerfAnnounced();
  });

  test("7th backdrop blur announces T115 once; second eval is quiet", () => {
    const nodes: Record<string, Node> = {};
    for (let i = 0; i < 7; i++) {
      nodes[`n${i}`] = node(`n${i}`, { backdropFilter: { blur: 8 } });
    }
    const d = doc(nodes);
    const msg = formatBlurWarning(7, 6);
    evaluatePagePerf(d);
    expect(useEditorStore.getState().announcement).toBe(msg);
    expect(useEditorStore.getState().pagePerfToolbar).toBe("เบลอ 7/6");
    useEditorStore.setState({ announcement: "" });
    evaluatePagePerf(d);
    expect(useEditorStore.getState().announcement).toBe("");
  });

  test("write.ts + EditorPage + DeviceToolbar + FilterEditor wire heavy keys", () => {
    const write = src("components/editor/style/write.ts");
    expect(write).toContain("evaluatePagePerfIfHeavy");
    expect(write).toContain("heavyStyleKeys");
    expect(src("pages/EditorPage.tsx")).toContain("evaluatePagePerf");
    expect(src("components/editor/preview/DeviceToolbar.tsx")).toContain("data-page-perf-toolbar");
    expect(src("components/editor/effects-panels.tsx")).toContain('data-perf-warn="blur"');
    expect(src("components/editor/effects-panels.tsx")).toContain("pagePerfWarnings");
  });
});
