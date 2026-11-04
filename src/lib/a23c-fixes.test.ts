import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  a2Section,
  breakpointRadiusDecls,
  effectiveBpRadius,
  groupSlots,
  isAspectRatio,
  redirectFocusToCanvasScopeDeferred,
  ratioCss,
} from "@/lib/a2-looks";
import { A2_LOOKS } from "@/lib/a2-looks";
import { ASPECT_RATIOS, type Node } from "@/schema";
import looks from "@/lib/kind-looks.json";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const fx = (n: string) => read(`src-tauri/src/fixtures/a2/${n}`);

describe("F1: breakpoint borderRadius on a buttonGroup child keeps the corner table", () => {
  const doc = JSON.parse(fx("a23-bp-corners.json")) as { nodes: Record<string, Node & { styleBreakpoints?: never }> };
  const css = fx("a23-bp-corners.css");
  const blocks = {
    tablet: css.match(/@media \(max-width:1024px\)\{(.*?)\}\}/s)![1] + "}",
    phone: css.match(/@media \(max-width:719px\)\{(.*?)\}\}/s)![1] + "}",
    foldOpen: css.match(/@media \(horizontal-viewport-segments: 2\)\{(.*?)\}\}/s)![1] + "}",
  };
  // The compiler hands out n1.. in render order, only to nodes whose style differs from the defaults:
  // g1, g3 and g4 are plain groups (no class); g2 has `flex-direction:column`.
  const classed = ["b1", "b2", "b3", "g2", "c1", "c2", "c3", "d1", "d2", "d3", "e1"];
  const klass = new Map<string, string>(classed.map((id, i) => [id, `n${i + 1}`]));
  test("the class map matches the golden html", () => {
    const html = fx("a23-bp-corners.html");
    for (const id of ["g1", "g3", "g4"]) expect(html).toContain(`aria-label="${(doc.nodes[id] as Node).name}"`);
    expect(css).toContain(".n11{border-radius:20px}");
    expect(css).toContain(".n4{flex-direction:column}");
  });

  const slotsOf = (group: string, dir: "row" | "column") => {
    const g = doc.nodes[group] as Node;
    const kids = (g.props as { children: string[] }).children;
    return groupSlots(doc.nodes as Record<string, Node>, kids, dir);
  };
  const slots = { ...slotsOf("g1", "row"), ...slotsOf("g2", "column"), ...slotsOf("g3", "row"), ...slotsOf("g4", "row") };

  for (const view of ["tablet", "phone", "foldOpen"] as const) {
    test(`TS declarations equal every grouped child's ${view} rule in the golden`, () => {
      let checked = 0;
      for (const [id, k] of klass) {
        const n = doc.nodes[id] as Node & { styleBreakpoints?: Record<string, { borderRadius?: number }> };
        const bp = n.styleBreakpoints;
        const decls = breakpointRadiusDecls(slots[id], bp?.[view]?.borderRadius);
        const rule = new RegExp(`\\.${k}\\{([^}]*)\\}`).exec(blocks[view]);
        if (!bp?.[view]?.borderRadius && bp?.[view]?.borderRadius !== 0) {
          expect(decls).toBeUndefined();
          continue;
        }
        expect(rule).not.toBeNull();
        expect(decls!.map(([p, v]) => `${p}:${v}`).join(";")).toBe(rule![1]!);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  test("the spec cases: middle child 0px, first/last flat inner corners, singles shorthand only", () => {
    expect(breakpointRadiusDecls("g:row:middle", 20)).toEqual([["border-radius", "0px"]]);
    expect(breakpointRadiusDecls("g:row:first", 20)).toEqual([
      ["border-radius", "20px"],
      ["border-top-left-radius", "20px"],
      ["border-top-right-radius", "0px"],
      ["border-bottom-right-radius", "0px"],
      ["border-bottom-left-radius", "20px"],
    ]);
    expect(breakpointRadiusDecls("g:column:last", 12)!.slice(1)).toEqual([
      ["border-top-left-radius", "0px"],
      ["border-top-right-radius", "0px"],
      ["border-bottom-right-radius", "12px"],
      ["border-bottom-left-radius", "12px"],
    ]);
    expect(breakpointRadiusDecls(undefined, 20)).toEqual([["border-radius", "20px"]]);
    expect(breakpointRadiusDecls("g:row:last", 0)).toEqual([["border-radius", "0px"]]);
    expect(breakpointRadiusDecls("g:row:first", undefined)).toBeUndefined();
  });

  test("effective breakpoint radius follows the cascade", () => {
    const bp = { tablet: { borderRadius: 20 }, phone: { borderRadius: 4 } };
    expect(effectiveBpRadius(8, bp, "tablet")).toBe(20);
    expect(effectiveBpRadius(8, bp, "phone")).toBe(4);
    expect(effectiveBpRadius(8, { tablet: { borderRadius: 20 } }, "phone")).toBe(20);
    expect(effectiveBpRadius(8, undefined, "phone")).toBe(8);
    expect(effectiveBpRadius(8, { phone: { borderRadius: 4 } }, "foldOpen")).toBe(8);
  });
});

describe("F7: the aspect ratio set is the spec's five, rejected exactly as Rust rejects", () => {
  test("ASPECT_RATIOS equals the Rust AspectRatioValue variants", () => {
    const rs = read("src-tauri/src/defaults.rs");
    const body = /pub enum AspectRatioValue \{([\s\S]*?)\n\}/.exec(rs)![1]!;
    const rust = [...body.matchAll(/serde\(rename = "([^"]+)"\)/g)].map((m) => m[1]);
    expect([...ASPECT_RATIOS]).toEqual(rust);
    expect(rust).toEqual(["16/9", "4/3", "1/1", "3/2", "21/9"]);
  });
  test("isAspectRatio / ratioCss refuse everything else (incl. 9/16, other spellings, non-strings)", () => {
    for (const ok of ASPECT_RATIOS) {
      expect(isAspectRatio(ok)).toBe(true);
      expect(() => ratioCss(ok)).not.toThrow();
    }
    for (const bad of ["9/16", "16:9", "16 / 9", "", " 4/3", "2/1", "16/9;}x{y:z", null, undefined, 3, {}]) {
      expect(isAspectRatio(bad)).toBe(false);
      expect(() => ratioCss(bad as string)).toThrow(RangeError);
    }
    expect(ratioCss("16/9")).toBe("16 / 9");
  });
});

describe("F9: a missing / malformed a2 section of kind-looks.json is a hard error", () => {
  const ok = JSON.parse(JSON.stringify(looks));
  test("the real file passes and gives looks", () => {
    expect(a2Section(ok).kinds).toBeDefined();
    expect(Object.keys(A2_LOOKS).sort()).toEqual(["aspectRatio", "badge", "scrollArea", "separator", "separatorVertical", "spinner"]);
  });
  test("each missing / malformed piece throws a named error (never empty looks)", () => {
    const without = (mut: (v: Record<string, any>) => void) => {
      const v = JSON.parse(JSON.stringify(looks));
      mut(v);
      return v;
    };
    expect(() => a2Section(without((v) => delete v.a2))).toThrow("missing section `a2`");
    expect(() => a2Section(without((v) => delete v.a2.kinds))).toThrow("`a2.kinds`");
    expect(() => a2Section(without((v) => delete v.a2.texts))).toThrow("`a2.texts`");
    expect(() => a2Section(without((v) => (v.a2.kinds.badge = { extras: "x" })))).toThrow("malformed");
    expect(() => a2Section(null)).toThrow();
    expect(() => a2Section({})).toThrow();
  });
});

describe("F8: the horizontal separator shares `color:inherit` on both sides", () => {
  test("kind-looks.json holds it once and every golden with a separator type rule has it", () => {
    expect(A2_LOOKS.separator!.extras).toEqual([["color", "inherit"]]);
    for (const f of ["a23-default.css", "a23-overrides.css", "a23-hostile.css", "a23-group-mixed.css", "a23-layout-edge.css"]) {
      const css = fx(f);
      if (css.includes(".t-separator{")) expect(css).toContain(".t-separator{display:block;width:100%;height:1px;background-color:#e2e8f0;color:inherit}");
    }
  });
});

describe("N1: a click on the canvas scrollArea hands the focus to the canvas scope, deferred and guarded (F-A24-1)", () => {
  const mk = (scope: { focus: (o?: object) => void } | null) => {
    const el = { closest: (sel: string) => (sel === '[data-kbd-scope="canvas"]' ? scope : null) };
    return { target: el as unknown, currentTarget: el };
  };
  // a controllable environment: `run()` plays the deferred callback, `active` is what document.activeElement says
  const env = () => {
    const q: (() => void)[] = [];
    const delays: number[] = [];
    let active: unknown = null;
    return {
      q,
      delays,
      run: () => q.splice(0).forEach((f) => f()),
      setActive: (a: unknown) => (active = a),
      env: { defer: (f: () => void, ms: number) => void (q.push(f), delays.push(ms)), active: () => active },
    };
  };
  test("nothing moves inside the focus event; the scope is focused later (preventScroll) while the scrollArea still holds focus", () => {
    const calls: unknown[] = [];
    const e = mk({ focus: (o?: object) => calls.push(o) });
    const t = env();
    t.setActive(e.currentTarget);
    expect(redirectFocusToCanvasScopeDeferred(e, t.env)).toBe(true);
    expect(calls).toEqual([]); // synchronous focus() inside the mousedown's focus event cancels the drag
    expect(t.q.length).toBe(1);
    t.run();
    expect(calls).toEqual([{ preventScroll: true }]);
  });
  test("the hand-back is requested for the very next macrotask: a delay of 0 ms, not 60 (Designer B9)", () => {
    const e = mk({ focus: () => {} });
    const t = env();
    t.setActive(e.currentTarget);
    redirectFocusToCanvasScopeDeferred(e, t.env);
    expect(t.delays).toEqual([0]); // literal on purpose: a changed FOCUS_REDIRECT_DELAY_MS must fail here
  });
  test("guard: when focus has moved on (the inline editor, a double click) the scope does not steal it", () => {
    const calls: unknown[] = [];
    const e = mk({ focus: (o?: object) => calls.push(o) });
    const t = env();
    t.setActive({ other: true });
    expect(redirectFocusToCanvasScopeDeferred(e, t.env)).toBe(true);
    t.run();
    expect(calls).toEqual([]);
  });
  test("a child's bubbling focus event is ignored; without a canvas scope (Preview, tests) nothing happens", () => {
    const calls: unknown[] = [];
    const e = mk({ focus: (o?: object) => calls.push(o) });
    const t = env();
    expect(redirectFocusToCanvasScopeDeferred({ target: {}, currentTarget: e.currentTarget }, t.env)).toBe(false);
    expect(t.q.length).toBe(0);
    const bare = mk(null);
    t.setActive(bare.currentTarget);
    expect(redirectFocusToCanvasScopeDeferred(bare, t.env)).toBe(true);
    t.run();
    expect(calls).toEqual([]);
  });
});

describe("N3: the scrollArea focus ring comes from the shared looks file", () => {
  const ring = ".t-scrollArea:focus-visible{outline:2px solid #0077c2;outline-offset:2px}";
  test("kind-looks.json holds the rule once (literal hex); every golden with a scrollArea has it exactly once, others never", () => {
    expect(A2_LOOKS.scrollArea.css).toBe(ring);
    expect(A2_LOOKS.scrollArea.extras).toEqual([]);
    expect(read("src/lib/kind-looks.json").split(".t-scrollArea:focus-visible").length - 1).toBe(1);
    let withArea = 0;
    for (const f of (require("node:fs") as typeof import("node:fs")).readdirSync(join(ROOT, "src-tauri/src/fixtures/a2")).filter((n) => n.endsWith(".css"))) {
      const css = fx(f);
      const n = css.split(ring).length - 1;
      expect(n).toBe(css.includes(".t-scrollArea{") ? 1 : 0);
      withArea += n;
    }
    expect(withArea).toBe(11); // 4 a23b + 3 a23 + 3 a24 + 1 a25 goldens
  });
  test("the canvas never draws the ring (the element is tabindex=-1 and its click focus goes to the scope)", () => {
    expect(read("src/components/editor/node-view.tsx")).not.toContain("focus-visible");
  });
});
