// PHASE-11 A4.1: the list kind, unit level (schema mirror, document ops, palette, looks, canvas SSR).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node, PageDocument } from "@/schema";
import { A4_TYPES, DEFAULT_STYLES, LIST_MARKERS, isA4Type, isVersion4Kind } from "@/schema";
import {
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  createNode,
  insertNode,
  nodeDisplayName,
  setListItems,
  setNodeProp,
} from "@/lib/document-ops";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { documentForSave } from "@/lib/breakpoints";
import { MAX_LIST_ITEMS, formatListItems, parseListItems } from "@/lib/list-items";
import { A4_LOOKS, A4_STYLESHEET, a4Section } from "@/lib/a4-looks";
import looks from "@/lib/kind-looks.json";
import { ListView } from "@/components/editor/a4-view";

const RS = join(import.meta.dir, "..", "..", "src-tauri", "src");
const DEFAULTS_RS = readFileSync(join(RS, "defaults.rs"), "utf8");

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a41", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};
const lst = (): Node => ({ ...createNode("list"), id: "l" });

describe("A4.1 schema mirror", () => {
  test("A4_TYPES = Rust is_a4_kind; version-4 marker", () => {
    const body = DEFAULTS_RS.slice(DEFAULTS_RS.indexOf("pub fn is_a4_kind(t: NodeType) -> bool {"));
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::List");
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::Table");
    expect([...A4_TYPES]).toEqual(["list", "table", "icon"]);
    expect(isA4Type("list") && isVersion4Kind("list")).toBe(true);
    expect(isA4Type("checkbox")).toBe(false);
    expect(DEFAULTS_RS).toContain("is_phase6b(t) || is_a2_kind(t) || is_a3_kind(t) || is_a4_kind(t)");
    expect(documentForSave(doc1(lst())).version).toBe(4);
  });
  test("Rust NodeProps::List has items + ordered + marker", () => {
    const i = DEFAULTS_RS.indexOf("    List {\n");
    expect(i).toBeGreaterThan(0);
    const arm = DEFAULTS_RS.slice(i, DEFAULTS_RS.indexOf("},", i));
    expect(arm).toContain("items: Vec<String>");
    expect(arm).toContain("ordered: bool");
    expect(arm).toContain("marker: ListMarker");
    expect(DEFAULTS_RS).toContain("NodeType::List => StyleProps {");
    expect(DEFAULT_STYLES.list).toEqual({
      display: "block",
      margin: 0,
      padding: 0,
      color: "#0f172a",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.5,
    });
  });
});

describe("A4.1 document ops", () => {
  test("createNode defaults; Layers shows English kind name", () => {
    const n = lst();
    expect(n.props).toEqual({
      type: "list",
      items: ["รายการ 1", "รายการ 2", "รายการ 3"],
      ordered: false,
      marker: "disc",
    });
    expect(nodeDisplayName(n)).toBe("List");
  });
  test("setListItems caps at 50; setNodeProp ordered/marker", () => {
    const d = doc1(lst());
    const next = setListItems(d, "l", ["a", "b"]);
    expect((next?.nodes.l.props as { items: string[] }).items).toEqual(["a", "b"]);
    expect(setListItems(d, "l", ["รายการ 1", "รายการ 2", "รายการ 3"])).toBeNull();
    const many = Array.from({ length: 60 }, (_, i) => `i${i}`);
    const capped = setListItems(d, "l", many);
    expect((capped?.nodes.l.props as { items: string[] }).items).toHaveLength(MAX_LIST_ITEMS);
    expect(setNodeProp(d, "l", "ordered", true)?.nodes.l.props).toMatchObject({ ordered: true });
    expect(setNodeProp(d, "l", "ordered", false)).toBeNull();
    expect(setNodeProp(d, "l", "marker", "check")?.nodes.l.props).toMatchObject({ marker: "check" });
    expect(setNodeProp(d, "l", "marker", "bogus")).toBeNull();
    expect([...LIST_MARKERS]).toEqual(["disc", "decimal", "check", "none"]);
  });
  test("parse/format T24 lines", () => {
    expect(formatListItems(["a", "b"])).toBe("a\nb");
    expect(parseListItems("a\nb\n")).toEqual(["a", "b"]);
    expect(parseListItems(Array.from({ length: 60 }, (_, i) => `i${i}`).join("\n"))).toHaveLength(50);
  });
  test("palette: Text & media, Thai keywords", () => {
    expect(PALETTE_TYPES).toContain("list");
    expect(NODE_TYPE_LABEL.list).toBe("List");
    expect(PALETTE_META.list.group).toBe("Text & media");
    expect(filterPaletteGroups("bullets").flatMap((g) => g.types)).toContain("list");
    expect(filterPaletteGroups("รายการ").flatMap((g) => g.types)).toContain("list");
  });
});

describe("A4.1 looks + canvas", () => {
  test("a4 section parses; check marker uses mask url, no text glyph", () => {
    expect(() => a4Section(looks)).not.toThrow();
    expect(A4_LOOKS.list.css).toContain(".t-list--check");
    expect(A4_STYLESHEET).toContain("-webkit-mask-image:url(\"data:image/svg+xml,");
    expect(A4_STYLESHEET).not.toContain("content:\"✓\"");
    expect(A4_STYLESHEET).not.toContain("{{");
  });
  test("ListView SSR: disc ul, check role=list, decimal ol", () => {
    const html = (n: Node) =>
      renderToStaticMarkup(
        createElement(ListView, {
          node: n,
          handlers: { onClick: () => undefined },
          style: DEFAULT_STYLES.list,
        }),
      );
    const disc = html(lst());
    expect(disc).toContain("<ul");
    expect(disc).toContain("t-list--disc");
    expect(disc).not.toContain('role="list"');
    const check = html({
      ...lst(),
      props: { type: "list", items: ["x"], ordered: false, marker: "check" },
    });
    expect(check).toContain('role="list"');
    expect(check).toContain("t-list--check");
    const decimal = html({
      ...lst(),
      props: { type: "list", items: ["x"], ordered: true, marker: "decimal" },
    });
    expect(decimal).toContain("<ol");
    expect(decimal).toContain("t-list--decimal");
  });
});
