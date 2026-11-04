// PHASE-11 A3.1: the checkbox kind, unit level (schema mirror, document ops, palette, looks, canvas SSR).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node, PageDocument } from "@/schema";
import { A3_TYPES, DEFAULT_STYLES, isA3Type, isVersion4Kind } from "@/schema";
import { NODE_TYPE_LABEL, PALETTE_TYPES, createNode, insertNode, nodeDisplayName, setNodeProp } from "@/lib/document-ops";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { documentForSave } from "@/lib/breakpoints";
import { A3_LOOKS, A3_STYLESHEET, a3ExtrasStyle, a3Section } from "@/lib/a3-looks";
import looks from "@/lib/kind-looks.json";
import { CheckboxView } from "@/components/editor/a3-view";

const RS = join(import.meta.dir, "..", "..", "src-tauri", "src");
const DEFAULTS_RS = readFileSync(join(RS, "defaults.rs"), "utf8");

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a31", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};
const cb = (): Node => ({ ...createNode("checkbox"), id: "cb" });

describe("A3.1 schema mirror", () => {
  test("A3_TYPES = Rust is_a3_kind; version-4 marker", () => {
    const body = DEFAULTS_RS.slice(DEFAULTS_RS.indexOf("pub fn is_a3_kind(t: NodeType) -> bool {"));
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::Checkbox");
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::Field");
    expect([...A3_TYPES]).toEqual(["checkbox", "field"]);
    expect(isA3Type("checkbox") && isVersion4Kind("checkbox")).toBe(true);
    expect(isA3Type("field") && isVersion4Kind("field")).toBe(true);
    expect(isA3Type("switch")).toBe(false);
    expect(DEFAULTS_RS).toContain("is_phase6b(t) || is_a2_kind(t) || is_a3_kind(t) || is_a4_kind(t)");
    expect(documentForSave(doc1(cb())).version).toBe(4);
  });
  test("Rust NodeProps::Checkbox has exactly label + checked (sparse, both always stored)", () => {
    const i = DEFAULTS_RS.indexOf("    Checkbox {\n");
    expect(i).toBeGreaterThan(0);
    const arm = DEFAULTS_RS.slice(i, DEFAULTS_RS.indexOf("},", i));
    expect(arm).toContain("label: String");
    expect(arm).toContain("checked: bool");
    expect(arm).not.toContain("Option<");
    expect(DEFAULTS_RS).toContain('NodeType::Checkbox => StyleProps {\n            display: Some("flex".into()),');
    expect(DEFAULTS_STYLES_OK()).toBe(true);
  });
});
const DEFAULTS_STYLES_OK = () =>
  JSON.stringify(DEFAULT_STYLES.checkbox) === JSON.stringify({ display: "flex", margin: 0, padding: 0, color: "#0f172a", fontSize: 16, fontWeight: 400 });

describe("A3.1 document ops", () => {
  test("createNode: label + checked:false; Layers shows the English kind name unless renamed", () => {
    const n = cb();
    expect(n.props).toEqual({ type: "checkbox", label: "ยอมรับเงื่อนไข", checked: false });
    expect(nodeDisplayName(n)).toBe("Checkbox");
    expect(nodeDisplayName({ ...n, name: "เงื่อนไข" })).toBe("เงื่อนไข");
  });
  test("setNodeProp: checked (boolean only, no-op when same) and label (string only)", () => {
    const d = doc1(cb());
    const on = setNodeProp(d, "cb", "checked", true);
    expect(on?.nodes.cb.props).toEqual({ type: "checkbox", label: "ยอมรับเงื่อนไข", checked: true });
    expect(setNodeProp(d, "cb", "checked", false)).toBeNull();
    expect(setNodeProp(d, "cb", "checked", "true")).toBeNull();
    const l = setNodeProp(d, "cb", "label", "รับข่าวสาร");
    expect((l?.nodes.cb.props as { label: string }).label).toBe("รับข่าวสาร");
    expect(setNodeProp(d, "cb", "label", 3)).toBeNull();
    expect(setNodeProp(d, "cb", "placeholder", "x")).toBeNull();
  });
  test("palette: Thai-first tile (aria เพิ่มCheckbox), Forms group, Thai keywords; new switch default label is 'Switch' (A3.2, changed ruling 6)", () => {
    expect(PALETTE_TYPES).toContain("checkbox");
    expect(NODE_TYPE_LABEL.checkbox).toBe("Checkbox");
    expect(`เพิ่ม${NODE_TYPE_LABEL.checkbox}`).toBe("เพิ่มCheckbox");
    expect(PALETTE_META.checkbox.group).toBe("Forms");
    expect(PALETTE_META.checkbox.keywords).toEqual(expect.arrayContaining(["checkbox", "tick", "ติ๊ก", "กล่องติ๊ก", "ช่องทำเครื่องหมาย", "เช็คบ็อกซ์"]));
    for (const q of ["checkbox", "ติ๊ก", "กล่องติ๊ก", "ช่องทำเครื่องหมาย", "tick", "เช็คบ็อกซ์"]) {
      expect(filterPaletteGroups(q).flatMap((g) => g.types)).toContain("checkbox");
    }
    expect((createNode("switch").props as { label: string }).label).toBe("Switch"); // changed ruling 6 (A3.2)
  });
});

describe("A3.1 looks (shared with the compiler)", () => {
  test("the checkmark is one constant data: SVG in a3, nowhere else; no other url(", () => {
    expect(A3_STYLESHEET).toContain(".t-checkbox input{-webkit-appearance:none;appearance:none;");
    expect(A3_STYLESHEET).toContain('.t-checkbox input:checked{background-color:#0f172a;border-color:#0f172a;background-image:url("data:image/svg+xml,');
    expect(A3_STYLESHEET.split("url(").length - 1).toBe(1);
    // A3.1.1: border is the {{muted}} token (#64748b, 4.76:1 on white); forced colors restore the native box
    expect(A3_STYLESHEET).toContain("border:1px solid #64748b;");
    expect(A3_STYLESHEET).not.toContain("#94a3b8");
    expect(A3_STYLESHEET).toContain("@media (forced-colors:active){.t-checkbox input,.t-checkbox input:checked{-webkit-appearance:auto;appearance:auto;background-image:none}}");
    // a4.list check-marker also uses a data: SVG mask; strip a3+a4 to assert no other tables hold url(.
    const rest = JSON.stringify({ ...looks, a3: undefined, a4: undefined });
    expect(rest).not.toContain("url(");
    expect(A3_STYLESHEET).not.toContain("{{");
    expect(A3_LOOKS.checkbox.extras).toEqual([["align-items", "center"], ["gap", "8px"]]);
  });
  test("a missing a3 section is a hard error", () => {
    expect(() => a3Section({})).toThrow("missing section `a3`");
    expect(() => a3Section({ a3: {} })).toThrow("a3.kinds");
    expect(() => a3Section({ a3: { kinds: { checkbox: { css: [] } } } })).toThrow("malformed");
  });
  test("G1: an explicit value beats an extra", () => {
    expect(a3ExtrasStyle("checkbox", {}, {})).toEqual({ alignItems: "center", gap: "8px" });
    expect(a3ExtrasStyle("checkbox", {}, { gap: 4 })).toEqual({ alignItems: "center" });
  });
});

describe("A3.1 canvas view (SSR)", () => {
  const html = (n: Node) => renderToStaticMarkup(createElement(CheckboxView, { node: n, handlers: { onClick: () => undefined }, style: DEFAULT_STYLES.checkbox }));
  test("root is a div (never a label), inert, input not focusable, checked mirrors the prop", () => {
    const off = html(cb());
    expect(off.startsWith("<div ")).toBe(true);
    expect(off).not.toContain("<label");
    expect(off).toContain('data-cv=""');
    expect(off).toContain('class="t-checkbox"');
    expect(off).toContain('tabindex="-1"');
    expect(off).not.toContain("checked=\"\"");
    expect(off).toContain("<span>ยอมรับเงื่อนไข</span>");
    const on = html({ ...cb(), props: { type: "checkbox", label: "", checked: true } });
    expect(on).toContain('checked=""');
    expect(on).not.toContain("<span>");
  });
});
