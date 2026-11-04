import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mocked Tauri invoke: records calls; `open_project` returns a minimal doc.
type Call = { cmd: string; args?: Record<string, unknown> };
const calls: Call[] = [];
let saveGate: Promise<void> | null = null;
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === "open_project") {
      return {
        id: "p1", name: "P", createdAt: "t", updatedAt: "t",
        document: {
          version: 1, meta: { title: "P" }, root: "r",
          nodes: { r: { id: "r", type: "page", props: { type: "page", children: [] }, style: {} } },
        },
      };
    }
    if (cmd === "save_project" && saveGate) await saveGate;
    if (cmd === "list_projects") return [];
    return null;
  },
}));
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);

const { useProjectsStore, projectDirty } = await import("../stores/projects-store");
const { addTable, EMPTY_DB_MODEL, nextTableName } = await import("./db-model");

const store = () => useProjectsStore.getState();
const saves = () => calls.filter((c) => c.cmd === "save_project");

beforeEach(async () => {
  calls.length = 0;
  saveGate = null;
  store().closeOpen();
  await store().openProject("p1");
});

describe("Phase 10 dirty = document dirty OR pendingDbModel", () => {
  test("projectDirty truth table", () => {
    expect(projectDirty(false, null)).toBe(false);
    expect(projectDirty(true, null)).toBe(true);
    expect(projectDirty(false, { version: 1, tables: [] })).toBe(true);
    expect(projectDirty(true, {})).toBe(true);
  });

  test("open project starts clean with nothing pending", () => {
    expect(store().dirty).toBe(false);
    expect(store().pendingDbModel).toBeNull();
  });

  test("a pending model dirties; clearing it with a clean document is clean", () => {
    const m = addTable(EMPTY_DB_MODEL).model;
    store().setPendingDbModel(m);
    expect(store().dirty).toBe(true);
    expect(store().pendingDbModel).toBe(m);
    store().setPendingDbModel(null);
    expect(store().dirty).toBe(false);
  });

  test("document edits that return to saved stay dirty while a model is pending", () => {
    const saved = store().openDocument!;
    store().setPendingDbModel(addTable(EMPTY_DB_MODEL).model);
    store().commitOpenTitle("Other");
    expect(store().dirty).toBe(true);
    store().commitOpenTitle(saved.meta.title);
    expect(store().dirty).toBe(true); // document clean, model pending
    store().restoreDocument(saved);
    expect(store().dirty).toBe(true);
  });

  test("save sends dbModel once and clears it; a plain save sends no key", async () => {
    await store().saveOpenProject();
    expect(saves()).toHaveLength(1);
    expect("dbModel" in saves()[0]!.args!).toBe(false);

    const m = addTable(EMPTY_DB_MODEL).model;
    store().setPendingDbModel(m);
    expect(await store().saveOpenProject()).toBe(true);
    expect(saves()).toHaveLength(2);
    expect(saves()[1]!.args!.dbModel).toBe(m);
    expect(store().pendingDbModel).toBeNull();
    expect(store().dirty).toBe(false);
  });

  test("a model edit made during the save stays pending and dirty", async () => {
    let release!: () => void;
    saveGate = new Promise((r) => (release = r));
    const first = addTable(EMPTY_DB_MODEL).model;
    store().setPendingDbModel(first);
    const p = store().saveOpenProject();
    const second = addTable(first).model;
    store().setPendingDbModel(second);
    release();
    expect(await p).toBe(true);
    expect(saves()[0]!.args!.dbModel).toBe(first);
    expect(store().pendingDbModel).toBe(second);
    expect(store().dirty).toBe(true);
  });

  test("a failed save keeps the model pending", async () => {
    const m = addTable(EMPTY_DB_MODEL).model;
    store().setPendingDbModel(m);
    saveGate = Promise.reject("boom");
    saveGate.catch(() => {});
    expect(await store().saveOpenProject()).toBe(false);
    expect(store().pendingDbModel).toBe(m);
    expect(store().dirty).toBe(true);
  });

  test("close and reopen clear the pending model", async () => {
    store().setPendingDbModel(addTable(EMPTY_DB_MODEL).model);
    store().closeOpen();
    expect(store().pendingDbModel).toBeNull();
    expect(store().dirty).toBe(false);
    store().setPendingDbModel({}); // no open project → ignored
    expect(store().pendingDbModel).toBeNull();
    await store().openProject("p1");
    expect(store().pendingDbModel).toBeNull();
  });
});

describe("db-model helpers", () => {
  test("addTable follows §5: table_n, uuid id PK default uuid, created_at now, not null", () => {
    let n = 0;
    const id = () => `id${++n}`;
    const { model, table } = addTable(EMPTY_DB_MODEL, id);
    expect(EMPTY_DB_MODEL.tables).toHaveLength(0);
    expect(model.tables).toEqual([table]);
    expect(table.name).toBe("table_1");
    expect(table.primaryKey).toEqual([table.columns[0]!.id]);
    expect(table.columns).toEqual([
      { id: "id1", name: "id", type: "uuid", nullable: false, default: { kind: "uuid" } },
      { id: "id3", name: "created_at", type: "timestamptz", nullable: false, default: { kind: "now" } },
    ]);
    const two = addTable(model).model;
    expect(two.tables[1]!.name).toBe("table_2");
    expect(nextTableName({ version: 1, tables: [{ ...table, name: "table_2" }] })).toBe("table_1");
    expect(new Set(two.tables.flatMap((t) => [t.id, ...t.columns.map((c) => c.id)])).size).toBe(6);
  });
});

describe("db-model-store (step 2 fix A)", () => {
  test("เพิ่มตาราง marks pending and announces the new table name", async () => {
    const { useDbModelStore } = await import("./db-model-store");
    const { useEditorStore } = await import("../stores/editor-store");
    await useDbModelStore.getState().ensureLoaded("p1");
    expect(calls.some((c) => c.cmd === "db_model_load" && c.args?.projectId === "p1")).toBe(true);
    expect(useDbModelStore.getState().status).toBe("ready");
    const id = useDbModelStore.getState().addTable();
    expect(id).not.toBeNull();
    expect(store().dirty).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(useEditorStore.getState().announcement).toBe("เพิ่มตาราง table_1 แล้ว");
    useDbModelStore.getState().addTable();
    await new Promise((r) => setTimeout(r, 5));
    expect(useEditorStore.getState().announcement).toBe("เพิ่มตาราง table_2 แล้ว");
  });
});

describe("model undo history (§8, step 3)", () => {
  test("one commit = one step; undo to saved clears pending; redo restores", async () => {
    const { useDbModelStore, DB_HISTORY_LIMIT } = await import("./db-model-store");
    const { updateTable } = await import("./db-model");
    const db = () => useDbModelStore.getState();
    await db().ensureLoaded("p1");
    const saved = db().model;
    expect(db().past).toHaveLength(0);
    const id = db().addTable()!;
    db().commit(updateTable(db().model, id, { name: "users" }));
    expect(db().past).toHaveLength(2);
    expect(store().dirty).toBe(true);
    expect(db().undo()).toBe(true);
    expect(db().model.tables[0]!.name).toBe("table_1");
    expect(db().undo()).toBe(true);
    expect(db().model).toBe(saved);
    expect(store().pendingDbModel).toBeNull();
    expect(store().dirty).toBe(false);
    expect(db().undo()).toBe(false);
    expect(db().redo()).toBe(true);
    expect(db().redo()).toBe(true);
    expect(db().model.tables[0]!.name).toBe("users");
    expect(db().redo()).toBe(false);
    // A new commit clears redo; same-reference commit is not a step.
    db().undo();
    db().commit(db().model);
    expect(db().future).toHaveLength(1);
    db().commit(updateTable(db().model, id, { label: "ผู้ใช้" }));
    expect(db().future).toHaveLength(0);
    // Page history is untouched by model edits.
    const { useEditorStore } = await import("../stores/editor-store");
    expect(useEditorStore.getState().past).toHaveLength(0);
    // Cap.
    for (let i = 0; i < DB_HISTORY_LIMIT + 20; i++) db().commit(updateTable(db().model, id, { label: `l${i}` }));
    expect(db().past).toHaveLength(DB_HISTORY_LIMIT);
  });

  test("after a save, undo back to the saved model is clean; close clears the stack", async () => {
    const { useDbModelStore } = await import("./db-model-store");
    const db = () => useDbModelStore.getState();
    await db().ensureLoaded("p1");
    db().addTable();
    expect(await store().saveOpenProject()).toBe(true);
    const savedNow = db().model;
    expect(db().savedModel).toBe(savedNow);
    db().addTable();
    expect(store().dirty).toBe(true);
    db().undo();
    expect(db().model).toBe(savedNow);
    expect(store().dirty).toBe(false);
    store().closeOpen();
    expect(db().past).toHaveLength(0);
    expect(db().status).toBe("idle");
  });
});

describe("announcements for table and column edits (step 3 fix 1)", () => {
  const said = async () => {
    await new Promise((r) => setTimeout(r, 5));
    const { useEditorStore } = await import("../stores/editor-store");
    return useEditorStore.getState().announcement;
  };
  test("rename / move / delete tables and columns announce once on commit", async () => {
    const { useDbModelStore } = await import("./db-model-store");
    const db = () => useDbModelStore.getState();
    await db().ensureLoaded("p1");
    const a = db().addTable()!;
    const b = db().addTable()!;
    expect(await said()).toBe("เพิ่มตาราง table_2 แล้ว");

    const steps = db().past.length;
    db().renameTable(a, "Users");
    expect(await said()).toBe("เปลี่ยนชื่อเป็น users แล้ว");
    expect(db().past.length).toBe(steps + 1);
    db().renameTable(a, "users"); // unchanged → no step, no announcement
    expect(db().past.length).toBe(steps + 1);

    db().moveTable(b, -1);
    expect(await said()).toBe("เลื่อน table_2 ไปลำดับ 1 จาก 2");
    db().moveTable(b, -1); // already first → no-op
    expect(db().model.tables[0]!.id).toBe(b);

    const col = db().addColumn(a)!;
    expect(await said()).toBe("เพิ่มคอลัมน์ column_1 แล้ว");
    db().renameColumn(a, col, "Email Address");
    expect(await said()).toBe("เปลี่ยนชื่อเป็น email_address แล้ว");
    db().moveColumn(a, col, -1);
    expect(await said()).toBe("เลื่อน email_address ไปลำดับ 2 จาก 3");
    db().removeColumn(a, col);
    expect(await said()).toBe("ลบคอลัมน์ email_address แล้ว");
    db().removeTable(b);
    expect(await said()).toBe("ลบตาราง table_2 แล้ว");
  });

  test("palette bridge reflects model undo/redo and routes to the model only", async () => {
    const { useDbModelStore } = await import("./db-model-store");
    const { useEditorStore } = await import("../stores/editor-store");
    const db = () => useDbModelStore.getState();
    const bridge = () => useEditorStore.getState().modelHistory!;
    await db().ensureLoaded("p1");
    expect(bridge()).toMatchObject({ canUndo: false, canRedo: false });
    db().addTable();
    expect(bridge()).toMatchObject({ canUndo: true, canRedo: false });
    bridge().undo();
    expect(db().model.tables).toHaveLength(0);
    expect(bridge()).toMatchObject({ canUndo: false, canRedo: true });
    bridge().redo();
    expect(db().model.tables).toHaveLength(1);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });
});

describe("step 4 recheck fixes", () => {
  const said = async () => {
    await new Promise((r) => setTimeout(r, 5));
    const { useEditorStore } = await import("../stores/editor-store");
    return useEditorStore.getState().announcement;
  };

  test("fix 5: column delete announces removed uniques / FKs; table delete announces FKs pointing at it", async () => {
    const { useDbModelStore } = await import("./db-model-store");
    const m = await import("./db-model");
    const db = () => useDbModelStore.getState();
    await db().ensureLoaded("p1");
    const a = db().addTable()!; // table_1: id (PK), created_at
    const b = db().addTable()!; // table_2
    const ta = () => db().model.tables.find((t) => t.id === a)!;
    const tb = () => db().model.tables.find((t) => t.id === b)!;
    const aId = ta().columns[0]!.id;
    const aAt = ta().columns[1]!.id;
    // unique on created_at only
    db().commit(m.addUnique(db().model, a, [aAt], () => "u1").model);
    db().removeColumn(a, aAt);
    expect(await said()).toBe("ลบคอลัมน์ created_at และชุดไม่ซ้ำ 1 ชุดที่ใช้คอลัมน์นี้แล้ว");
    // FK b.id → a.id, plus a unique on a.id+new column
    const fk = { id: "f1", columns: [tb().columns[0]!.id], refTableId: a, refColumns: [aId], onDelete: "no_action" as const };
    db().commit(m.upsertForeignKey(db().model, b, fk));
    const ref = db().model.tables.find((t) => t.id === a)!.columns[0]!;
    expect(ref.id).toBe(aId);
    db().removeColumn(a, aId);
    expect(await said()).toBe("ลบคอลัมน์ id และความสัมพันธ์ 1 รายการที่ใช้คอลัมน์นี้แล้ว");
    db().undo();
    db().commit(m.addUnique(db().model, a, [aId, db().addColumn(a)!], () => "u2").model);
    db().removeColumn(a, aId);
    expect(await said()).toBe("ลบคอลัมน์ id พร้อมชุดไม่ซ้ำ 1 ชุดและความสัมพันธ์ 1 รายการที่ใช้คอลัมน์นี้แล้ว");
    db().undo();
    db().removeTable(a);
    expect(await said()).toBe("ลบตาราง table_1 และความสัมพันธ์ 1 รายการที่อ้างถึงตารางนี้แล้ว");
    expect(tb().foreignKeys).toEqual([]);
  });
});

describe("fail 1: no-op commits never record history", () => {
  test("same object or same content: past unchanged, not pending", async () => {
    const { useDbModelStore } = await import("./db-model-store");
    const db = () => useDbModelStore.getState();
    await db().ensureLoaded("p1");
    db().addTable();
    const past = db().past.length;
    db().commit(db().model);
    db().commit(JSON.parse(JSON.stringify(db().model)));
    expect(db().past.length).toBe(past);
    expect(db().undo()).toBe(true);
    expect(db().redo()).toBe(true);
    expect(db().past.length).toBe(past);
  });
});

describe("C: page history group that ends at its start value leaves no step", () => {
  test("type then revert (native undo / typed back) → no step; normal edit → exactly one", async () => {
    const { useEditorStore } = await import("../stores/editor-store");
    const { beginHistoryGroup, endHistoryGroup } = await import("./history");
    const ed = () => useEditorStore.getState();
    ed().clearHistory();
    const start = store().openDocument!;
    const edit = (w: number) => {
      const d = store().openDocument!;
      store().updateOpenDocument({ ...d, nodes: { ...d.nodes, __probe: { width: w } as never } });
    };
    // Session 1: 1 → 12 → back to the start content.
    let g = beginHistoryGroup();
    edit(1);
    edit(12);
    const d = store().openDocument!;
    const { __probe: _, ...rest } = d.nodes as Record<string, unknown>;
    store().updateOpenDocument({ ...d, nodes: rest as typeof d.nodes });
    endHistoryGroup(g);
    expect(ed().past.length).toBe(0);
    expect(store().openDocument!.nodes).toBe(start.nodes); // pre-group object back
    expect(store().dirty).toBe(false);
    // Session 2: a real change → one step.
    g = beginHistoryGroup();
    edit(5);
    edit(50);
    endHistoryGroup(g);
    expect(ed().past.length).toBe(1);
  });
});
