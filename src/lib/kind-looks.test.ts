import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import looks from "@/lib/kind-looks.json";
import {
  CANVAS_INERT_CSS,
  CANVAS_STYLESHEET,
  FACING_BORDER,
  KIND_LOOKS,
  KIND_LOOKS_CSS,
  expandTokens,
  explicitOf,
  kebabToCamel,
  nameAttr,
  rootStyleFor,
  summaryLabel,
} from "@/lib/kind-looks";
import { styleToCss } from "@/lib/style-css";

type Raw = { palette: Record<string, string>; kinds: Record<string, { extras: string[][]; css: string[] }> };
const raw = looks as unknown as Raw;
const golden = readFileSync(new URL("../../src-tauri/src/fixtures/a1/all-kinds.styles.css", import.meta.url), "utf8");

/** What Phase6bView computes for a node root. */
function rs(
  kind: string,
  nodeStyle: Parameters<typeof styleToCss>[0],
  resolved: Parameters<typeof styleToCss>[0],
  opts: Parameters<typeof rootStyleFor>[3] = {},
) {
  return rootStyleFor(kind, styleToCss(resolved), explicitOf(styleToCss(nodeStyle), nodeStyle.borderColor !== undefined), opts) as Record<string, unknown>;
}

describe("kind-looks (A1.4): one JSON, canvas side", () => {
  test("the canvas stylesheet is exactly the expanded JSON, plus the canvas-only inert rule", () => {
    const want = Object.values(raw.kinds)
      .flatMap((k) => k.css)
      .map((r) => expandTokens(r, raw.palette))
      .join("\n");
    // per kind the rules are concatenated; the kinds are joined by a newline
    const perKind = Object.values(raw.kinds)
      .map((k) => k.css.map((r) => expandTokens(r, raw.palette)).join(""))
      .join("\n");
    expect(KIND_LOOKS_CSS).toBe(perKind);
    expect(CANVAS_STYLESHEET).toBe(`${perKind}\n${CANVAS_INERT_CSS}`);
    expect(want.length).toBeGreaterThan(2000);
    expect(CANVAS_STYLESHEET).not.toContain("{{");
    expect(CANVAS_STYLESHEET).not.toContain("!important");
    expect(CANVAS_STYLESHEET).not.toContain("var(");
  });

  test("every kind's rules and extras appear in the Rust golden export stylesheet", () => {
    let rules = 0;
    let extras = 0;
    for (const [name, k] of Object.entries(KIND_LOOKS)) {
      if (k.css) {
        expect(golden.includes(k.css) || name === "switch" || name === "link").toBe(true);
        rules++;
      }
      const m = new RegExp(`\\.t-${name}\\{([^}]*)\\}`).exec(golden);
      if (k.extras.length === 0 || name === "spacer") continue;
      expect(m).not.toBeNull();
      for (const [prop, v] of k.extras) {
        expect(m![1]).toContain(`${prop}:${v}`);
        extras++;
      }
    }
    expect(rules).toBeGreaterThanOrEqual(24); // A3.2: switch moved to a3.kinds
    expect(extras).toBeGreaterThan(60);
  });

  test("tokens expand like the compiler: unknown stays visible", () => {
    expect(expandTokens("{{muted}} {{nope}} x", { muted: "#64748b" })).toBe("#64748b {{nope}} x");
    expect(FACING_BORDER).toBe("1px solid #e2e8f0");
  });

  test("kebab to camel, vendor prefixes", () => {
    expect(kebabToCamel("border-radius")).toBe("borderRadius");
    expect(kebabToCamel("-webkit-appearance")).toBe("WebkitAppearance");
    expect(kebabToCamel("appearance")).toBe("appearance");
    expect(kebabToCamel("flex-wrap")).toBe("flexWrap");
  });

  test("G1: an explicit style wins over the kind's extras; the rest still applies", () => {
    const r = rs("empty", { padding: 4, borderRadius: 2 }, { padding: 4, borderRadius: 2 });
    expect(r.padding).toBe("4px");
    expect(r.borderRadius).toBe("2px");
    expect(r.backgroundColor).toBe("#ffffff");
    expect(r.textAlign).toBe("center");
    expect(r.borderWidth).toBe("1px");
    expect(r.borderStyle).toBe("solid");
    expect(r.borderColor).toBe("#e2e8f0");
    // explicit text-align wins over the extra
    expect(rs("empty", { textAlign: "left" }, { textAlign: "left" }).textAlign).toBe("left");
    // explicit border colour wins; width / style still come from the look
    const c = rs("item", { borderColor: "#ff0000" }, { borderColor: "#ff0000" });
    expect(c.borderColor).toBe("#ff0000");
    expect(c.borderWidth).toBe("1px");
  });

  test("fix 2: align end uses margin-left:auto only, and only without an own margin", () => {
    const end = { alignEnd: true };
    const none = rs("bubble", {}, {}, end);
    expect(none.margin).toBe("0px 0px 0px auto");
    expect(none.textAlign).toBeUndefined();
    const m10 = rs("bubble", { margin: 10 }, { margin: 10 }, end);
    expect(m10.margin).toBe("10px");
    expect(String(m10.margin)).not.toContain("auto");
    const m0 = rs("message", { margin: 0 }, { margin: 0 }, end);
    expect(m0.margin).toBe("0px");
    // start alignment: no auto at all
    expect(rs("bubble", {}, {}).margin).toBeUndefined();
    expect(rs("bubble", {}, {}).maxWidth).toBe("80%");
    expect(rs("bubble", {}, {}).width).toBe("fit-content");
    // a default margin (not the node's own) is kept except for the left side
    expect(rs("bubble", {}, { margin: { t: 1, r: 2, b: 3, l: 4 } }, end).margin).toBe("1px 2px 3px auto");
  });

  test("fix 3: sheet / drawer show only the facing side, a custom width / style / colour wins", () => {
    const r = rs("sheet", {}, {}, { side: "right" });
    expect(r.borderLeftWidth).toBe("1px");
    expect(r.borderLeftStyle).toBe("solid");
    expect(r.borderLeftColor).toBe("#e2e8f0");
    for (const s of ["Top", "Right", "Bottom"]) expect(r[`border${s}Style`]).toBe("none");
    expect(r.borderWidth).toBeUndefined();
    expect(r.borderStyle).toBeUndefined();
    expect(r.borderColor).toBeUndefined();
    const l = rs("sheet", {}, {}, { side: "left" });
    expect(l.borderRightStyle).toBe("solid");
    expect(l.borderLeftStyle).toBe("none");
    // borderWidth 4: the facing side gets 4px, the others stay none
    const w = rs("sheet", { borderWidth: 4 }, { borderWidth: 4 }, { side: "right" });
    expect(w.borderLeftWidth).toBe("4px");
    expect(w.borderLeftStyle).toBe("solid");
    expect(w.borderTopStyle).toBe("none");
    expect(w.borderRightStyle).toBe("none");
    expect(w.borderBottomStyle).toBe("none");
    // custom colour and style win
    const cs = rs("sheet", { borderColor: "#f00", borderStyle: "dashed" }, { borderColor: "#f00", borderStyle: "dashed" }, { side: "right" });
    expect(cs.borderLeftColor).toBe("#f00");
    expect(cs.borderLeftStyle).toBe("dashed");
    expect(cs.borderTopStyle).toBe("none");
    // drawer faces the top
    const d = rs("drawer", {}, {});
    expect(d.borderTopStyle).toBe("solid");
    expect(d.borderTopWidth).toBe("1px");
    for (const s of ["Right", "Bottom", "Left"]) expect(d[`border${s}Style`]).toBe("none");
    // a dialog keeps a full border
    const dl = rs("dialog", {}, {});
    expect(dl.borderWidth).toBe("1px");
    expect(dl.borderTopStyle).toBeUndefined();
  });

  test("fix 6: OTP boxes wrap and keep the 8px gap", () => {
    const r = rs("inputOtp", {}, {});
    expect(r.flexWrap).toBe("wrap");
    expect(r.gap).toBe("8px");
    expect(r.display).toBe("flex");
    expect(KIND_LOOKS.inputOtp.css).toContain(".t-inputOtp input{width:40px;height:40px;");
  });

  test("progress / select vendor appearance keys are camel-cased", () => {
    const p = rs("progress", {}, {});
    expect(p.WebkitAppearance).toBe("none");
    expect(p.appearance).toBe("none");
    expect(rs("select", {}, {}).WebkitAppearance).toBe("auto");
  });

  test("explicitOf ignores the always-present currentColor border colour", () => {
    const css = styleToCss({ padding: 3 });
    expect(css.borderColor).toBe("currentColor");
    expect("borderColor" in explicitOf(css, false)).toBe(false);
    expect(explicitOf(styleToCss({ borderColor: "red" }), true).borderColor).toBe("red");
    expect((explicitOf(css, false) as Record<string, unknown>).padding).toBe("3px");
  });

  test("toggleGroup / radio get aria-label from the layer name (G4); blank names get none", () => {
    expect(nameAttr("View mode")).toEqual({ "aria-label": "View mode" });
    expect(nameAttr('a<b "q" มุมมอง')).toEqual({ "aria-label": 'a<b "q" มุมมอง' });
    expect(nameAttr(undefined)).toEqual({});
    expect(nameAttr("   ")).toEqual({});
    expect(nameAttr("")).toEqual({});
  });

  test("dropdown / popover label falls back to the layer name, never invents text", () => {
    expect(summaryLabel("Open", "Menu")).toBe("Open");
    expect(summaryLabel("", "Menu")).toBe("Menu");
    expect(summaryLabel("  ", " Menu ")).toBe("Menu");
    expect(summaryLabel("", undefined)).toBe("");
    expect(summaryLabel("", "  ")).toBe("");
  });
});
