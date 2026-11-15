/**
 * Phase 10 DB model types (TS mirror of src-tauri/src/dbmodel.rs) and pure
 * helpers. Imported only from the lazy database chunk (PHASE-10-SPEC §5).
 */

export type DbType =
  | "text" | "integer" | "decimal" | "boolean" | "date"
  | "timestamptz" | "uuid" | "json" | "enum" | "identity"
  /** Asset id string (same registry as image nodes). SQL export → text. */
  | "asset";

/** Literal defaults travel as strings (integers exceed JS safe range); booleans as bool. */
export type DbDefault =
  | { kind: "literal"; value: string | boolean }
  | { kind: "now" | "today" | "uuid" };

export type DbColumnSecret = "argon2id";

export type DbColumn = {
  id: string;
  name: string;
  label?: string;
  type: DbType;
  nullable: boolean;
  default?: DbDefault;
  precision?: number;
  scale?: number;
  values?: string[];
  /** Password column: runtime hashes with Argon2id; never store plaintext. */
  secret?: DbColumnSecret;
};

export type DbForeignKey = {
  id: string;
  columns: string[];
  refTableId: string;
  refColumns: string[];
  onDelete: "no_action" | "cascade" | "set_null" | "restrict";
};

export type DbTable = {
  id: string;
  name: string;
  label?: string;
  columns: DbColumn[];
  primaryKey: string[];
  uniques: { id: string; columns: string[] }[];
  foreignKeys: DbForeignKey[];
};

export type DbModel = { version: 1; tables: DbTable[] };

export const EMPTY_DB_MODEL: DbModel = { version: 1, tables: [] };

const newId = () => crypto.randomUUID();

/** First free `table_n` (n ≥ 1). */
export function nextTableName(model: DbModel): string {
  const used = new Set(model.tables.map((t) => t.name));
  let n = 1;
  while (used.has(`table_${n}`)) n++;
  return `table_${n}`;
}

/**
 * New table per §5: `id` uuid PK (default `uuid`) and `created_at`
 * timestamptz (default `now`, not null). Returns a new model; input untouched.
 */
export function addTable(model: DbModel, id: () => string = newId): { model: DbModel; table: DbTable } {
  const pk = id();
  const table: DbTable = {
    id: id(),
    name: nextTableName(model),
    columns: [
      { id: pk, name: "id", type: "uuid", nullable: false, default: { kind: "uuid" } },
      { id: id(), name: "created_at", type: "timestamptz", nullable: false, default: { kind: "now" } },
    ],
    primaryKey: [pk],
    uniques: [],
    foreignKeys: [],
  };
  return { model: { ...model, tables: [...model.tables, table] }, table };
}

/* ---------------- Step 3 pure edit ops (each returns a new model) ---------------- */

export const DB_TYPE_LABELS: Record<DbType, string> = {
  text: "ข้อความ",
  integer: "จำนวนเต็ม",
  decimal: "ทศนิยม",
  boolean: "จริง/เท็จ",
  date: "วันที่",
  timestamptz: "วันเวลา",
  uuid: "รหัส",
  json: "JSON",
  enum: "ตัวเลือก",
  identity: "ลำดับอัตโนมัติ",
  asset: "ไฟล์/รูป",
};
export const DB_TYPES = Object.keys(DB_TYPE_LABELS) as DbType[];

const mapTable = (model: DbModel, tableId: string, f: (t: DbTable) => DbTable): DbModel => ({
  ...model,
  tables: model.tables.map((t) => (t.id === tableId ? f(t) : t)),
});

function move<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item!);
  return next;
}

export function updateTable(model: DbModel, tableId: string, patch: Partial<Pick<DbTable, "name" | "label">>): DbModel {
  return mapTable(model, tableId, (t) => {
    const next = { ...t, ...patch };
    if (next.label === undefined || next.label === "") delete next.label;
    return next;
  });
}

export function moveTable(model: DbModel, tableId: string, delta: number): DbModel {
  const tables = move(model.tables, model.tables.findIndex((t) => t.id === tableId), delta);
  return tables === model.tables ? model : { ...model, tables };
}

/** Deletes the table and every FK (in any table) that references it — one step. */
export function removeTable(model: DbModel, tableId: string): DbModel {
  return {
    ...model,
    tables: model.tables
      .filter((t) => t.id !== tableId)
      .map((t) =>
        t.foreignKeys.some((fk) => fk.refTableId === tableId)
          ? { ...t, foreignKeys: t.foreignKeys.filter((fk) => fk.refTableId !== tableId) }
          : t,
      ),
  };
}

export function nextColumnName(table: DbTable): string {
  const used = new Set(table.columns.map((c) => c.name));
  let n = 1;
  while (used.has(`column_${n}`)) n++;
  return `column_${n}`;
}

/** New column: `column_n`, ข้อความ, nullable (not ต้องมีค่า). */
export function addColumn(model: DbModel, tableId: string, id: () => string = newId): { model: DbModel; columnId: string } {
  const columnId = id();
  return {
    columnId,
    model: mapTable(model, tableId, (t) => ({
      ...t,
      columns: [...t.columns, { id: columnId, name: nextColumnName(t), type: "text", nullable: true }],
    })),
  };
}

export function updateColumn(
  model: DbModel,
  tableId: string,
  columnId: string,
  patch: Partial<Pick<DbColumn, "name" | "label" | "nullable" | "precision" | "scale" | "values">>,
): DbModel {
  return mapTable(model, tableId, (t) => ({
    ...t,
    columns: t.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c)),
  }));
}

/**
 * Type change keeps id/name/nullable, drops the default (step 4 edits it) and
 * any settings of the old type; decimal starts at 12,2, enum at one value,
 * identity is never nullable.
 */
export function setColumnType(model: DbModel, tableId: string, columnId: string, type: DbType): DbModel {
  return mapTable(model, tableId, (t) => ({
    ...t,
    columns: t.columns.map((c) => {
      if (c.id !== columnId || c.type === type) return c;
      const next: DbColumn = { id: c.id, name: c.name, type, nullable: type === "identity" ? false : c.nullable };
      if (c.label !== undefined) next.label = c.label;
      if (type === "decimal") {
        next.precision = 12;
        next.scale = 2;
      }
      if (type === "enum") next.values = ["ตัวเลือก 1"];
      return next;
    }),
  }));
}

export function moveColumn(model: DbModel, tableId: string, columnId: string, delta: number): DbModel {
  return mapTable(model, tableId, (t) => {
    const columns = move(t.columns, t.columns.findIndex((c) => c.id === columnId), delta);
    return columns === t.columns ? t : { ...t, columns };
  });
}

/**
 * Deletes a column and, in the same step, its PK membership, every unique
 * that includes it, and every FK that uses it (local or referencing it).
 */
export function removeColumn(model: DbModel, tableId: string, columnId: string): DbModel {
  return {
    ...model,
    tables: model.tables.map((t) => {
      const own = t.id === tableId;
      const foreignKeys = t.foreignKeys.filter(
        (fk) => !(own && fk.columns.includes(columnId)) && !(fk.refTableId === tableId && fk.refColumns.includes(columnId)),
      );
      if (!own) return foreignKeys.length === t.foreignKeys.length ? t : { ...t, foreignKeys };
      return {
        ...t,
        columns: t.columns.filter((c) => c.id !== columnId),
        primaryKey: t.primaryKey.filter((id) => id !== columnId),
        uniques: t.uniques.filter((u) => !u.columns.includes(columnId)),
        foreignKeys,
      };
    }),
  };
}

/* ---------------- Step 4: keys, uniques, FKs, defaults ---------------- */

export const ON_DELETE_LABELS: Record<DbForeignKey["onDelete"], string> = {
  no_action: "ไม่ทำอะไร",
  cascade: "ลบตาม",
  set_null: "ตั้งเป็นว่าง",
  restrict: "ห้ามลบ",
};

/** PK on: appended in column order position and made ต้องมีค่า. Off: removed. */
export function setPrimaryKey(model: DbModel, tableId: string, columnId: string, on: boolean): DbModel {
  return mapTable(model, tableId, (t) => {
    const has = t.primaryKey.includes(columnId);
    if (on === has) return t;
    if (!on) return { ...t, primaryKey: t.primaryKey.filter((id) => id !== columnId) };
    const order = new Map(t.columns.map((c, i) => [c.id, i] as const));
    const primaryKey = [...t.primaryKey, columnId].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return {
      ...t,
      primaryKey,
      columns: t.columns.map((c) => (c.id === columnId && c.nullable ? { ...c, nullable: false } : c)),
    };
  });
}

/** `undefined` removes the default. Literal values stay strings (booleans as bool). */
export function setColumnDefault(model: DbModel, tableId: string, columnId: string, def: DbDefault | undefined): DbModel {
  return mapTable(model, tableId, (t) => ({
    ...t,
    columns: t.columns.map((c) => {
      if (c.id !== columnId) return c;
      const next = { ...c };
      if (def === undefined) delete next.default;
      else next.default = def;
      return next;
    }),
  }));
}

export function addUnique(model: DbModel, tableId: string, columns: string[], id: () => string = newId): { model: DbModel; uniqueId: string } {
  const uniqueId = id();
  return { uniqueId, model: mapTable(model, tableId, (t) => ({ ...t, uniques: [...t.uniques, { id: uniqueId, columns }] })) };
}

export function setUniqueColumns(model: DbModel, tableId: string, uniqueId: string, columns: string[]): DbModel {
  return mapTable(model, tableId, (t) => ({
    ...t,
    uniques: t.uniques.map((u) => (u.id === uniqueId ? { ...u, columns } : u)),
  }));
}

export function removeUnique(model: DbModel, tableId: string, uniqueId: string): DbModel {
  return mapTable(model, tableId, (t) => ({ ...t, uniques: t.uniques.filter((u) => u.id !== uniqueId) }));
}

/** Replace the FK with the same id, or append it. */
export function upsertForeignKey(model: DbModel, tableId: string, fk: DbForeignKey): DbModel {
  return mapTable(model, tableId, (t) => ({
    ...t,
    foreignKeys: t.foreignKeys.some((f) => f.id === fk.id)
      ? t.foreignKeys.map((f) => (f.id === fk.id ? fk : f))
      : [...t.foreignKeys, fk],
  }));
}

export function removeForeignKey(model: DbModel, tableId: string, fkId: string): DbModel {
  return mapTable(model, tableId, (t) => ({ ...t, foreignKeys: t.foreignKeys.filter((f) => f.id !== fkId) }));
}

/** FK targets in a table: its PK, then each non-empty unique (column ids in key order). */
export function keyOptions(table: DbTable): { id: string; columns: string[] }[] {
  const out: { id: string; columns: string[] }[] = [];
  if (table.primaryKey.length > 0) out.push({ id: "pk", columns: table.primaryKey });
  for (const u of table.uniques) if (u.columns.length > 0) out.push({ id: `uq:${u.id}`, columns: u.columns });
  return out;
}

/** Columns that can pair with `ref` in an FK (identity ↔ integer count as equal). */
export function compatibleColumns(table: DbTable, ref: DbColumn): DbColumn[] {
  const norm = (t: DbType) => (t === "identity" ? "integer" : t);
  return table.columns.filter((c) => norm(c.type) === norm(ref.type));
}

export function newForeignKeyId(): string {
  return newId();
}

/** Local calendar date `YYYY-MM-DD` (not UTC), e.g. the `กำหนดวันที่` prefill. */
export function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Column multi-pick result on close: ids in model column order, or `null`
 * for "no change" (same set, or nothing checked — never an empty set).
 */
export function pickResult(table: DbTable, initial: string[], picked: string[]): string[] | null {
  const ordered = table.columns.map((c) => c.id).filter((id) => picked.includes(id));
  if (ordered.length === 0) return null;
  const same = ordered.length === initial.length && ordered.every((id, i) => id === initial[i]);
  return same ? null : ordered;
}

/** ต้องมีค่า is locked on while the column is in the primary key. */
export function nullableLocked(table: DbTable, columnId: string): boolean {
  return table.primaryKey.includes(columnId);
}

/** What deleting a column also removes: uniques that include it and FKs that use it. */
export function columnDeleteImpact(model: DbModel, tableId: string, columnId: string): { uniques: number; foreignKeys: number } {
  let foreignKeys = 0;
  let uniques = 0;
  for (const t of model.tables) {
    for (const fk of t.foreignKeys) {
      if ((t.id === tableId && fk.columns.includes(columnId)) || (fk.refTableId === tableId && fk.refColumns.includes(columnId)))
        foreignKeys++;
    }
    if (t.id === tableId) uniques = t.uniques.filter((u) => u.columns.includes(columnId)).length;
  }
  return { uniques, foreignKeys };
}

/** FKs in OTHER tables that point at this table (removed with it). */
export function tableDeleteImpact(model: DbModel, tableId: string): number {
  return model.tables
    .filter((t) => t.id !== tableId)
    .reduce((n, t) => n + t.foreignKeys.filter((fk) => fk.refTableId === tableId).length, 0);
}
