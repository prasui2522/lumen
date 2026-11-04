// Run by a2-node-view.test.tsx in its own `bun run` process (a plain script, not a bun:test file).
// Why: other test files replace `@tauri-apps/api/core` with an `invoke`-only stub for the whole
// `bun test` run, and node-view.tsx also needs `convertFileSrc`; a separate process sees the real module.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NodeView } from "@/components/editor/node-view";
import { redirectFocusToCanvasScopeDeferred } from "@/lib/a2-looks";
import type { Node, PageDocument } from "@/schema";

declare const process: { exit(code: number): never };
const expect = (v: string) => {
  const chk = (ok: boolean, msg: string) => {
    if (!ok) throw new Error(msg);
  };
  return {
    toContain: (n: string) => chk(v.includes(n), `expected ${JSON.stringify(n)} in ${v}`),
    not: { toContain: (n: string) => chk(!v.includes(n), `unexpected ${JSON.stringify(n)} in ${v}`) },
  };
};
let failed = 0;
const describe = (_n: string, f: () => void) => f();
const test = (n: string, f: () => void) => {
  try {
    f();
    console.log("ok   " + n);
  } catch (e) {
    failed++;
    console.log("FAIL " + n + "\n" + String((e as Error).message));
  }
};

describe("A2.3 part 2: scrollArea / badge as the canvas draws them (NodeView)", () => {
  const mk = (id: string, type: string, props: object, style: object = {}, name?: string): Node =>
    ({ id, type, props: { type, ...props }, style, ...(name !== undefined ? { name } : {}) }) as unknown as Node;
  const render = (nodes: Node[], rootKids: string[], editable = true) => {
    const document = {
      version: 4,
      meta: { title: "t" },
      root: "r",
      nodes: Object.fromEntries([mk("r", "page", { children: rootKids }), ...nodes].map((n) => [n.id, n])),
    } as unknown as PageDocument;
    return renderToStaticMarkup(createElement(NodeView, { ctx: { document, editable }, nodeId: "r" }));
  };
  const txt = mk("t", "text", { content: "ข้อความ" });

  test("a named scrollArea is a region with its name; the canvas element is tabindex=-1, never a Tab stop (N1)", () => {
    const html = render([mk("s", "scrollArea", { children: ["t"], orientation: "vertical", label: "รายการ" }), txt], ["s"]);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="รายการ"');
    expect(html).toContain('data-node-type="scrollArea"');
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain('tabindex="0"');
    // the layer name is the fallback; an unnamed one has no role
    expect(render([mk("s", "scrollArea", { children: [], orientation: "vertical" }, {}, "ชื่อชั้น")], ["s"])).toContain('aria-label="ชื่อชั้น"');
    const bare = render([mk("s", "scrollArea", { children: [], orientation: "vertical" })], ["s"]);
    expect(bare).toContain('tabindex="-1"');
    expect(bare).not.toContain('role="region"');
    expect(bare).not.toContain("aria-label");
  });

  test("A2.5.1: the canvas scrollArea always has BOTH overflow longhands and never the shorthand; an explicit overflow wins", () => {
    const r = (o: string, style?: object) => render([mk("s", "scrollArea", { children: [], orientation: o }, style)], ["s"]);
    const want: [string, object | undefined, string][] = [
      ["vertical", undefined, "overflow-x:hidden;overflow-y:auto"],
      ["horizontal", undefined, "overflow-x:auto;overflow-y:hidden"],
      ["both", undefined, "overflow-x:auto;overflow-y:auto"],
      ["vertical", { overflow: "hidden" }, "overflow-x:hidden;overflow-y:hidden"],
      ["vertical", { overflow: "scroll" }, "overflow-x:hidden;overflow-y:scroll"],
    ];
    for (const [o, st, w] of want) {
      const h = r(o, st);
      expect(h).toContain(w);
      expect(h).not.toContain(";overflow:");
    }
  });

  test("a buttonGroup is role=group with its layer name; an alert is role=note (canvas parity with the export)", () => {
    const g = render([mk("g", "buttonGroup", { children: [] }, {}, "กลุ่มปุ่ม")], ["g"]);
    expect(g).toContain('role="group"');
    expect(g).toContain('aria-label="กลุ่มปุ่ม"');
    expect(g).not.toContain("tabindex");
    expect(render([mk("a", "alert", { children: [] })], ["a"])).toContain('role="note"');
  });

  test("the canvas scrollArea hands a click's focus to the canvas scope (onFocus is wired); other containers have no handler (N1)", () => {
    const document = {
      version: 4,
      meta: { title: "t" },
      root: "r",
      nodes: Object.fromEntries(
        [mk("r", "page", { children: ["s", "c"] }), mk("s", "scrollArea", { children: [], orientation: "vertical" }), mk("c", "card", { children: [] })].map((n) => [n.id, n]),
      ),
    } as unknown as PageDocument;
    const call = (nodeId: string) => ((NodeView as unknown as { type: (p: object) => { props: Record<string, unknown> } }).type)({ ctx: { document, editable: true }, nodeId });
    const s = call("s").props;
    if (s.tabIndex !== -1) throw new Error("tabIndex " + String(s.tabIndex));
    if (s.onFocus !== redirectFocusToCanvasScopeDeferred) throw new Error("onFocus is not the deferred redirect");
    const c = call("c").props;
    if (c.tabIndex !== undefined || c.onFocus !== undefined) throw new Error("card must have no tabIndex / onFocus");
  });

  test("only the scrollArea carries a tabindex on the canvas (-1); the other containers have none (N1)", () => {
    for (const [type, props] of [
      ["card", { children: [] }],
      ["alert", { children: [] }],
      ["aspectRatio", { children: [], ratio: "16/9" }],
      ["buttonGroup", { children: [] }],
    ] as const) {
      expect(render([mk("x", type, props)], ["x"])).not.toContain("tabindex");
    }
    expect(render([mk("x", "scrollArea", { children: [], orientation: "both" })], ["x"])).toContain('tabindex="-1"');
  });

  test("only an empty A2 container carries the editor min-height (children keep the automatic flex minimum, like the export)", () => {
    for (const type of ["card", "alert", "aspectRatio", "buttonGroup", "scrollArea"]) {
      const props = type === "aspectRatio" ? { children: [], ratio: "16/9" } : type === "scrollArea" ? { children: [], orientation: "vertical" } : { children: [] };
      const tag = (h: string) => (h.match(new RegExp(`<div[^>]*data-node-type="${type}"[^>]*>`)) ?? [""])[0];
      expect(tag(render([mk("c", type, props)], ["c"]))).toContain("min-h-[1rem]");
      const full = tag(render([mk("c", type, { ...props, children: ["t"] }), txt], ["c"]));
      expect(full).toContain('data-node-type="' + type + '"');
      expect(full).not.toContain("min-h-[1rem]");
    }
  });

  test("a badge and a scrollArea inside a buttonGroup take the corner slots like any other child", () => {
    const html = render(
      [
        mk("g", "buttonGroup", { children: ["b1", "bd", "s"] }),
        mk("b1", "button", { label: "ก", action: "none" }, { borderRadius: 8 }),
        mk("bd", "badge", { label: "ป้าย" }, { borderRadius: 8 }),
        mk("s", "scrollArea", { children: [], orientation: "vertical" }, { borderRadius: 8 }),
      ],
      ["g"],
    );
    expect(html).toContain("border-top-left-radius:8px");
    expect(html).toContain("border-radius:0px");
    expect(html).toContain("border-bottom-right-radius:8px");
  });
});

process.exit(failed ? 1 : 0);
