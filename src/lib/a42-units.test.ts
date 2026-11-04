// PHASE-11 A4.2: the table kind, unit level (schema mirror, document ops, palette, looks, canvas SSR).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node, PageDocument } from "@/schema";
import { A4_TYPES, DEFAULT_STYLES, isA4Type, isVersion4Kind } from "@/schema";
import {
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  createNode,
  insertNode,
  nodeDisplayName,
  setNodeProp,
  setTableModel,
} from "@/lib/document-ops";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { documentForSave } from "@/lib/breakpoints";
import {
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  formatColumns,
  formatRowsTsv,
  parseColumns,
  parseRowsTsv,
} from "@/lib/table-model";
import { A4_LOOKS, A4_STYLESHEET, a4Section } from "@/lib/a4-looks";
import looks from "@/lib/kind-looks.json";
import { TableView } from "@/components/editor/a4-view";

const RS = join(import.meta.dir, "..", "..", "src-tauri", "src");
const DEFAULTS_RS = readFileSync(join(RS, "defaults.rs"), "utf8");

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a42", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};
const tbl = (): Node => ({ ...createNode("table"), id: "t" });

describe("A4.2 schema mirror", () => {
  test("A4_TYPES includes table; Rust is_a4_kind", () => {
    const body = DEFAULTS_RS.slice(DEFAULTS_RS.indexOf("pub fn is_a4_kind(t: NodeType) -> bool {"));
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::Table");
    expect([...A4_TYPES]).toEqual(["list", "table", "icon"]);
    expect(isA4Type("table") && isVersion4Kind("table")).toBe(true);
    expect(documentForSave(doc1(tbl())).version).toBe(4);
  });
  test("Rust NodeProps::Table + default styles", () => {
    const i = DEFAULTS_RS.indexOf("    Table {\n");
    expect(i).toBeGreaterThan(0);
    const arm = DEFAULTS_RS.slice(i, DEFAULTS_RS.indexOf("},", i));
    expect(arm).toContain("columns: Vec<String>");
    expect(arm).toContain("rows: Vec<Vec<String>>");
    expect(arm).toContain("header_row: bool");
    expect(DEFAULTS_RS).toContain("NodeType::Table => StyleProps {");
    expect(DEFAULT_STYLES.table).toEqual({
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

describe("A4.2 document ops", () => {
  test("createNode defaults; Layers shows English kind name", () => {
    const n = tbl();
    expect(n.props).toEqual({
      type: "table",
      columns: ["คอลัมน์ 1", "คอลัมน์ 2", "คอลัมน์ 3"],
      rows: [
        ["", "", ""],
        ["", "", ""],
      ],
      headerRow: true,
      striped: false,
    });
    expect(nodeDisplayName(n)).toBe("Table");
  });
  test("setTableModel caps 20×100; setNodeProp caption/headerRow/striped", () => {
    const d = doc1(tbl());
    const next = setTableModel(d, "t", {
      columns: ["a", "b"],
      rows: [["1", "2"]],
    });
    expect((next?.nodes.t.props as { columns: string[] }).columns).toEqual(["a", "b"]);
    expect(setTableModel(d, "t", {
      columns: ["คอลัมน์ 1", "คอลัมน์ 2", "คอลัมน์ 3"],
      rows: [
        ["", "", ""],
        ["", "", ""],
      ],
    })).toBeNull();
    const manyCols = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const cappedCols = setTableModel(d, "t", { columns: manyCols, rows: [] });
    expect((cappedCols?.nodes.t.props as { columns: string[] }).columns).toHaveLength(MAX_TABLE_COLS);
    const manyRows = Array.from({ length: 110 }, () => ["x"]);
    const cappedRows = setTableModel(d, "t", { columns: ["x"], rows: manyRows });
    expect((cappedRows?.nodes.t.props as { rows: string[][] }).rows).toHaveLength(MAX_TABLE_ROWS);
    expect(setNodeProp(d, "t", "headerRow", false)?.nodes.t.props).toMatchObject({ headerRow: false });
    expect(setNodeProp(d, "t", "striped", true)?.nodes.t.props).toMatchObject({ striped: true });
    expect(setNodeProp(d, "t", "caption", "Sales")?.nodes.t.props).toMatchObject({ caption: "Sales" });
    expect(setNodeProp(d, "t", "caption", "  ")?.nodes.t.props).not.toHaveProperty("caption");
  });
  test("parse/format columns and TSV rows", () => {
    expect(formatColumns(["a", "b"])).toBe("a\nb");
    expect(parseColumns("a\nb\n")).toEqual(["a", "b"]);
    expect(parseColumns(Array.from({ length: 30 }, (_, i) => `c${i}`).join("\n"))).toHaveLength(MAX_TABLE_COLS);
    expect(formatRowsTsv([["1", "2"], ["3", "4"]])).toBe("1\t2\n3\t4");
    expect(parseRowsTsv("1\t2\n3\t4\n", 2)).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
  test("palette: Data group, Thai keywords", () => {
    expect(PALETTE_TYPES).toContain("table");
    expect(NODE_TYPE_LABEL.table).toBe("Table");
    expect(PALETTE_META.table.group).toBe("Data");
    expect(filterPaletteGroups("grid").flatMap((g) => g.types)).toContain("table");
    expect(filterPaletteGroups("ตาราง").flatMap((g) => g.types)).toContain("table");
  });
});

describe("A4.2 looks + canvas", () => {
  test("a4 section includes table rules", () => {
    expect(() => a4Section(looks)).not.toThrow();
    expect(A4_LOOKS.table.css).toContain(".t-tablewrap");
    expect(A4_STYLESHEET).toContain(".t-table--striped");
    expect(A4_STYLESHEET).not.toContain("{{");
  });
  test("TableView SSR: region wrapper, thead, striped class", () => {
    const html = (n: Node) =>
      renderToStaticMarkup(
        createElement(TableView, {
          node: n,
          handlers: { onClick: () => undefined },
          style: DEFAULT_STYLES.table,
        }),
      );
    const base = html(tbl());
    expect(base).toContain('role="region"');
    expect(base).toContain("t-tablewrap");
    expect(base).toContain("<thead");
    expect(base).toContain('scope="col"');
    const striped = html({
      ...tbl(),
      props: {
        type: "table",
        columns: ["A"],
        rows: [["1"], ["2"]],
        headerRow: true,
        striped: true,
      },
    });
    expect(striped).toContain("t-table--striped");
    const cap = html({
      ...tbl(),
      props: {
        type: "table",
        columns: ["A"],
        rows: [["x"]],
        caption: "My table",
        headerRow: false,
        striped: false,
      },
    });
    expect(cap).toContain('aria-label="My table"');
    expect(cap).toContain("<caption>My table</caption>");
  });
});
