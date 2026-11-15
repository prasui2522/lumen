/**
 * Form↔DB data client: Preview → postMessage; export → localStorage or Supabase (Phase C).
 */
import { PREVIEW_FLAG } from "@/lib/render-node";
import { isSupabaseBackend, supabaseConfig, supabaseQuery } from "@/lib/wb-db-supabase";

export type RowValues = Record<string, string | number | boolean | null>;

export type DbQueryRequest =
  | { requestId: string; kind: "listMeta"; tableId: string }
  | { requestId: string; kind: "rows"; tableId: string }
  | { requestId: string; kind: "lookupOptions"; tableId: string; valueColumnId: string; labelColumnId: string }
  | { requestId: string; kind: "related"; parentTableId: string; fkId: string; parentKey: string }
  | { requestId: string; kind: "model" };

export type DbQueryResult = {
  requestId: string;
  ok: boolean;
  error?: string;
  model?: { version: number; tables: { id: string; name: string; columns: { id: string; name: string; label?: string }[]; primaryKey: string[]; foreignKeys: { id: string; columns: string[]; refTableId: string; refColumns: string[] }[] }[] };
  tableName?: string;
  columns?: { columnId: string; name: string; label: string }[];
  pkColumnId?: string;
  lookups?: Record<string, { tableId: string; valueColumnId: string; labelColumnId: string }>;
  rows?: { rowid: number; values: RowValues }[];
  refRows?: Record<string, RowValues[]>;
  options?: { value: string; label: string }[];
  childTableName?: string;
  editPathPrefix?: string;
};

const STORE_KEY = "wb.db.local.v1";

type LocalStore = Record<string, { rowid: number; values: RowValues }[]>;

function readLocal(): LocalStore {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as LocalStore;
  } catch {
    return {};
  }
}

function writeLocal(s: LocalStore) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

function inPreview(): boolean {
  return (globalThis as Record<string, unknown>)[PREVIEW_FLAG] === true;
}

let seq = 0;
const pending = new Map<string, (r: DbQueryResult) => void>();

/** Call once from preview-runtime to route wb:dbResult. */
export function acceptDbResult(data: unknown) {
  const r = data as DbQueryResult;
  if (!r || typeof r !== "object" || typeof r.requestId !== "string") return;
  const fn = pending.get(r.requestId);
  if (fn) {
    pending.delete(r.requestId);
    fn(r);
  }
}

function previewQuery(req: Omit<DbQueryRequest, "requestId">): Promise<DbQueryResult> {
  const requestId = `q${++seq}`;
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    window.parent.postMessage({ type: "wb:dbQuery", ...req, requestId }, "*");
    window.setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        resolve({ requestId, ok: false, error: "หมดเวลาสอบถามฐานข้อมูล" });
      }
    }, 8000);
  });
}

function localQuery(req: Omit<DbQueryRequest, "requestId"> & { requestId: string }): DbQueryResult {
  const store = readLocal();
  const model = exportedModel;
  if (req.kind === "model") {
    return { requestId: req.requestId, ok: true, model };
  }
  if (req.kind === "rows") {
    const rows = store[req.tableId] ?? [];
    const refRows: Record<string, RowValues[]> = {};
    const table = model?.tables.find((t) => t.id === req.tableId);
    if (table) {
      for (const fk of table.foreignKeys) {
        if (fk.columns.length !== 1) continue;
        refRows[fk.refTableId] = (store[fk.refTableId] ?? []).map((r) => r.values);
      }
    }
    return { requestId: req.requestId, ok: true, rows, refRows, tableName: table?.name };
  }
  if (req.kind === "lookupOptions") {
    const rows = store[req.tableId] ?? [];
    return {
      requestId: req.requestId,
      ok: true,
      options: rows.map((r) => ({
        value: String(r.values[req.valueColumnId] ?? ""),
        label: String(r.values[req.labelColumnId] ?? r.values[req.valueColumnId] ?? ""),
      })),
    };
  }
  if (req.kind === "related") {
    const child = model?.tables.find((t) => t.foreignKeys.some((f) => f.id === req.fkId));
    const fk = child?.foreignKeys.find((f) => f.id === req.fkId);
    if (!child || !fk || fk.columns.length !== 1) {
      return { requestId: req.requestId, ok: true, rows: [], columns: [] };
    }
    const childCol = fk.columns[0]!;
    const rows = (store[child.id] ?? []).filter(
      (r) => String(r.values[childCol] ?? "") === req.parentKey,
    );
    const cols = child.columns
      .filter((c) => !child.primaryKey.includes(c.id))
      .slice(0, 4)
      .map((c) => ({ columnId: c.id, name: c.name, label: c.label || c.name }));
    return {
      requestId: req.requestId,
      ok: true,
      rows,
      columns: cols,
      childTableName: child.name,
      editPathPrefix: `/admin/${child.name}/edit`,
      pkColumnId: child.primaryKey[0],
    };
  }
  if (req.kind === "listMeta") {
    const table = model?.tables.find((t) => t.id === req.tableId);
    if (!table) {
      return {
        requestId: req.requestId,
        ok: true,
        tableName: req.tableId,
        columns: [],
        lookups: {},
        editPathPrefix: "#",
      };
    }
    const lookups: Record<string, { tableId: string; valueColumnId: string; labelColumnId: string }> = {};
    for (const fk of table.foreignKeys) {
      if (fk.columns.length !== 1 || fk.refColumns.length !== 1) continue;
      const ref = model?.tables.find((t) => t.id === fk.refTableId);
      const labelCol =
        ref?.columns.find((c) => /^(name|title|code|label)$/i.test(c.name))?.id ?? ref?.columns[1]?.id;
      if (!ref || !labelCol) continue;
      lookups[fk.columns[0]!] = {
        tableId: ref.id,
        valueColumnId: fk.refColumns[0]!,
        labelColumnId: labelCol,
      };
    }
    const columns = table.columns
      .filter((c) => !table.primaryKey.includes(c.id) && c.name !== "created_at" && c.name !== "password_hash")
      .slice(0, 8)
      .map((c) => ({ columnId: c.id, name: c.name, label: c.label || c.name }));
    return {
      requestId: req.requestId,
      ok: true,
      tableName: table.name,
      columns,
      pkColumnId: table.primaryKey[0],
      lookups,
      editPathPrefix: `/admin/${table.name}/edit`,
    };
  }
  return { requestId: req.requestId, ok: true };
}

export async function dbQuery(req: Omit<DbQueryRequest, "requestId">): Promise<DbQueryResult> {
  if (inPreview()) return previewQuery(req);
  const requestId = `q${++seq}`;
  if (isSupabaseBackend()) {
    const cfg = supabaseConfig();
    if (cfg) return supabaseQuery(cfg, exportedModel, { ...req, requestId });
  }
  return localQuery({ ...req, requestId });
}

/** Export stub: append a row after dbSubmit. */
export function localInsert(tableId: string, values: RowValues): number {
  const store = readLocal();
  const rows = store[tableId] ?? [];
  const rowid = (rows.reduce((m, r) => Math.max(m, r.rowid), 0) || 0) + 1;
  rows.push({ rowid, values });
  store[tableId] = rows;
  writeLocal(store);
  return rowid;
}

export function localRead(tableId: string): { rowid: number; values: RowValues }[] {
  return readLocal()[tableId] ?? [];
}

export function localWrite(tableId: string, rows: { rowid: number; values: RowValues }[]) {
  const store = readLocal();
  store[tableId] = rows;
  writeLocal(store);
}

/** Optional DbModel attached to site.json / Preview payload. */
let exportedModel: DbQueryResult["model"] | undefined;

export function setExportedDbModel(model: DbQueryResult["model"] | undefined) {
  exportedModel = model;
}

export function getExportedDbModel() {
  return exportedModel;
}

export function resolveLabel(
  columnId: string,
  value: string | number | boolean | null | undefined,
  lookups: Record<string, { tableId: string; valueColumnId: string; labelColumnId: string }>,
  refRows: Record<string, RowValues[]>,
): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value);
  const lookup = lookups[columnId];
  if (!lookup) return raw;
  const rows = refRows[lookup.tableId] ?? [];
  const hit = rows.find((r) => String(r[lookup.valueColumnId] ?? "") === raw);
  if (!hit) return raw;
  const label = hit[lookup.labelColumnId];
  return label === null || label === undefined || label === "" ? raw : String(label);
}

export function filterBySearch(
  rows: { rowid: number; values: RowValues }[],
  query: string,
  columnIds: string[],
  lookups: Record<string, { tableId: string; valueColumnId: string; labelColumnId: string }>,
  refRows: Record<string, RowValues[]>,
): { rowid: number; values: RowValues }[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    columnIds.some((colId) => {
      const raw = row.values[colId];
      const label = resolveLabel(colId, raw, lookups, refRows);
      return String(raw ?? "").toLowerCase().includes(q) || label.toLowerCase().includes(q);
    }),
  );
}
