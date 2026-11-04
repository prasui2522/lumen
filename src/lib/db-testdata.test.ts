import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mocked Tauri invoke: records test-file IPC.
type Call = { cmd: string; args?: Record<string, unknown> };
const calls: Call[] = [];
let openStatus = "ready";
let planReply: unknown = null;
let applyError: string | null = null;
let resetError: string | null = null;
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === "db_test_plan") return planReply;
    if (cmd === "db_test_update") return { value: String(args?.value).toLowerCase() };
    if (cmd === "db_test_apply") {
      if (applyError) throw applyError;
      return { status: "ready", tables: [{ tableId: "t1", rowCount: 2 }] };
    }
    if (cmd === "db_test_reset" && resetError) throw resetError;
    if (cmd === "db_test_open" || cmd === "db_test_reset") return { status: cmd === "db_test_reset" ? "ready" : openStatus, tables: [] };
    if (cmd === "open_project")
      return {
        id: args?.id, name: "P", createdAt: "t", updatedAt: "t",
        document: { version: 1, meta: { title: "P" }, root: "r", nodes: { r: { id: "r", type: "page", props: { type: "page", children: [] }, style: {} } } },
      };
    return null;
  },
}));

const T = await import("./db-testdata");
const { addTable, EMPTY_DB_MODEL } = await import("./db-model");
const { useProjectsStore } = await import("../stores/projects-store");
const ts = () => T.useTestDataStore.getState();
const testCalls = () => calls.filter((c) => c.cmd.startsWith("db_test_")).map((c) => c.cmd);

const col = (over: Record<string, unknown>) => ({ id: "c", name: "c", type: "text", nullable: true, ...over }) as never;
const page = { hasPrev: false, hasNext: false };

beforeEach(() => {
  calls.length = 0;
  openStatus = "ready";
  T.useTestDataStore.setState({ status: "closed", projectId: null, openedModel: null, error: null, tab: "structure" });
});

describe("test file lifecycle (store)", () => {
  test("nothing is opened until the grid asks; same model opens once", async () => {
    expect(testCalls()).toEqual([]);
    const m = addTable(EMPTY_DB_MODEL).model;
    await ts().open("p1", m);
    await ts().open("p1", m);
    expect(testCalls()).toEqual(["db_test_open"]);
    expect(ts().status).toBe("ready");
    // A changed model re-checks (Rust says stale).
    openStatus = "stale";
    await ts().open("p1", { ...m });
    expect(ts().status).toBe("stale");
  });

  test("close is idempotent and sends no redundant IPC", async () => {
    ts().close();
    expect(testCalls()).toEqual([]);
    await ts().open("p1", addTable(EMPTY_DB_MODEL).model);
    ts().close();
    ts().close();
    expect(testCalls()).toEqual(["db_test_open", "db_test_close"]);
    expect(ts().status).toBe("closed");
  });

  test("project switch closes the file and resets the tab", async () => {
    await useProjectsStore.getState().openProject("p1");
    await ts().open("p1", addTable(EMPTY_DB_MODEL).model);
    ts().setTab("data");
    calls.length = 0;
    await useProjectsStore.getState().openProject("p2");
    expect(testCalls()).toContain("db_test_close");
    expect(ts().tab).toBe("structure");
  });

  test("reset → ready", async () => {
    openStatus = "corrupt";
    const m = addTable(EMPTY_DB_MODEL).model;
    await ts().open("p1", m);
    expect(ts().status).toBe("corrupt");
    expect(await ts().reset("p1", m)).toBe(true);
    expect(ts().status).toBe("ready");
  });
});

describe("grid keyboard model (§6)", () => {
  const at = { row: 1, col: 2 };
  test("arrows move and clamp", () => {
    expect(T.gridMove("ArrowDown", false, at, 3, 4, page)).toEqual({ pos: { row: 2, col: 2 } });
    expect(T.gridMove("ArrowDown", false, { row: 2, col: 2 }, 3, 4, page)).toEqual({ pos: { row: 2, col: 2 } });
    expect(T.gridMove("ArrowLeft", false, { row: 0, col: 0 }, 3, 4, page)).toEqual({ pos: { row: 0, col: 0 } });
    expect(T.gridMove("ArrowRight", false, at, 3, 4, page)).toEqual({ pos: { row: 1, col: 3 } });
  });
  test("Home/End row ends; Ctrl+Home/End grid ends", () => {
    expect(T.gridMove("Home", false, at, 3, 4, page)).toEqual({ pos: { row: 1, col: 0 } });
    expect(T.gridMove("End", false, at, 3, 4, page)).toEqual({ pos: { row: 1, col: 3 } });
    expect(T.gridMove("Home", true, at, 3, 4, page)).toEqual({ pos: { row: 0, col: 0 } });
    expect(T.gridMove("End", true, at, 3, 4, page)).toEqual({ pos: { row: 2, col: 3 } });
  });
  test("PageUp/PageDown change page when there is one", () => {
    expect(T.gridMove("PageDown", false, at, 3, 4, { hasPrev: false, hasNext: true })).toEqual({ page: 1, pos: { row: 0, col: 2 } });
    expect(T.gridMove("PageUp", false, at, 3, 4, { hasPrev: true, hasNext: false })).toEqual({ page: -1, pos: { row: 0, col: 2 } });
    expect(T.gridMove("PageDown", false, at, 3, 4, page)).toEqual({ pos: { row: 2, col: 2 } });
  });
  test("Tab and other keys are not handled (Tab leaves the grid)", () => {
    expect(T.gridMove("Tab", false, at, 3, 4, page)).toBeNull();
    expect(T.gridMove("a", false, at, 3, 4, page)).toBeNull();
  });
  test("after commit: Enter down, Tab right, Shift+Tab left (never into the checkbox column)", () => {
    expect(T.afterCommit("enter", at, 3, 4)).toEqual({ row: 2, col: 2 });
    expect(T.afterCommit("enter", { row: 2, col: 2 }, 3, 4)).toEqual({ row: 2, col: 2 });
    expect(T.afterCommit("tab", { row: 0, col: 3 }, 3, 4)).toEqual({ row: 0, col: 3 });
    expect(T.afterCommit("shift-tab", { row: 0, col: 1 }, 3, 4)).toEqual({ row: 0, col: 1 });
  });
});

describe("new row target (focus after เพิ่มแถว)", () => {
  const cols = [col({ id: "i", type: "identity" }), col({ id: "n" })];
  test("same page, first editable column skips identity", () => {
    expect(T.newRowTarget(0, cols)).toEqual({ offset: 0, col: 2 });
    expect(T.newRowTarget(99, cols)).toEqual({ offset: 0, col: 2 });
  });
  test("row 101 lands on the next page", () => {
    expect(T.newRowTarget(100, [col({})])).toEqual({ offset: 100, col: 1 });
    expect(T.newRowTarget(250, [col({})])).toEqual({ offset: 200, col: 1 });
  });
});

describe("edit logic", () => {
  test("parseInput: empty is NULL except text; booleans; json keeps spaces", () => {
    expect(T.parseInput(col({ type: "integer" }), "  ")).toBeNull();
    expect(T.parseInput(col({ type: "integer" }), " 12 ")).toBe("12");
    expect(T.parseInput(col({ type: "text" }), "")).toBe("");
    expect(T.parseInput(col({ type: "boolean" }), "true")).toBe(true);
    expect(T.parseInput(col({ type: "json" }), ' {"a": 1} ')).toBe(' {"a": 1} ');
  });
  test("display and read-only", () => {
    expect(T.displayValue(true)).toBe("จริง");
    expect(T.displayValue(null)).toBe("");
    expect(T.readOnlyColumn(col({ type: "identity" }))).toBe(true);
    expect(T.readOnlyColumn(col({ type: "uuid" }))).toBe(false);
  });
  test("error line: แถว 3, email: ค่าซ้ำ", () => {
    expect(T.errorLine(3, "ค่าซ้ำ: email")).toBe("แถว 3, email: ค่าซ้ำ");
    expect(T.errorLine(null, "ต้องมีค่า: name")).toBe("name: ต้องมีค่า");
    expect(T.errorLine(1, "ลบไม่ได้ มีแถวอื่นอ้างอิงอยู่")).toBe("แถว 1, ลบไม่ได้ มีแถวอื่นอ้างอิงอยู่");
  });
  test("range label", () => {
    expect(T.rangeLabel(0, 0, 0)).toBe("แถว 0 จาก 0");
    expect(T.rangeLabel(100, 50, 150)).toBe("แถว 101–150 จาก 150");
  });
  test("add-row form: defaults prefilled, identity/uuid อัตโนมัติ, omitted when empty", () => {
    const t = {
      id: "t", name: "t", primaryKey: ["a"], uniques: [], foreignKeys: [],
      columns: [
        { id: "a", name: "id", type: "uuid", nullable: false, default: { kind: "uuid" } },
        { id: "b", name: "n", type: "integer", nullable: true, default: { kind: "literal", value: "5" } },
        { id: "c", name: "on", type: "boolean", nullable: false },
        { id: "d", name: "at", type: "timestamptz", nullable: false, default: { kind: "now" } },
        { id: "e", name: "s", type: "text", nullable: true },
      ],
    } as never;
    const f = T.addRowForm(t);
    expect(f.a).toEqual({ auto: "อัตโนมัติ", text: "" });
    expect(f.b.text).toBe("5");
    expect(f.c.text).toBe("false");
    expect(f.d.auto).toBe("เวลาปัจจุบัน");
    expect(T.insertValues(t, f)).toEqual({ b: "5", c: false });
    expect(T.errorColumn(t, "ต้องมีค่า: n")).toBe("b");
    expect(T.errorColumn(t, "ไม่พบแถวที่อ้างอิง: x")).toBeNull();
  });
});

describe("schema change plan (step 7)", () => {
  const plan = (tables: Partial<import("./db-testdata").PlanTable>[]) => ({
    token: "tok",
    lossless: false,
    tables: tables.map((t, i) => ({ tableId: `t${i}`, name: `t${i}`, rowsLost: 0, valuesLost: 0, dropped: false, ...t })),
  });

  test("wrappers send the exact command names and arg keys", async () => {
    const m = addTable(EMPTY_DB_MODEL).model;
    planReply = plan([{ name: "items", rowsLost: 1 }]);
    const p = await T.planMigration(m);
    expect(p.token).toBe("tok");
    const r = await T.applyMigration("tok");
    expect(r.status).toBe("ready");
    await T.discardMigration("tok");
    expect(calls.filter((c) => c.cmd.startsWith("db_test_"))).toEqual([
      { cmd: "db_test_plan", args: { model: m } },
      { cmd: "db_test_apply", args: { token: "tok" } },
      { cmd: "db_test_discard", args: { token: "tok" } },
    ]);
  });

  test("isLossless mirrors Rust: any lost row or value is lossy; dropping an empty table is not", () => {
    expect(T.isLossless(plan([{}, { dropped: true }]))).toBe(true);
    expect(T.isLossless(plan([{ valuesLost: 1 }]))).toBe(false);
    expect(T.isLossless(plan([{ dropped: true, rowsLost: 3 }]))).toBe(false);
    expect(T.isLossless(plan([]))).toBe(true);
  });

  test("planLines: Thai confirm lines, zero parts left out, dropped tables always listed", () => {
    expect(
      T.planLines(
        plan([
          { name: "items", rowsLost: 2, valuesLost: 5 },
          { name: "users", valuesLost: 1 },
          { name: "orders", rowsLost: 3 },
          { name: "same" },
          { name: "old", dropped: true, rowsLost: 4 },
          { name: "empty", dropped: true },
        ]),
      ),
    ).toEqual([
      "items: ลบ 2 แถว, ล้าง 5 ค่า",
      "users: ล้าง 1 ค่า",
      "orders: ลบ 3 แถว",
      "ตาราง old จะถูกลบ (ลบ 4 แถว)",
      "ตาราง empty จะถูกลบ",
    ]);
    expect(T.planLines(plan([{}]))).toEqual([]);
  });

  test("PLAN_EXPIRED matches the Rust message", () => {
    expect(T.PLAN_EXPIRED).toBe("แผนหมดอายุ");
  });
});

describe("step 6 fix 2", () => {
  test("updateCell resolves to the stored value Rust returns (uuid canonical)", async () => {
    const v = await T.updateCell("t1", 3, "c_id", "0B9F1C2E-1111-4A4A-9A9A-123456789ABC");
    expect(v).toBe("0b9f1c2e-1111-4a4a-9a9a-123456789abc");
    expect(calls.at(-1)).toEqual({
      cmd: "db_test_update",
      args: { tableId: "t1", rowid: 3, columnId: "c_id", value: "0B9F1C2E-1111-4A4A-9A9A-123456789ABC" },
    });
  });

  test("add-row initial focus skips identity and auto (uuid/now/today) fields", () => {
    const t = {
      id: "t", name: "t", primaryKey: ["a"], uniques: [], foreignKeys: [],
      columns: [
        col({ id: "a", type: "uuid", nullable: false, default: { kind: "uuid" } }),
        col({ id: "b", type: "timestamptz", default: { kind: "now" } }),
        col({ id: "c", type: "date", default: { kind: "today" } }),
        col({ id: "d", type: "integer", default: { kind: "literal", value: "5" } }),
        col({ id: "e", type: "text" }),
      ],
    } as never;
    expect(T.firstManualColumn(t, T.addRowForm(t))).toBe("d");
    const idOnly = { id: "t", name: "t", primaryKey: ["k"], uniques: [], foreignKeys: [], columns: [col({ id: "k", type: "identity", nullable: false })] } as never;
    expect(T.firstManualColumn(idOnly, T.addRowForm(idOnly))).toBe("k");
    expect(T.firstManualColumn({ columns: [] } as never, {})).toBeNull();
  });

  test("pager focus: the other button when the pressed one disables, else the grid", () => {
    expect(T.pagerFocus("next", { hasPrev: true, hasNext: false })).toBe("prev");
    expect(T.pagerFocus("prev", { hasPrev: false, hasNext: true })).toBe("next");
    expect(T.pagerFocus("prev", { hasPrev: false, hasNext: false })).toBe("grid");
    expect(T.pagerFocus("next", { hasPrev: true, hasNext: true })).toBeNull();
  });

  test("planLines: thousands separators and ชื่อที่แสดง lookup with SQL-name fallback", () => {
    const p = {
      tables: [
        { tableId: "a", name: "items", rowsLost: 1234, valuesLost: 1234567, dropped: false },
        { tableId: "b", name: "users", rowsLost: 0, valuesLost: 2, dropped: false },
        { tableId: "c", name: "old", rowsLost: 10000, valuesLost: 0, dropped: true },
      ],
    };
    expect(T.planLines(p)).toEqual(["items: ลบ 1,234 แถว, ล้าง 1,234,567 ค่า", "users: ล้าง 2 ค่า", "ตาราง old จะถูกลบ (ลบ 10,000 แถว)"]);
    const labels: Record<string, string> = { a: "สินค้า", b: "  " };
    expect(T.planLines(p, (id) => labels[id])).toEqual([
      "สินค้า: ลบ 1,234 แถว, ล้าง 1,234,567 ค่า",
      "users: ล้าง 2 ค่า",
      "ตาราง old จะถูกลบ (ลบ 10,000 แถว)",
    ]);
  });
});

describe("step 7 UI logic", () => {
  const P = (tables: Partial<import("./db-testdata").PlanTable>[], token = "tok") => ({
    token,
    lossless: false,
    tables: tables.map((t, i) => ({ tableId: `t${i}`, name: `t${i}`, rowsLost: 0, valuesLost: 0, dropped: false, ...t })),
  });
  const cmds = () => calls.filter((c) => c.cmd.startsWith("db_test_")).map((c) => c.cmd);
  const stale = async () => {
    const m = addTable(EMPTY_DB_MODEL).model;
    openStatus = "stale";
    await ts().open("p1", m);
    calls.length = 0;
    return m;
  };
  beforeEach(() => {
    applyError = null;
    T.useTestDataStore.setState({ planning: false, plan: null, planError: null });
  });

  test("updateAction: lossless → apply with no dialog; any loss → confirm", () => {
    expect(T.updateAction(P([{}, { dropped: true }]))).toBe("apply");
    expect(T.updateAction(P([{ valuesLost: 1 }]))).toBe("confirm");
    expect(T.updateAction(P([{ dropped: true, rowsLost: 1 }]))).toBe("confirm");
  });

  test("labelLookup maps table id → ชื่อที่แสดง; planLines falls back to the SQL name", () => {
    const model = { version: 1, tables: [{ id: "a", name: "items", label: "สินค้า" }, { id: "b", name: "users" }] } as never;
    const look = T.labelLookup(model);
    expect(look("a")).toBe("สินค้า");
    expect(look("b")).toBeUndefined();
    expect(look("zz")).toBeUndefined();
    expect(T.labelLookup(null)("a")).toBeUndefined();
    const p = { tables: [
      { tableId: "a", name: "items", rowsLost: 1500, valuesLost: 0, dropped: false },
      { tableId: "b", name: "users", rowsLost: 0, valuesLost: 2, dropped: false },
    ] };
    expect(T.planLines(p, look)).toEqual(["สินค้า: ลบ 1,500 แถว", "users: ล้าง 2 ค่า"]);
  });

  test("planError flags แผนหมดอายุ for a re-plan", () => {
    expect(T.planError("แผนหมดอายุ")).toEqual({ message: "แผนหมดอายุ", expired: true });
    expect(T.planError("อัปเดตข้อมูลทดสอบไม่ได้")).toEqual({ message: "อัปเดตข้อมูลทดสอบไม่ได้", expired: false });
  });

  test("lossless: plan then apply at once, no pending plan, ready with the new model", async () => {
    const m = await stale();
    planReply = P([{}]);
    expect(await ts().update(m)).toBe("applied");
    expect(cmds()).toEqual(["db_test_plan", "db_test_apply"]);
    expect(calls[1].args).toEqual({ token: "tok" });
    expect(ts().status).toBe("ready");
    expect(ts().openedModel).toBe(m);
    expect(ts().plan).toBeNull();
    expect(ts().planning).toBe(false);
  });

  test("lossy: plan is kept for the confirm; apply sends its token", async () => {
    const m = await stale();
    planReply = P([{ rowsLost: 3 }], "t-lossy");
    expect(await ts().update(m)).toBe("confirm");
    expect(cmds()).toEqual(["db_test_plan"]);
    expect(ts().plan?.token).toBe("t-lossy");
    expect(ts().status).toBe("stale");
    expect(await ts().applyPlan()).toBe(true);
    expect(cmds()).toEqual(["db_test_plan", "db_test_apply"]);
    expect(calls.at(-1)?.args).toEqual({ token: "t-lossy" });
    expect(ts().status).toBe("ready");
    expect(ts().plan).toBeNull();
    // The dialog closing after apply finds no plan: no discard.
    ts().discardPlan();
    expect(cmds()).toEqual(["db_test_plan", "db_test_apply"]);
  });

  test("cancel / Esc discards the token and stays stale", async () => {
    const m = await stale();
    planReply = P([{ valuesLost: 1 }], "t-c");
    await ts().update(m);
    ts().discardPlan();
    ts().discardPlan();
    expect(cmds()).toEqual(["db_test_plan", "db_test_discard"]);
    expect(calls.at(-1)?.args).toEqual({ token: "t-c" });
    expect(ts().status).toBe("stale");
    expect(ts().plan).toBeNull();
  });

  test("a new update discards the previous pending plan first", async () => {
    const m = await stale();
    planReply = P([{ valuesLost: 1 }], "t1");
    await ts().update(m);
    planReply = P([{ valuesLost: 1 }], "t2");
    await ts().update(m);
    expect(cmds()).toEqual(["db_test_plan", "db_test_discard", "db_test_plan"]);
    expect(ts().plan?.token).toBe("t2");
  });

  test("apply error (แผนหมดอายุ) shows inline, stays stale, no plan left", async () => {
    const m = await stale();
    planReply = P([{ rowsLost: 1 }], "t-x");
    await ts().update(m);
    applyError = "แผนหมดอายุ";
    expect(await ts().applyPlan()).toBe(false);
    expect(ts().planError).toEqual({ message: "แผนหมดอายุ", expired: true });
    expect(ts().status).toBe("stale");
    expect(ts().plan).toBeNull();
    expect(ts().planning).toBe(false);
    // Re-plan clears the error.
    planReply = P([{}], "t-y");
    applyError = null;
    expect(await ts().update(m)).toBe("applied");
    expect(ts().planError).toBeNull();
  });

  test("close (mode / project switch) while planning: the late plan is discarded", async () => {
    const m = await stale();
    let resolve!: (v: unknown) => void;
    planReply = new Promise((r) => (resolve = r));
    const pending = ts().update(m);
    expect(ts().planning).toBe(true);
    ts().close();
    resolve(P([{ rowsLost: 1 }], "late"));
    expect(await pending).toBe("cancelled");
    expect(cmds()).toEqual(["db_test_plan", "db_test_close", "db_test_discard"]);
    expect(ts().plan).toBeNull();
    expect(ts().planning).toBe(false);
  });

  test("a second click while planning does nothing", async () => {
    const m = await stale();
    let resolve!: (v: unknown) => void;
    planReply = new Promise((r) => (resolve = r));
    const first = ts().update(m);
    expect(await ts().update(m)).toBe("cancelled");
    resolve(P([{}]));
    expect(await first).toBe("applied");
    expect(cmds()).toEqual(["db_test_plan", "db_test_apply"]);
  });
});

describe("step 8 / step 7 fixes: rebuild failure, labels, error text", () => {
  test("a rejected reset resolves false and shows the error banner state", async () => {
    resetError = "ดิสก์เต็ม";
    try {
      const m = addTable(EMPTY_DB_MODEL).model;
      openStatus = "stale";
      await ts().open("p1", m);
      expect(await ts().reset("p1", m)).toBe(false);
      expect(ts().status).toBe("error");
      expect(ts().error).toBe("ดิสก์เต็ม");
    } finally {
      resetError = null;
    }
  });

  test("focus target: opener if connected, else retry, else first banner button", () => {
    const el = (isConnected: boolean, id: string) => ({ isConnected, id });
    const opener = el(false, "opener"); // swapped out by the error banner
    const retry = el(true, "retry");
    const first = el(true, "first");
    expect(T.firstConnected(el(true, "opener"), retry, first)?.id).toBe("opener");
    expect(T.firstConnected(opener, retry, first)?.id).toBe("retry");
    expect(T.firstConnected(null, null, first)?.id).toBe("first");
    expect(T.firstConnected(opener, null, undefined)).toBeNull();
  });

  test("a failed reset keeps its error text for the open confirm (no doubled prefix)", async () => {
    resetError = "เปิดข้อมูลทดสอบไม่ได้";
    try {
      const m = addTable(EMPTY_DB_MODEL).model;
      await ts().open("p1", m);
      expect(await ts().reset("p1", m)).toBe(false);
      expect(T.rebuildErrorText("ล้างข้อมูลทดสอบไม่ได้", ts().error)).toBe("ล้างข้อมูลทดสอบไม่ได้ ลองกดอีกครั้ง หรือกด ยกเลิก");
    } finally {
      resetError = null;
    }
    expect(T.rebuildErrorText("ล้างข้อมูลทดสอบไม่ได้", "เปิดข้อมูลทดสอบไม่ได้: ดิสก์เต็ม")).toBe("ล้างข้อมูลทดสอบไม่ได้: ดิสก์เต็ม");
    expect(T.rebuildErrorText("สร้างไฟล์ข้อมูลทดสอบใหม่ไม่ได้", "ดิสก์เต็ม")).toBe("สร้างไฟล์ข้อมูลทดสอบใหม่ไม่ได้: ดิสก์เต็ม");
  });

  test("open-error banner body never repeats its title", () => {
    expect(T.openErrorText("เปิดข้อมูลทดสอบไม่ได้")).not.toContain("เปิดข้อมูลทดสอบไม่ได้");
    expect(T.openErrorText("เปิดข้อมูลทดสอบไม่ได้")).toContain("ลองอีกครั้ง");
    expect(T.openErrorText(null)).toContain("ลองอีกครั้ง");
    expect(T.openErrorText("เปิดข้อมูลทดสอบไม่ได้: permission denied")).toBe("permission denied");
    expect(T.openErrorText("ยังไม่ได้เปิดข้อมูลทดสอบ")).toBe("ยังไม่ได้เปิดข้อมูลทดสอบ");
  });

  test("plan error: no prefix when Rust already starts with อัปเดตข้อมูลทดสอบไม่ได้", () => {
    expect(T.planErrorText("อัปเดตข้อมูลทดสอบไม่ได้")).toBe("อัปเดตข้อมูลทดสอบไม่ได้");
    expect(T.planErrorText("อัปเดตข้อมูลทดสอบไม่ได้: ดิสก์เต็ม")).toBe("อัปเดตข้อมูลทดสอบไม่ได้: ดิสก์เต็ม");
    expect(T.planErrorText("ดิสก์เต็ม")).toBe("อัปเดตข้อมูลทดสอบไม่ได้: ดิสก์เต็ม");
  });

  test("dropped table label: NEW model, then OLD model, then the SQL name", () => {
    const next = { tables: [{ id: "a", name: "items", label: "สินค้าใหม่" }, { id: "b", name: "users", label: " " }] } as never;
    const old = {
      tables: [
        { id: "a", name: "items", label: "สินค้า" },
        { id: "b", name: "users", label: "ผู้ใช้" },
        { id: "g", name: "gone", label: "ตารางเก่า" },
      ],
    } as never;
    const look = T.labelLookup(next, old);
    expect(look("a")).toBe("สินค้าใหม่");
    expect(look("b")).toBe("ผู้ใช้");
    expect(look("g")).toBe("ตารางเก่า");
    expect(look("x")).toBeUndefined();
    const p = { tables: [
      { tableId: "g", name: "gone", rowsLost: 0, valuesLost: 0, dropped: true },
      { tableId: "x", name: "temp", rowsLost: 3, valuesLost: 0, dropped: true },
    ] };
    expect(T.planLines(p, look)).toEqual(["ตาราง ตารางเก่า จะถูกลบ", "ตาราง temp จะถูกลบ (ลบ 3 แถว)"]);
    expect(T.planLines(p, T.labelLookup(next, null, undefined))).toEqual(["ตาราง gone จะถูกลบ", "ตาราง temp จะถูกลบ (ลบ 3 แถว)"]);
  });

  test("appliedModel: the model the file was last ready with (old labels for a later plan)", async () => {
    const m1 = addTable(EMPTY_DB_MODEL).model;
    await ts().open("p1", m1);
    expect(ts().appliedModel).toBe(m1);
    openStatus = "stale";
    const m2 = { ...m1, tables: [] };
    await ts().open("p1", m2);
    expect(ts().status).toBe("stale");
    expect(ts().appliedModel).toBe(m1);
    planReply = { token: "t", lossless: true, tables: [] };
    expect(await ts().update(m2)).toBe("applied");
    expect(ts().appliedModel).toBe(m2);
    ts().close();
    expect(ts().appliedModel).toBeNull();
  });
});
