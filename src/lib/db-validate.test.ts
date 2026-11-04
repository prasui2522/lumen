import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decimalFits, identifierError, isI64, normalizeIdentifier, PG_RESERVED, SYSTEM_NAMES, validateModel } from "./db-validate";
import {
  addColumn,
  addTable,
  EMPTY_DB_MODEL,
  moveColumn,
  moveTable,
  removeColumn,
  removeTable,
  setColumnType,
  updateColumn,
  updateTable,
  type DbModel,
} from "./db-model";
import { dbUndoAction } from "./db-shortcuts";

const root = join(import.meta.dir, "../../src-tauri/src");
const fixture = JSON.parse(readFileSync(join(root, "fixtures/dbmodel/validation.json"), "utf8")) as {
  cases: { name: string; model: DbModel; issues: unknown[] }[];
};

describe("TS validation mirror equals Rust (shared fixture)", () => {
  test("fixture has cases, valid and invalid", () => {
    expect(fixture.cases.length).toBeGreaterThan(60);
    expect(fixture.cases.some((c) => c.issues.length === 0)).toBe(true);
  });
  for (const c of fixture.cases) {
    test(c.name, () => expect(validateModel(c.model)).toEqual(c.issues as never));
  }
  test("PG_RESERVED and SYSTEM_NAMES equal the Rust lists", () => {
    const rs = readFileSync(join(root, "dbmodel.rs"), "utf8");
    const list = (name: string) =>
      [...new RegExp(`${name}: &\\[&str\\] =\\s*&?\\[([^\\]]*)\\]`).exec(rs)![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(list("PG_RESERVED")).toEqual([...PG_RESERVED]);
    expect(list("SYSTEM_NAMES")).toEqual([...SYSTEM_NAMES]);
  });
});

describe("identifier helpers", () => {
  test("normalising lowercases ASCII and turns spaces into _", () => {
    expect(normalizeIdentifier("  First Name ")).toBe("first_name");
    expect(normalizeIdentifier("Email")).toBe("email");
    expect(identifierError(normalizeIdentifier("ชื่อ"))).not.toBeNull();
    expect(identifierError("a".repeat(63))).toBeNull();
    expect(identifierError("a".repeat(64))).not.toBeNull();
  });
  test("i64 and decimal checks match Rust edge cases", () => {
    expect(isI64("9223372036854775807")).toBe(true);
    expect(isI64("9223372036854775808")).toBe(false);
    expect(isI64("+5")).toBe(true);
    expect(isI64("")).toBe(false);
    expect(decimalFits("007.5", 2, 1)).toBe(true);
    expect(decimalFits("10.5", 2, 1)).toBe(false);
    expect(decimalFits("+1", 5, 0)).toBe(false);
  });
});

describe("model edit ops", () => {
  const ids = () => {
    let n = 0;
    return () => `x${++n}`;
  };
  const two = () => {
    const id = ids();
    const a = addTable(EMPTY_DB_MODEL, id).model;
    return addTable(a, id).model;
  };

  test("rename, label and move tables", () => {
    const m = two();
    const [t1, t2] = m.tables;
    const r = updateTable(m, t1!.id, { name: "users", label: "ผู้ใช้" });
    expect(r.tables[0]!.name).toBe("users");
    expect(updateTable(r, t1!.id, { label: "" }).tables[0]).not.toHaveProperty("label");
    expect(moveTable(m, t2!.id, -1).tables.map((t) => t.id)).toEqual([t2!.id, t1!.id]);
    expect(moveTable(m, t1!.id, -1)).toBe(m);
  });

  test("removeTable drops FKs that reference it (one step)", () => {
    let m = two();
    const [t1, t2] = m.tables;
    m = { ...m, tables: [t1!, { ...t2!, foreignKeys: [{ id: "f", columns: [t2!.columns[0]!.id], refTableId: t1!.id, refColumns: [t1!.columns[0]!.id], onDelete: "no_action" }] }] };
    const r = removeTable(m, t1!.id);
    expect(r.tables).toHaveLength(1);
    expect(r.tables[0]!.foreignKeys).toEqual([]);
  });

  test("add / move / type / remove columns", () => {
    const m0 = two();
    const t = m0.tables[0]!;
    const { model: m1, columnId } = addColumn(m0, t.id, () => "nc");
    expect(m1.tables[0]!.columns.at(-1)).toEqual({ id: "nc", name: "column_1", type: "text", nullable: true });
    expect(moveColumn(m1, t.id, "nc", -1).tables[0]!.columns.map((c) => c.id).indexOf(columnId)).toBe(1);
    const dec = setColumnType(m1, t.id, "nc", "decimal").tables[0]!.columns.at(-1)!;
    expect(dec).toMatchObject({ type: "decimal", precision: 12, scale: 2 });
    const en = setColumnType(setColumnType(m1, t.id, "nc", "decimal"), t.id, "nc", "enum").tables[0]!.columns.at(-1)!;
    expect(en).toEqual({ id: "nc", name: "column_1", type: "enum", nullable: true, values: ["ตัวเลือก 1"] });
    const idCol = setColumnType(m1, t.id, t.columns[0]!.id, "integer").tables[0]!.columns[0]!;
    expect(idCol).not.toHaveProperty("default"); // default dropped on type change
    expect(setColumnType(m1, t.id, "nc", "identity").tables[0]!.columns.at(-1)!.nullable).toBe(false);
    expect(updateColumn(m1, t.id, "nc", { nullable: false }).tables[0]!.columns.at(-1)!.nullable).toBe(false);
  });

  test("removeColumn strips PK, uniques and FKs using it", () => {
    let m = two();
    const [t1, t2] = m.tables;
    const pk1 = t1!.columns[0]!.id;
    m = {
      ...m,
      tables: [
        { ...t1!, uniques: [{ id: "u", columns: [pk1, t1!.columns[1]!.id] }] },
        { ...t2!, foreignKeys: [{ id: "f", columns: [t2!.columns[0]!.id], refTableId: t1!.id, refColumns: [pk1], onDelete: "no_action" }] },
      ],
    };
    const r = removeColumn(m, t1!.id, pk1);
    expect(r.tables[0]!.columns).toHaveLength(1);
    expect(r.tables[0]!.primaryKey).toEqual([]);
    expect(r.tables[0]!.uniques).toEqual([]);
    expect(r.tables[1]!.foreignKeys).toEqual([]);
    expect(validateModel(r).some((x) => x.message === "ต้องมีคีย์หลัก")).toBe(true);
  });

  test("defaults stay strings / booleans on the wire", () => {
    const m = two();
    expect(JSON.stringify(m)).not.toMatch(/"value":\d/);
  });
});

describe("undo routing keys (§8)", () => {
  const k = (o: Partial<Parameters<typeof dbUndoAction>[0]>) => ({ key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...o });
  const free = { textTarget: false, overlayOpen: false, nativeOk: false };
  test("Ctrl/Cmd+Z undo, Shift+Z and Ctrl+Y redo", () => {
    expect(dbUndoAction(k({}), free)).toBe("undo");
    expect(dbUndoAction(k({ ctrlKey: false, metaKey: true }), free)).toBe("undo");
    expect(dbUndoAction(k({ shiftKey: true, key: "Z" }), free)).toBe("redo");
    expect(dbUndoAction(k({ key: "y" }), free)).toBe("redo");
  });
  test("text field with its own history passes (native undo); other keys pass", () => {
    expect(dbUndoAction(k({}), { textTarget: true, overlayOpen: false, nativeOk: true })).toBe("pass");
    expect(dbUndoAction(k({}), { textTarget: true, overlayOpen: true, nativeOk: true })).toBe("pass");
    expect(dbUndoAction(k({ ctrlKey: false }), free)).toBe("pass");
    expect(dbUndoAction(k({ altKey: true }), free)).toBe("pass");
    expect(dbUndoAction(k({ key: "s" }), free)).toBe("pass");
  });
  test("fail 1/2: an open overlay or a field without own history BLOCKS (no model step, no cross-field native undo)", () => {
    expect(dbUndoAction(k({}), { textTarget: false, overlayOpen: true, nativeOk: false })).toBe("block");
    expect(dbUndoAction(k({ shiftKey: true, key: "Z" }), { textTarget: false, overlayOpen: true, nativeOk: false })).toBe("block");
    expect(dbUndoAction(k({}), { textTarget: true, overlayOpen: true, nativeOk: false })).toBe("block");
    expect(dbUndoAction(k({}), { textTarget: true, overlayOpen: false, nativeOk: false })).toBe("block");
  });
});

describe("step 4 ops", async () => {
  const m4 = await import("./db-model");
  const base = () => {
    let n = 0;
    const id = () => `k${++n}`;
    const a = m4.addTable(EMPTY_DB_MODEL, id).model;
    const b = m4.addTable(a, id).model;
    return m4.addColumn(b, b.tables[0]!.id, () => "email").model;
  };

  test("PK switch adds in column order and makes the column required; off removes", () => {
    const m = base();
    const t = m.tables[0]!;
    const on = m4.setPrimaryKey(m, t.id, "email", true);
    expect(on.tables[0]!.primaryKey).toEqual([t.columns[0]!.id, "email"]);
    expect(on.tables[0]!.columns.find((c) => c.id === "email")!.nullable).toBe(false);
    expect(m4.setPrimaryKey(on, t.id, "email", true)).toEqual(on);
    const off = m4.setPrimaryKey(m4.setPrimaryKey(on, t.id, "email", false), t.id, t.columns[0]!.id, false);
    expect(off.tables[0]!.primaryKey).toEqual([]);
    expect(validateModel(off).some((x) => x.field === "primaryKey" && x.tableId === t.id)).toBe(true);
  });

  test("defaults: set, string literals, remove; validation sees them", () => {
    const m = base();
    const t = m.tables[0]!;
    const withInt = m4.setColumnType(m, t.id, "email", "integer");
    const d = m4.setColumnDefault(withInt, t.id, "email", { kind: "literal", value: "9007199254740993" });
    expect(JSON.stringify(d)).toContain('"value":"9007199254740993"');
    expect(validateModel(d).filter((x) => x.tableId === t.id)).toEqual([]);
    const bad = m4.setColumnDefault(withInt, t.id, "email", { kind: "literal", value: "1.5" });
    expect(validateModel(bad).some((x) => x.field === "default" && x.columnId === "email")).toBe(true);
    expect(m4.setColumnDefault(d, t.id, "email", undefined).tables[0]!.columns.at(-1)).not.toHaveProperty("default");
  });

  test("uniques add / edit / remove", () => {
    const m = base();
    const t = m.tables[0]!;
    const { model: u, uniqueId } = m4.addUnique(m, t.id, ["email"], () => "u1");
    expect(u.tables[0]!.uniques).toEqual([{ id: "u1", columns: ["email"] }]);
    expect(uniqueId).toBe("u1");
    expect(m4.setUniqueColumns(u, t.id, "u1", ["email", t.columns[1]!.id]).tables[0]!.uniques[0]!.columns).toHaveLength(2);
    expect(m4.removeUnique(u, t.id, "u1").tables[0]!.uniques).toEqual([]);
  });

  test("FK upsert / remove, key options and compatible columns", () => {
    const m = base();
    const [t1, t2] = m.tables;
    const opts = m4.keyOptions(t1!);
    expect(opts).toEqual([{ id: "pk", columns: t1!.primaryKey }]);
    const ref = t1!.columns[0]!;
    expect(m4.compatibleColumns(t2!, ref).map((c) => c.type)).toEqual(["uuid"]);
    const fk = { id: "f1", columns: [t2!.columns[0]!.id], refTableId: t1!.id, refColumns: [ref.id], onDelete: "cascade" as const };
    const withFk = m4.upsertForeignKey(m, t2!.id, fk);
    expect(withFk.tables[1]!.foreignKeys).toEqual([fk]);
    expect(validateModel(withFk)).toEqual([]);
    const edited = m4.upsertForeignKey(withFk, t2!.id, { ...fk, onDelete: "restrict" });
    expect(edited.tables[1]!.foreignKeys).toHaveLength(1);
    expect(edited.tables[1]!.foreignKeys[0]!.onDelete).toBe("restrict");
    expect(m4.removeForeignKey(edited, t2!.id, "f1").tables[1]!.foreignKeys).toEqual([]);
    // Cascade-delete of FKs on table / column delete (same step).
    expect(removeTable(withFk, t1!.id).tables[0]!.foreignKeys).toEqual([]);
    expect(removeColumn(withFk, t1!.id, ref.id).tables[1]!.foreignKeys).toEqual([]);
    const id2 = { ...m4.addColumn(withFk, t1!.id, () => "n").model };
    const uq = m4.addUnique(m4.setColumnType(id2, t1!.id, "n", "integer"), t1!.id, ["n"], () => "uqn").model;
    expect(m4.keyOptions(uq.tables[0]!).map((o) => o.id)).toEqual(["pk", "uq:uqn"]);
    expect(m4.ON_DELETE_LABELS).toEqual({ no_action: "ไม่ทำอะไร", cascade: "ลบตาม", set_null: "ตั้งเป็นว่าง", restrict: "ห้ามลบ" });
  });
});

describe("step 4 recheck helpers", async () => {
  const m4 = await import("./db-model");
  const t = () => m4.addTable(EMPTY_DB_MODEL, (() => { let n = 0; return () => `c${++n}`; })()).table;

  test("fix 2: unchecking every column is no change; same set is no change; order follows columns", () => {
    const tb = t();
    const [id, at] = tb.columns.map((c) => c.id);
    expect(m4.pickResult(tb, [at!], [])).toBeNull();
    expect(m4.pickResult(tb, [], [])).toBeNull();
    expect(m4.pickResult(tb, [at!], [at!])).toBeNull();
    expect(m4.pickResult(tb, [at!], [at!, id!])).toEqual([id, at]);
  });

  test("fix 3: ต้องมีค่า locked while in the PK; PK off may leave it required", () => {
    const m = m4.addTable(EMPTY_DB_MODEL).model;
    const tb = m.tables[0]!;
    const at = tb.columns[1]!;
    expect(m4.nullableLocked(tb, tb.columns[0]!.id)).toBe(true);
    expect(m4.nullableLocked(tb, at.id)).toBe(false);
    const on = m4.setPrimaryKey(m4.updateColumn(m, tb.id, at.id, { nullable: true }), tb.id, at.id, true);
    expect(on.tables[0]!.columns[1]!.nullable).toBe(false);
    const off = m4.setPrimaryKey(on, tb.id, at.id, false);
    expect(m4.nullableLocked(off.tables[0]!, at.id)).toBe(false);
    expect(off.tables[0]!.columns[1]!.nullable).toBe(false);
  });

  test("fix 4: todayLocal uses the local calendar date (fixed clock)", () => {
    // 00:30 local on 2 Jan: UTC may still be 1 Jan in UTC+7, local must win.
    expect(m4.todayLocal(new Date(2026, 0, 2, 0, 30))).toBe("2026-01-02");
    expect(m4.todayLocal(new Date(2024, 1, 29, 23, 59))).toBe("2024-02-29");
    expect(validateModel({ version: 1, tables: [] }).length).toBe(1);
  });
});
