import { describe, expect, test } from "bun:test";
import type { DbTable } from "./db-model";
import { validateModel } from "./db-validate";
import { focusProblemTarget, keyColumnNames, MISSING_COLUMN, problemTargets, tableProblems, withDetail } from "./db-problems";

const col = (id: string, name: string, extra: object = {}) => ({ id, name, type: "text" as const, nullable: true, ...extra });
const table = (over: Partial<DbTable> = {}): DbTable => ({
  id: "t1",
  name: "items",
  columns: [col("c1", "id", { type: "integer", nullable: false }), col("c2", "price", { type: "integer" })],
  primaryKey: ["c1"],
  uniques: [],
  foreignKeys: [],
  ...over,
});
const model = (t: DbTable) => ({ version: 1 as const, tables: [t] });

describe("ปัญหาของตาราง lists column errors too", () => {
  test("a column error is listed with its column and jumps to that field", () => {
    const t = table({ columns: [col("c1", "id", { type: "integer", nullable: false }), col("c2", "")] });
    const p = tableProblems(t, validateModel(model(t)));
    expect(p.map((x) => x.text)).toEqual(["คอลัมน์ที่ 2: ต้องมีชื่อ"]);
    expect(p[0].targets).toEqual(["db-t1-c2-name"]);
  });
  test("column, table-name and key errors together, in validation order, no duplicates", () => {
    const t = table({
      name: "",
      columns: [col("c1", "id", { type: "integer", nullable: false }), col("c2", "price", { type: "integer", default: { kind: "literal", value: "x" } })],
      uniques: [{ id: "u1", columns: ["nope"] }],
    });
    const p = tableProblems(t, validateModel(model(t)));
    expect(p.map((x) => x.text)).toEqual([
      "ชื่อตาราง: ต้องมีชื่อ",
      "คอลัมน์ price: ค่าเริ่มต้นไม่ตรงกับชนิด",
      "ไม่ซ้ำ: อ้างถึงคอลัมน์ที่ไม่มีอยู่",
    ]);
    expect(p.map((x) => x.targets[0])).toEqual(["db-t1-name", "db-t1-c2-default", "db-t1-uq-u1"]);
  });
  test("other tables' issues are not listed", () => {
    const t = table();
    const other = { tableId: "t2", columnId: "c9", field: "name", message: "ต้องมีชื่อ" };
    expect(tableProblems(t, [other])).toEqual([]);
  });
  test("targets per column field (fallbacks after the best one)", () => {
    const t = table();
    const at = (field: string) => problemTargets(t, "db-t1", { tableId: "t1", columnId: "c2", field, message: "" });
    expect(at("type")).toEqual(["db-t1-c2-type"]);
    expect(at("precision")).toEqual(["db-t1-c2-decimal", "db-t1-c2-type"]);
    expect(at("values")).toEqual(["db-t1-c2-enum", "db-t1-c2-type"]);
    expect(at("nullable")).toEqual(["db-t1-c2-null", "db-t1-c2-pk", "db-t1-c2-name"]);
    expect(at("column")).toEqual(["db-t1-c2-name"]);
  });
  test("a table without columns: the item focuses เพิ่มคอลัมน์", () => {
    const t = table({ columns: [], primaryKey: [] });
    const p = tableProblems(t, validateModel(model(t)));
    expect(p.map((x) => x.text)).toEqual(["ต้องมีอย่างน้อย 1 คอลัมน์", "ต้องมีคีย์หลัก"]);
    expect(p.map((x) => x.targets)).toEqual([["db-t1-add-col"], ["db-t1-add-col"]]);
  });
  test("focus skips missing, disabled and unfocusable targets", () => {
    const focused: string[] = [];
    const mk = (id: string, o: { tabIndex?: number; disabled?: boolean } = {}) => {
      const el = {
        id,
        tabIndex: o.tabIndex ?? 0,
        disabled: o.disabled ?? false,
        closest: () => null,
        focus: () => {
          focused.push(id);
          doc.active = el;
        },
        ownerDocument: null as unknown,
      };
      return el;
    };
    const doc = { active: null as unknown, els: {} as Record<string, ReturnType<typeof mk>>, getElementById: (id: string) => doc.els[id] ?? null };
    doc.els = { span: mk("span", { tabIndex: -1 }), off: mk("off", { disabled: true }), ok: mk("ok") };
    for (const e of Object.values(doc.els)) e.ownerDocument = { get activeElement() { return doc.active; } };
    expect(focusProblemTarget(["gone", "span", "off", "ok"], doc as unknown as Document)).toBe(true);
    expect(focused).toEqual(["ok"]);
    expect(focusProblemTarget(["gone"], doc as unknown as Document)).toBe(false);
  });
});

describe("key labels", () => {
  test("no trailing space when a key has no columns", () => {
    const t = table();
    expect(withDetail("แก้ไขไม่ซ้ำ", keyColumnNames(t, []))).toBe("แก้ไขไม่ซ้ำ");
    expect(withDetail("แก้ไขไม่ซ้ำ", keyColumnNames(t, ["c2"]))).toBe("แก้ไขไม่ซ้ำ price");
  });
  test("a missing column is named, never '?'", () => {
    expect(keyColumnNames(table(), ["c2", "nope"])).toBe(`price, ${MISSING_COLUMN}`);
    expect(keyColumnNames(table({ columns: [] }), ["c1"])).toBe(MISSING_COLUMN);
    expect(keyColumnNames(undefined, ["c1"])).toBe(MISSING_COLUMN);
  });
});
