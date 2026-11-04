import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { controlShell } from "@/components/editor/control-shell";
import { CANVAS_STYLESHEET, KIND_LOOKS, KIND_LOOKS_CSS, explicitOf, rootStyleFor, splitControlStyle } from "@/lib/kind-looks";
import { DEFAULT_STYLES } from "@/schema";
import { styleToCss } from "@/lib/style-css";

type Css = Record<string, unknown>;
const rootOf = (kind: "select" | "slider" | "progress" | "textarea", own: Parameters<typeof styleToCss>[0] = {}) =>
  rootStyleFor(
    kind,
    styleToCss({ ...DEFAULT_STYLES[kind], ...own }),
    explicitOf(styleToCss(own), own.borderColor !== undefined),
  );

describe("A1.4b: leaf controls sit in a draggable wrapper (canvas only)", () => {
  test("defaults: wrapper is a block with the box; control is block, width 100%, no margin", () => {
    for (const k of ["select", "slider", "textarea"] as const) {
      const { wrapper, control } = splitControlStyle(rootOf(k)) as { wrapper: Css; control: Css };
      expect(wrapper.display).toBe("block");
      expect(wrapper.width).toBe("100%");
      expect(wrapper.margin).toBe("0px");
      expect(control.display).toBe("block");
      expect(control.width).toBe("100%");
      expect(control.margin).toBeUndefined();
      expect(control.height).toBeUndefined();
    }
  });

  test("the control keeps its padding / border / colours (the look), the wrapper gets none of them", () => {
    const { wrapper, control } = splitControlStyle(rootOf("select")) as { wrapper: Css; control: Css };
    expect(control.padding).toBe("8px 12px 8px 12px");
    expect(control.borderRadius).toBe("8px");
    expect(control.borderStyle).toBe("solid");
    expect(control.backgroundColor).toBeDefined();
    for (const k of ["padding", "borderRadius", "borderStyle", "borderWidth", "backgroundColor", "color", "fontSize"]) {
      expect(wrapper[k]).toBeUndefined();
    }
  });

  test("style overrides: width, max-width, margin, opacity, min-height go to the wrapper; height and min-height reach the control, the wrapper has no height", () => {
    const { wrapper, control } = splitControlStyle(
      rootOf("slider", { width: 240, height: 40, minHeight: 30, maxWidth: "50%", margin: { t: 4, r: 8, b: 12, l: 16 }, opacity: 0.5 }),
    ) as { wrapper: Css; control: Css };
    expect(wrapper).toMatchObject({ width: "240px", minHeight: "30px", maxWidth: "50%", margin: "4px 8px 12px 16px", opacity: 0.5 });
    expect(wrapper.height).toBeUndefined();
    expect(control.width).toBe("100%");
    expect(control.height).toBe("40px");
    expect(control.minHeight).toBe("30px");
    expect(control.margin).toBeUndefined();
    expect(control.maxWidth).toBeUndefined();
    expect(control.opacity).toBeUndefined();
  });

  test("display: block / flex stay block, inline kinds become inline-flex, none stays none", () => {
    const d = (display: "block" | "flex" | "inline" | "inline-block" | "none") =>
      (splitControlStyle(rootOf("select", { display })).wrapper as Css).display;
    expect([d("block"), d("flex"), d("inline"), d("inline-block"), d("none")]).toEqual(["block", "block", "inline-flex", "inline-flex", "none"]);
  });

  test("the rendered wrapper carries the root (draggable, data attributes, chrome); the control is inert and untabbable", () => {
    const root = {
      "data-node-id": "n1",
      "data-node-type": "select",
      "data-cv": "",
      draggable: true,
      className: "t-select ring",
      style: {},
    } as Record<string, unknown>;
    const html = renderToStaticMarkup(
      controlShell(root as never, "ring", "select", rootOf("select"), (c) =>
        createElement("select", { ...c, value: "a", onChange: () => {} }, createElement("option", { value: "a" }, "a")),
      ) as never,
    );
    const wrapperTag = html.slice(0, html.indexOf(">") + 1);
    expect(wrapperTag.startsWith("<div")).toBe(true);
    expect(wrapperTag).toContain('data-node-id="n1"');
    expect(wrapperTag).toContain('data-node-type="select"');
    expect(wrapperTag).toContain("data-cv");
    expect(wrapperTag).toContain('draggable="true"');
    expect(wrapperTag).toContain('class="ring"');
    expect(wrapperTag).not.toContain("t-select");
    const inner = html.slice(wrapperTag.length);
    expect(inner.startsWith("<select")).toBe(true);
    expect(inner).toContain('class="t-select"');
    expect(inner).toContain('tabindex="-1"');
    // inert: every descendant of a canvas node ignores the pointer
    expect(CANVAS_STYLESHEET).toContain("[data-node-type][data-cv] *{pointer-events:none}");
  });

  test("regression guard: the canvas view never cancels mousedown on a node (that is what blocked drag)", () => {
    const src = readFileSync(new URL("./phase6b-view.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/onMouseDown/);
    expect(src).not.toMatch(/swallow/);
    // all three leaf kinds go through the wrapper
    expect(src.match(/shell\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

// ---- A1.4c: no canvas control may keep focus after a click ----
//
// Cause of the A1.4b regression: `progress` was its own canvas root with tabindex=-1. A
// tabindex of -1 still makes an element click-focusable, so a click moved focus onto the
// <progress> and the canvas shortcut gate (`isCanvasShortcutFocus`: focus must be the canvas
// scope) ignored Delete / arrows / Enter / Esc / Ctrl+Z. There is no DOM in bun, so this
// pins the structure that keeps focus on the scope: the node root a click lands on is never
// a natively focusable element, and every focusable thing inside is out of the tab order and
// inert (pointer-events:none, so it is never the click target).

const FOCUSABLE = /^(input|select|textarea|button|progress|summary|a|details|iframe|audio|video)$/;
const tagsOf = (html: string) => [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)].map((m) => ({ tag: m[1].toLowerCase(), attrs: m[2] }));

describe("A1.4c: wrapped controls never take focus (canvas shortcuts keep working)", () => {
  const rootProps = (type: string) =>
    ({ "data-node-id": "n1", "data-node-type": type, "data-cv": "", draggable: true, className: `t-${type}` }) as never;
  const kinds: Array<[string, "select" | "slider" | "progress" | "textarea", string, Record<string, unknown>]> = [
    ["select", "select", "select", { value: "a", onChange: () => {} }],
    ["slider", "slider", "input", { type: "range", value: 3, min: 0, max: 100, onChange: () => {} }],
    ["progress", "progress", "progress", { value: 40, max: 100 }],
    ["textarea", "textarea", "textarea", { readOnly: true, value: "", onChange: () => {} }],
  ];

  for (const [name, kind, el, props] of kinds) {
    test(`${name}: the click target (wrapper) is a plain div, the control inside has tabindex -1`, () => {
      const html = renderToStaticMarkup(
        controlShell(rootProps(name), undefined, name, rootOf(kind), (c) => createElement(el, { ...c, ...props })) as never,
      );
      const tags = tagsOf(html);
      expect(tags[0].tag).toBe("div");
      expect(tags[0].attrs).not.toContain("tabindex");
      expect(tags[0].attrs).toContain("data-node-id");
      let focusable = 0;
      for (const t of tags.slice(1)) {
        if (!FOCUSABLE.test(t.tag)) continue;
        focusable++;
        expect(t.attrs).toContain('tabindex="-1"');
      }
      expect(focusable).toBe(1);
    });
  }

  test("phase6b-view: no node root is a natively focusable element, every focusable tag is out of the tab order", () => {
    const src = readFileSync(new URL("./phase6b-view.tsx", import.meta.url), "utf8");
    // `<progress {...root}` (the A1.4b bug) or any focusable tag spreading the root
    expect(src).not.toMatch(/<(progress|input|select|textarea|button|summary|a)\s+\{\.\.\.root/);
    // every focusable opening tag carries tabIndex or spreads the control props (which have tabIndex -1)
    const opens = [...src.matchAll(/<(input|select|textarea|button|progress|summary|a)\b([^>]*?)(?:\/>|>)/gs)];
    expect(opens.length).toBeGreaterThanOrEqual(12);
    for (const m of opens) {
      const attrs = m[2];
      const ok = /tabIndex=\{-1\}/.test(attrs) || /\{\.\.\.c\}/.test(attrs) || /\{\.\.\.extra\}/.test(attrs);
      expect(ok, `<${m[1]} ${attrs.trim().slice(0, 60)}> is focusable without tabIndex -1`).toBe(true);
    }
    expect(src).toMatch(/case "progress":[\s\S]*?shell\(/);
    // the labelled textarea passes tabIndex -1 through `area(...)`
    expect(src).toMatch(/area\(\{ className: "t-textarea", style: rootStyle, tabIndex: -1 \}\)/);
  });

  test("the canvas scope is the focusable ancestor the click falls back to, and the gate accepts only it", () => {
    const src = readFileSync(new URL("./DesignCanvas.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/data-kbd-scope="canvas"\s+tabIndex=\{0\}/);
    expect(src).toMatch(/a\.dataset\.kbdScope === "canvas"/);
    // the Phase 6b canvas views must not add focus handling (node-view's InlineEditor legitimately focuses)
    for (const f of ["phase6b-view.tsx", "control-shell.tsx"]) {
      const t = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
      expect(/\.focus\(|autoFocus/.test(t), `${f} handles focus`).toBe(false);
    }
  });
});

describe("A1.4c: summary rows on the canvas", () => {
  test("a summary is not text-selectable on the canvas (canvas-only: the export carries no user-select)", () => {
    expect(CANVAS_STYLESHEET).toContain("[data-node-type][data-cv] summary{-webkit-user-select:none;user-select:none}");
    expect(CANVAS_STYLESHEET).toContain("[data-node-type][data-cv] *{pointer-events:none}");
    // the shared per-kind rules (also compiled into the export) never carry it
    expect(KIND_LOOKS_CSS).not.toContain("user-select");
  });
});

describe("A1.4d: the wrapper never gets a height (the control's box is the wrapper's box)", () => {
  const pad = { t: 20, r: 30, b: 10, l: 5 };

  test("progress: the kind-looks height:8px is on the control only, never on the wrapper", () => {
    expect(KIND_LOOKS.progress.extras.some(([p, v]) => p === "height" && v === "8px")).toBe(true);
    for (const own of [{}, { padding: pad }, { borderWidth: 3, borderStyle: "solid" as const, borderColor: "#ff0000" }, { padding: pad, borderWidth: 3, borderStyle: "solid" as const, borderColor: "#ff0000" }]) {
      const { wrapper, control } = splitControlStyle(rootOf("progress", own)) as { wrapper: Css; control: Css };
      expect(wrapper.height, JSON.stringify(own)).toBeUndefined();
      expect(control.height, JSON.stringify(own)).toBe("8px");
      expect(wrapper.padding).toBeUndefined();
      expect(wrapper.borderWidth).toBeUndefined();
    }
    const { control } = splitControlStyle(rootOf("progress", { padding: pad })) as { wrapper: Css; control: Css };
    expect(control.padding).toBe("20px 30px 10px 5px");
  });

  test("an explicit height wins over the kind's 8px, still lives on the control only (px, rem, vh)", () => {
    const cases: [number | string, string][] = [[20, "20px"], [100, "100px"]];
    for (const [h, css] of cases) {
      const { wrapper, control } = splitControlStyle(rootOf("progress", { height: h as number, padding: pad })) as { wrapper: Css; control: Css };
      expect(wrapper.height).toBeUndefined();
      expect(control.height).toBe(css);
    }
    // a unit string passed straight to the splitter (cssLen output style)
    for (const h of ["3rem", "20vh", "calc(10px + 2em)"]) {
      const { wrapper, control } = splitControlStyle({ display: "block", width: "100%", height: h }) as { wrapper: Css; control: Css };
      expect(wrapper.height).toBeUndefined();
      expect(control.height).toBe(h);
    }
  });

  test("a percentage height can only resolve against the parent, so it stays on the wrapper and the control fills it", () => {
    const { wrapper, control } = splitControlStyle({ display: "block", width: "100%", height: "50%" }) as { wrapper: Css; control: Css };
    expect(wrapper.height).toBe("50%");
    expect(control.height).toBe("100%");
  });

  test("no leaf kind's kind-looks extra sizes the wrapper: the wrapper only ever has display, width, min-height, max-width, margin, opacity", () => {
    const allowed = new Set(["display", "width", "minHeight", "maxWidth", "margin", "opacity"]);
    for (const k of ["select", "slider", "progress", "textarea"] as const) {
      for (const own of [{}, { padding: pad }, { height: 30, padding: pad }, { minHeight: 50 }, { width: 120, maxWidth: "80%", opacity: 0.4 }]) {
        const { wrapper } = splitControlStyle(rootOf(k, own as never)) as { wrapper: Css };
        for (const key of Object.keys(wrapper)) expect(allowed.has(key), `${k} ${JSON.stringify(own)} wrapper has ${key}`).toBe(true);
      }
    }
    // the only height-like extras across ALL kinds belong to progress (select / slider / textarea have none)
    for (const k of ["select", "slider", "textarea"]) {
      expect((KIND_LOOKS[k]?.extras ?? []).filter(([p]) => /height/.test(p))).toEqual([]);
    }
  });

  test("rendered progress: the wrapper's inline style has no height, the <progress> carries height:8px", () => {
    const html = renderToStaticMarkup(
      controlShell(
        { "data-node-id": "p", "data-node-type": "progress", "data-cv": "" } as never,
        "ring",
        "progress",
        rootOf("progress", { padding: pad }),
        (c) => createElement("progress", { ...c, value: 40, max: 100 }),
      ) as never,
    );
    const wrapperStyle = /^<div[^>]*style="([^"]*)"/.exec(html)?.[1] ?? "";
    const innerStyle = /<progress[^>]*style="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(wrapperStyle).not.toMatch(/height/);
    expect(innerStyle).toMatch(/height:8px/);
    expect(innerStyle).toMatch(/padding:20px 30px 10px 5px/);
  });
});
