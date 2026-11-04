// PHASE-11 A4.3: table editor model helpers + document commit.
import { describe, expect, test } from "bun:test";
import type { Node, PageDocument } from "@/schema";
import { createNode, insertNode, setTableEditorCommit } from "@/lib/document-ops";
import {
  MAX_TABLE_COLS,
  TABLE_FULL_MESSAGE,
  addTableColumn,
  addTableRow,
  cloneGrid,
  pasteTsvAt,
  removeTableColumn,
  removeTableRow,
} from "@/lib/table-model";

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a43", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};

describe("A4.3 grid helpers", () => {
  test("add/remove column and row respect caps and min size", () => {
    let g = cloneGrid(["a", "b"], [["1", "2"]]);
    g = addTableRow(g)!;
    expect(g.rows).toHaveLength(2);
    expect(removeTableRow(g, 0)?.rows).toHaveLength(1);
    expect(removeTableRow(cloneGrid(["a"], [["x"]]), 0)).toBeNull();

    g = addTableColumn(g, "c")!;
    expect(g.columns).toEqual(["a", "b", "c"]);
    expect(g.rows[0]).toHaveLength(3);
    expect(removeTableColumn(g, 1)?.columns).toEqual(["a", "c"]);

    let full = cloneGrid(
      Array.from({ length: MAX_TABLE_COLS }, (_, i) => `c${i}`),
      [Array.from({ length: MAX_TABLE_COLS }, () => "")],
    );
    expect(addTableColumn(full)).toBeNull();
    expect(TABLE_FULL_MESSAGE).toBe("ตารางเต็มแล้ว");
  });

  test("paste 5×4 TSV fills from a cell; 21st column is refused", () => {
    const g = cloneGrid(["A", "B", "C"], [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ]);
    const tsv = [
      ["1", "2", "3", "4"].join("\t"),
      ["5", "6", "7", "8"].join("\t"),
      ["9", "10", "11", "12"].join("\t"),
      ["13", "14", "15", "16"].join("\t"),
      ["17", "18", "19", "20"].join("\t"),
    ].join("\n");
    const { grid, refusedCols } = pasteTsvAt(g, 0, 0, tsv);
    expect(refusedCols).toBe(false);
    expect(grid.columns).toHaveLength(4);
    expect(grid.rows).toHaveLength(5);
    expect(grid.rows[0]).toEqual(["1", "2", "3", "4"]);
    expect(grid.rows[4]).toEqual(["17", "18", "19", "20"]);

    // Paste needing a 21st column from col 0 → refused, filled to cap.
    const wide = Array.from({ length: 21 }, (_, i) => `v${i}`).join("\t");
    const again = pasteTsvAt(cloneGrid(["x"], [[""]]), 0, 0, wide);
    expect(again.refusedCols).toBe(true);
    expect(again.grid.columns).toHaveLength(MAX_TABLE_COLS);
    expect(again.grid.rows[0]![0]).toBe("v0");
    expect(again.grid.rows[0]![19]).toBe("v19");
  });

  test("keyboard-edit 3×3 model via setTableEditorCommit is one document write", () => {
    const n = { ...createNode("table"), id: "t" };
    const d = doc1(n);
    const next = setTableEditorCommit(d, "t", {
      columns: ["X", "Y", "Z"],
      rows: [
        ["a", "b", "c"],
        ["d", "e", "f"],
        ["g", "h", "i"],
      ],
      caption: "Demo",
      headerRow: true,
      striped: true,
    });
    expect(next).not.toBeNull();
    const p = next!.nodes.t.props as {
      columns: string[];
      rows: string[][];
      caption?: string;
      headerRow: boolean;
      striped: boolean;
    };
    expect(p.columns).toEqual(["X", "Y", "Z"]);
    expect(p.rows[1]).toEqual(["d", "e", "f"]);
    expect(p.caption).toBe("Demo");
    expect(p.headerRow && p.striped).toBe(true);
    expect(
      setTableEditorCommit(next!, "t", {
        columns: ["X", "Y", "Z"],
        rows: p.rows,
        caption: "Demo",
        headerRow: true,
        striped: true,
      }),
    ).toBeNull();
  });
});
