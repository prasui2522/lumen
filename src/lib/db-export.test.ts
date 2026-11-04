import { describe, expect, test } from "bun:test";
import { exportSql, runSqlExport, sqlExportFileName, useSqlExportStore, type SqlExportDeps } from "./db-export";
import { addTable, EMPTY_DB_MODEL } from "./db-model";

function deps(dest: string | null, result: unknown = "/tmp/x/My Site-schema.sql") {
  const log: string[] = [];
  const d: SqlExportDeps = {
    save: async (o) => (log.push(`save ${o.title} ${o.defaultPath} ${o.filters[0]!.extensions[0]}`), dest),
    invoke: async (cmd, a) => {
      log.push(`invoke ${cmd} ${a.destPath}`);
      if (result instanceof Error) throw result;
      return result;
    },
    toast: { success: (m) => log.push(`ok ${m}`), error: (m) => log.push(`err ${m}`) },
  };
  return { d, log };
}

describe("ส่งออก .sql", () => {
  test("file name: <project>-schema.sql via exportFileName rules", () => {
    expect(sqlExportFileName("My: Site")).toBe("My Site-schema.sql");
    expect(sqlExportFileName("")).toBe("website-schema.sql");
  });

  test("0 tables (decision 7) is invalid: no dialog, toast the first error", async () => {
    const { d, log } = deps("/tmp/a.sql");
    expect(await exportSql(EMPTY_DB_MODEL, "p", false, d)).toEqual({ status: "invalid", tableId: null });
    expect(log).toEqual(["err ส่งออกไม่ได้: ต้องมีอย่างน้อย 1 ตาราง"]);
  });

  test("valid model: dialog title, default name, filter; then db_sql_export; success toast", async () => {
    const m = addTable(EMPTY_DB_MODEL).model;
    const { d, log } = deps("/tmp/x/My Site-schema.sql");
    expect(await exportSql(m, "My Site", true, d)).toEqual({ status: "done" });
    expect(log).toEqual([
      "save ส่งออกโครงสร้างฐานข้อมูล My Site-schema.sql sql",
      "invoke db_sql_export /tmp/x/My Site-schema.sql",
      "ok ส่งออกแล้ว: My Site-schema.sql (รวมการแก้ไขที่ยังไม่บันทึก)",
    ]);
  });

  test("cancel writes nothing and says nothing; Rust error toasts", async () => {
    const m = addTable(EMPTY_DB_MODEL).model;
    const c = deps(null);
    expect(await exportSql(m, "p", false, c.d)).toEqual({ status: "cancelled" });
    expect(c.log).toEqual(["save ส่งออกโครงสร้างฐานข้อมูล p-schema.sql sql"]);
    const f = deps("/tmp/a.sql", new Error("บันทึกไฟล์ไม่ได้: denied"));
    expect(await exportSql(m, "p", false, f.d)).toEqual({ status: "failed" });
    expect(f.log.at(-1)).toBe("err ส่งออกไม่สำเร็จ: บันทึกไฟล์ไม่ได้: denied");
  });
});

describe("step 5 recheck", () => {
  test("invalid toast names the table: {table} — {error}", async () => {
    const m = addTable(EMPTY_DB_MODEL).model;
    const bad = { ...m, tables: [{ ...m.tables[0]!, primaryKey: [] }] };
    const { d, log } = deps("/tmp/a.sql");
    const r = await exportSql(bad, "p", false, d);
    expect(r).toEqual({ status: "invalid", tableId: bad.tables[0]!.id });
    expect(log).toEqual(["err ส่งออกไม่ได้: table_1 — ต้องมีคีย์หลัก"]);
  });

  test("runSqlExport ignores a second run while busy (one dialog only)", async () => {
    let release!: (v: string | null) => void;
    const log: string[] = [];
    const d: SqlExportDeps = {
      save: () => (log.push("save"), new Promise((r) => (release = r))),
      invoke: async () => "x",
      toast: { success: () => {}, error: (m) => log.push(m) },
    };
    const { useDbModelStore } = await import("./db-model-store");
    useDbModelStore.setState({ model: addTable(EMPTY_DB_MODEL).model, status: "ready" });
    const first = runSqlExport(d);
    expect(useSqlExportStore.getState().busy).toBe(true);
    expect(await runSqlExport(d)).toBeNull();
    release(null);
    expect(await first).toEqual({ status: "cancelled" });
    expect(useSqlExportStore.getState().busy).toBe(false);
    expect(log).toEqual(["save"]);
  });
});
