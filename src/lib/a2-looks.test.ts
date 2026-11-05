import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A2LeafView } from "@/components/editor/a2-view";
import {
  A2_LOOKS,
  A2_STYLESHEET,
  A2_TEXTS,
  a2ExtrasStyle,
  a2Layout,
  cornerDecls,
  emitsElement,
  groupSlots,
  kebabLayout,
  mergeOver,
  ratioCss,
  scrollAreaName,
  scrollAxes,
  slotStyle,
  spinnerLabel,
  spinnerPx,
  type A2ContainerType,
  type Dir,
  type GroupPos,
  type ScrollOrientation,
} from "@/lib/a2-looks";
import { KIND_LOOKS } from "@/lib/kind-looks";
import { DEFAULT_STYLES, type Node } from "@/schema";
import { styleToCss } from "@/lib/style-css";

const fx = (n: string) => readFileSync(new URL(`../../src-tauri/src/fixtures/a2/${n}`, import.meta.url), "utf8");
const goldenDefault = fx("a23-default.css");
const goldenAll = [
  "a23-default.css",
  "a23-overrides.css",
  "a23-nested.css",
  "a23-hostile.css",
  "a23-group-mixed.css",
  "a23-layout-edge.css",
  "a23-bp-corners.css",
  "a23b-default.css",
  "a23b-overrides.css",
  "a23b-nested.css",
  "a23b-hostile.css",
]
  .map(fx)
  .join("\n");

describe("A2.3: shared a2 section of kind-looks.json", () => {
  test("the a2 helpers are aspectRatio, badge, scrollArea (focus ring only, N3), separator, separatorVertical, spinner; A1 table untouched", () => {
    expect(Object.keys(A2_LOOKS).sort()).toEqual(["aspectRatio", "badge", "scrollArea", "separator", "separatorVertical", "spinner"]);
    expect(Object.keys(KIND_LOOKS)).toHaveLength(30); // A3.2: switch moved to a3.kinds
    for (const k of ["card", "alert", "separator", "skeleton", "spinner", "aspectRatio", "buttonGroup", "badge", "scrollArea"]) {
      expect(KIND_LOOKS[k]).toBeUndefined();
    }
    expect(A2_TEXTS.spinnerLabel).toBe("กำลังโหลด");
  });

  test("badge holds only non-StyleProps declarations; display / overflow are never repeated in any a2 look (ruling)", () => {
    expect(A2_LOOKS.badge.extras).toEqual([
      ["align-items", "center"],
      ["gap", "4px"],
    ]);
    for (const k of Object.values(A2_LOOKS)) {
      for (const [p] of k.extras) expect(["display", "overflow"]).not.toContain(p);
    }
    expect(A2_LOOKS.badge.css).toBe("");
    // the two ruling values are in the style defaults (one place) and so in the type rules
    expect((DEFAULT_STYLES as Record<string, Record<string, unknown>>).badge.display).toBe("inline-flex");
    expect((DEFAULT_STYLES as Record<string, Record<string, unknown>>).scrollArea.overflow).toBe("auto");
    expect(goldenDefault).not.toContain(".t-badge");
    expect(fx("a23b-default.css")).toContain(".t-badge{display:inline-flex;");
    expect(fx("a23b-default.css")).toContain("align-items:center;gap:4px}.t-scrollArea{display:flex;width:100%;overflow:auto}");
  });

  test("the stylesheet is plain: no var( gradient( url( !important, one infinite animation + reduced-motion", () => {
    for (const bad of ["var(", "gradient(", "url(", "!important", "{{"]) expect(A2_STYLESHEET).not.toContain(bad);
    expect(A2_STYLESHEET.match(/infinite/g)).toHaveLength(1);
    expect(A2_STYLESHEET).toContain("@media (prefers-reduced-motion:reduce){.t-spinner svg{animation:none}}");
  });

  test("every A2 css rule and extra appears in the Rust golden export (same values in both languages)", () => {
    // a23-default has no scrollArea / badge; a23b-default has every kind (N3: the scrollArea focus ring is there)
    const everyKind = goldenDefault + fx("a23b-default.css");
    // B0: state rules and at-rules live in the shared generator block (after the node rules), so check rule by rule
    const topRules = (css: string) => {
      const out: string[] = [];
      let depth = 0, start = 0;
      for (let i = 0; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
      }
      return out;
    };
    for (const k of Object.values(A2_LOOKS)) for (const r of topRules(k.css)) expect(`${everyKind.includes(r)} ${r}`).toBe(`true ${r}`);
    expect(fx("a23b-default.css")).toContain(".t-scrollArea:focus-visible{outline:2px solid #0077c2;outline-offset:2px}");
    const ext = A2_LOOKS.separatorVertical.extras.map(([p, v]) => `${p}:${v}`).join(";");
    expect(goldenDefault).toContain(`{${ext}}`);
    expect(A2_TEXTS.spinnerPath.length).toBeGreaterThan(0);
    expect(fx("a23-default.html")).toContain(`<path d="${A2_TEXTS.spinnerPath}"/>`);
    expect(fx("a23-default.html")).toContain(`aria-label="${A2_TEXTS.spinnerLabel}"`);
  });

  test("per-kind layout defaults equal the type rules the compiler emits", () => {
    for (const t of ["card", "alert", "aspectRatio", "buttonGroup"] as A2ContainerType[]) {
      const decl = kebabLayout(a2Layout(t, {}));
      const m = new RegExp(`\\.t-${t}\\{([^}]*)\\}`).exec(goldenDefault);
      expect(m).not.toBeNull();
      expect(m![1].endsWith(decl.split(";").slice(1).join(";"))).toBe(true);
      expect(m![1]).toContain("display:flex");
    }
  });

  test("layout props change the layout (direction / gap / align / justify)", () => {
    const l = a2Layout("card", { direction: "row", gap: 4, align: "center", justify: "between" });
    expect(l).toMatchObject({ display: "flex", flexDirection: "row", gap: "4px", alignItems: "center", justifyContent: "space-between" });
    expect(a2Layout("alert", {})).toMatchObject({ flexDirection: "column", gap: "8px" });
    expect(a2Layout("buttonGroup", {})).toMatchObject({ flexDirection: "row", gap: "0px", alignItems: "stretch", justifyContent: "flex-start" });
    expect(kebabLayout(a2Layout("card", { direction: "row", gap: 4, align: "center", justify: "between" }))).toBe(
      "display:flex;flex-direction:row;gap:4px;align-items:center;justify-content:space-between",
    );
    expect(goldenAll).toContain("flex-direction:row;gap:4px;align-items:center;justify-content:space-between");
  });

  test("ratios, spinner size and label", () => {
    expect(["16/9", "4/3", "1/1", "3/2", "21/9"].map(ratioCss)).toEqual(["16 / 9", "4 / 3", "1 / 1", "3 / 2", "21 / 9"]);
    for (const r of ["16 / 9", "4 / 3", "1 / 1", "21 / 9"]) expect(goldenAll).toContain(`aspect-ratio:${r}`);
    expect([5, 12, 24, 64, 99, 999999, NaN].map(spinnerPx)).toEqual([12, 12, 24, 64, 64, 64, 24]);
    expect(spinnerLabel(undefined)).toBe("กำลังโหลด");
    expect(spinnerLabel("   ")).toBe("กำลังโหลด");
    expect(spinnerLabel("กำลังบันทึก")).toBe("กำลังบันทึก");
  });
});

describe("A2.3: buttonGroup corners (shared table with the Rust compiler)", () => {
  const rows = JSON.parse(fx("corner-table.json")) as { dir: Dir; pos: GroupPos; radius: number; decls: [string, string][] }[];
  test("cornerDecls equals every row of corner-table.json", () => {
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) expect(cornerDecls(r.dir, r.pos, r.radius)).toEqual(r.decls);
    expect(cornerDecls("row", "first", Number.NaN)).toEqual([]);
    expect(cornerDecls("row", "last", -1)).toEqual([]);
  });

  test("slotStyle: corners as camelCase longhands, fill only where the node set no size", () => {
    expect(slotStyle("g:row:first", 8, false, false)).toEqual({
      borderTopLeftRadius: "8px",
      borderTopRightRadius: "0px",
      borderBottomRightRadius: "0px",
      borderBottomLeftRadius: "8px",
    });
    expect(slotStyle("g:column:middle", 8, false, false)).toEqual({ borderRadius: "0px" });
    expect(slotStyle("g:row:first", 0, false, false)).toEqual({});
    expect(slotStyle("fill", 0, false, false)).toEqual({ width: "100%", height: "100%" });
    expect(slotStyle("fill", 0, true, false)).toEqual({ height: "100%" });
    expect(slotStyle("fill", 0, true, true)).toEqual({});
    expect(slotStyle(undefined, 8, false, false)).toBeUndefined();
    expect(slotStyle("g:diagonal:first", 8, false, false)).toBeUndefined();
  });

  test("mergeOver: the corner longhands replace the shorthand, a plain override keeps it", () => {
    expect(mergeOver({ borderRadius: "8px", color: "red" }, slotStyle("g:row:first", 8, false, false))).not.toHaveProperty("borderRadius");
    expect(mergeOver({ borderRadius: "8px" }, { width: "100%" })).toEqual({ borderRadius: "8px", width: "100%" });
    expect(mergeOver({ color: "red" }, undefined)).toEqual({ color: "red" });
  });

  const node = (id: string, type: string, props: object, extra: object = {}): Node =>
    ({ id, type, props: { type, ...props }, style: {}, ...extra }) as unknown as Node;
  test("groupSlots counts only the children the export draws", () => {
    const nodes: Record<string, Node> = {
      a: node("a", "button", { label: "a" }),
      b: node("b", "button", { label: "b" }),
      c: node("c", "button", { label: "c" }, { visible: false }),
      d: node("d", "badge", { label: "d" }),
      e: node("e", "dialog", { title: "", message: "", open: false }),
      f: node("f", "button", { label: "f" }),
      s: node("s", "scrollArea", { children: [], orientation: "vertical" }),
    };
    expect(groupSlots(nodes, ["a", "b", "c", "d", "e", "f"], "row")).toEqual({ a: "g:row:first", b: "g:row:middle", d: "g:row:middle", f: "g:row:last" });
    // badge and scrollArea draw now (A2.3 part 2), so they take a corner slot like any other kind
    expect(groupSlots(nodes, ["a", "d", "s"], "row")).toEqual({ a: "g:row:first", d: "g:row:middle", s: "g:row:last" });
    expect(groupSlots(nodes, ["c", "d", "e", "ghost"], "row")).toEqual({});
    expect(groupSlots(nodes, ["ghost", "a", "b"], "column")).toEqual({ a: "g:column:first", b: "g:column:last" });
    expect(emitsElement(undefined)).toBe(false);
    expect(emitsElement(nodes.e)).toBe(false);
    expect(emitsElement(nodes.a)).toBe(true);
    expect(emitsElement(nodes.d)).toBe(true);
    expect(emitsElement(nodes.s)).toBe(true);
  });
});

describe("A2.3 part 2: scrollArea orientation and name (shared tables with the Rust compiler)", () => {
  const rows = JSON.parse(fx("scroll-orientation.json")) as {
    orientation: ScrollOrientation;
    overflow: string | null;
    decls: [string, string][];
  }[];
  const camel = (p: string) => p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  test("scrollAxes equals every row of scroll-orientation.json", () => {
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) {
      const want = Object.fromEntries(r.decls.map(([k, v]) => [camel(k), v]));
      expect(scrollAxes(r.orientation, r.overflow ?? undefined)).toEqual(want);
    }
  });

  test("scrollAreaName: the trimmed label, else the trimmed layer name, else nothing", () => {
    expect(scrollAreaName("รายการ", "ชื่อชั้น")).toBe("รายการ");
    expect(scrollAreaName("  ", "ชื่อชั้น")).toBe("ชื่อชั้น");
    expect(scrollAreaName(undefined, "  ชื่อ  ")).toBe("ชื่อ");
    expect(scrollAreaName("", "   ")).toBeUndefined();
    expect(scrollAreaName(undefined, undefined)).toBeUndefined();
  });

  test("the Rust golden shows the same axis rules the table gives", () => {
    const css = fx("a23b-default.css");
    expect(css).toContain("justify-content:flex-start;overflow-x:hidden}");
    expect(css).toContain("justify-content:flex-start;overflow-y:hidden}");
    expect(fx("a23b-default.html")).toContain('role="region" aria-label="รายการเลื่อน" tabindex="0"');
  });
});

describe("A2.3: leaf kinds on the canvas (same tags as the export)", () => {
  const leaf = (type: string, props: object, style: Record<string, unknown> = {}, over?: object, name?: string) => {
    const node = { id: "n", type, props: { type, ...props }, style, ...(name !== undefined ? { name } : {}) } as unknown as Node;
    const resolved = { ...(DEFAULT_STYLES as Record<string, object>)[type], ...style };
    return renderToStaticMarkup(
      createElement(A2LeafView, { node, handlers: {}, chrome: "chrome", style: resolved, over: over as never }),
    );
  };

  test("F8: horizontal separator draws `color:inherit` like the export; an own colour wins", () => {
    // with a border and no colour of its own the border takes the inherited text colour, not the UA grey
    expect(leaf("separator", { orientation: "horizontal" }, { borderWidth: 2, borderStyle: "solid" })).toContain("color:inherit");
    expect(leaf("separator", { orientation: "horizontal" })).toContain("color:inherit");
    const own = leaf("separator", { orientation: "horizontal" }, { borderWidth: 2, borderStyle: "solid", color: "#ef4444" });
    expect(own).toContain("color:#ef4444");
    expect(own).not.toContain("color:inherit");
  });

  test("horizontal separator: an <hr> with no border (the line is the background), inert + data-cv", () => {
    const h = leaf("separator", { orientation: "horizontal" });
    expect(h.startsWith("<hr ")).toBe(true);
    expect(h).toContain('class="t-separator chrome"');
    expect(h).toContain('data-node-type="separator"');
    expect(h).toContain('data-cv=""');
    expect(h).toContain("border-width:0");
    expect(h).toContain("height:1px");
    expect(h).not.toContain("</hr>");
    // a node that sets its own border width keeps it
    expect(leaf("separator", { orientation: "horizontal" }, { borderWidth: 2 })).toContain("border-width:2px");
  });

  test("vertical separator: a div, role + orientation, width 1 / stretch unless the node sets the size", () => {
    const v = leaf("separator", { orientation: "vertical" });
    expect(v.startsWith("<div ")).toBe(true);
    expect(v).toContain('role="separator"');
    expect(v).toContain('aria-orientation="vertical"');
    for (const d of ["width:1px", "height:auto", "min-height:16px", "align-self:stretch"]) expect(v).toContain(d);
    const own = leaf("separator", { orientation: "vertical" }, { width: 3, height: 40 });
    expect(own).toContain("width:3px");
    expect(own).toContain("height:40px");
    expect(own).not.toContain("height:auto");
  });

  test("skeleton is a hidden block with the default look", () => {
    const s = leaf("skeleton", {});
    expect(s).toContain('aria-hidden="true"');
    expect(s).toContain('class="t-skeleton chrome"');
    for (const d of ["width:100%", "height:16px", "background-color:#e2e8f0", "border-radius:6px"]) expect(s).toContain(d);
  });

  test("spinner: status + label + the shared arc, size clamped; the layer name labels it", () => {
    const s = leaf("spinner", { size: 99 });
    expect(s).toContain('role="status"');
    expect(s).toContain('aria-label="กำลังโหลด"');
    expect(s).toContain('width="64"');
    expect(s).toContain('height="64"');
    expect(s).toContain(`d="${A2_TEXTS.spinnerPath}"`);
    expect(s).toContain('stroke="currentColor"');
    expect(s).toContain('aria-hidden="true"');
    expect(s).toContain('focusable="false"');
    expect(leaf("spinner", { size: 5 })).toContain('width="12"');
    expect(leaf("spinner", { size: 24 }, {}, undefined, "กำลังบันทึก")).toContain('aria-label="กำลังบันทึก"');
  });

  test("badge: an inline-flex span with the label, extras and no role; the node's own display / padding win", () => {
    const b = leaf("badge", { label: "ใหม่" });
    expect(b.startsWith("<span ")).toBe(true);
    expect(b).toContain('class="t-badge chrome"');
    expect(b).toContain('data-node-type="badge"');
    expect(b).toContain('data-cv=""');
    expect(b).toContain(">ใหม่</span>");
    for (const d of ["display:inline-flex", "align-items:center", "gap:4px", "background-color:#0f172a", "border-radius:200px"]) expect(b).toContain(d);
    expect(b).not.toContain("role=");
    expect(b).not.toContain("tabindex");
    const own = leaf("badge", { label: "x" }, { display: "inline-block", padding: 4 });
    expect(own).toContain("display:inline-block");
    expect(own).toContain("padding:4px");
    expect(own).not.toContain("display:inline-flex");
    expect(leaf("badge", { label: '"><script>' })).not.toContain("<script");
    expect(leaf("badge", { label: "" })).toContain("></span>");
  });

  test("hostile layer names are escaped (no markup injection)", () => {
    const s = leaf("spinner", { size: 24 }, {}, undefined, '"><script>alert(1)</script>');
    expect(s).not.toContain("<script");
    expect(s).toContain("&quot;&gt;&lt;script&gt;");
  });

  test("the slot override lands last on the root", () => {
    const s = leaf("skeleton", {}, {}, { width: "100%", height: "100%" });
    expect(s).toContain("height:100%");
    expect(s).not.toContain("height:16px");
    const r = leaf("separator", { orientation: "horizontal" }, {}, { borderTopLeftRadius: "4px" });
    expect(r).toContain("border-top-left-radius:4px");
  });

  test("a2ExtrasStyle: an explicit key wins (G1)", () => {
    const base = styleToCss({ width: 5 });
    const out = a2ExtrasStyle("separatorVertical", base, styleToCss({ width: 5 }, undefined)) as Record<string, unknown>;
    expect(out.width).toBe("5px");
    expect(out.minHeight).toBe("16px");
    expect(a2ExtrasStyle("nope", base, {})).toEqual(base);
  });
});
