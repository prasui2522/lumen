/**
 * Parent-side handler for Preview frame db queries (list / lookup / related).
 */
import type { DbModel, DbTable } from "@/lib/db-model";
import { fetchRows } from "@/lib/db-testdata";
import { findReverseForeignKeys, forwardLookups } from "@/lib/form-db/relationships";
import { ensureTestDbOpen } from "@/lib/form-db/ensure-test-db";
import { listColumnDefs, lookupTableIds, rowsPageToMaps } from "@/lib/form-db/row-utils";
import type { RowValues } from "@/lib/form-db/relationships";

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
  model?: DbModel;
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

function tableOf(model: DbModel, id: string): DbTable | null {
  return model.tables.find((t) => t.id === id) ?? null;
}

export async function handleDbQuery(req: DbQueryRequest): Promise<DbQueryResult> {
  const opened = await ensureTestDbOpen();
  if (!opened.ok) return { requestId: req.requestId, ok: false, error: opened.error };
  const { model } = opened;

  if (req.kind === "model") {
    return { requestId: req.requestId, ok: true, model };
  }

  if (req.kind === "listMeta") {
    const table = tableOf(model, req.tableId);
    if (!table) return { requestId: req.requestId, ok: false, error: "ไม่พบตาราง" };
    const lookups: DbQueryResult["lookups"] = {};
    for (const [col, l] of forwardLookups(model, table)) lookups[col] = l;
    return {
      requestId: req.requestId,
      ok: true,
      tableName: table.name,
      columns: listColumnDefs(table),
      pkColumnId: table.primaryKey[0],
      lookups,
      editPathPrefix: `/admin/${table.name}/edit`,
    };
  }

  if (req.kind === "rows") {
    const table = tableOf(model, req.tableId);
    if (!table) return { requestId: req.requestId, ok: false, error: "ไม่พบตาราง" };
    try {
      const page = await fetchRows(req.tableId, 0);
      const rows = rowsPageToMaps(page);
      const refRows: Record<string, RowValues[]> = {};
      for (const tid of lookupTableIds(model, table)) {
        const rp = await fetchRows(tid, 0);
        refRows[tid] = rowsPageToMaps(rp).map((r) => r.values);
      }
      return { requestId: req.requestId, ok: true, rows, refRows, tableName: table.name };
    } catch (e) {
      return { requestId: req.requestId, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (req.kind === "lookupOptions") {
    try {
      const page = await fetchRows(req.tableId, 0);
      const mapped = rowsPageToMaps(page);
      const options = mapped.map((r) => ({
        value: String(r.values[req.valueColumnId] ?? ""),
        label: String(r.values[req.labelColumnId] ?? r.values[req.valueColumnId] ?? ""),
      }));
      return { requestId: req.requestId, ok: true, options };
    } catch (e) {
      return { requestId: req.requestId, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (req.kind === "related") {
    const parent = tableOf(model, req.parentTableId);
    if (!parent) return { requestId: req.requestId, ok: false, error: "ไม่พบตารางแม่" };
    const rev = findReverseForeignKeys(model, req.parentTableId).find((r) => r.fk.id === req.fkId);
    if (!rev) return { requestId: req.requestId, ok: false, error: "ไม่พบความสัมพันธ์" };
    try {
      const page = await fetchRows(rev.childTable.id, 0);
      const all = rowsPageToMaps(page);
      const rows = all.filter((r) => String(r.values[rev.childColumnId] ?? "") === req.parentKey);
      return {
        requestId: req.requestId,
        ok: true,
        rows,
        childTableName: rev.childTable.name,
        editPathPrefix: `/admin/${rev.childTable.name}/edit`,
        columns: listColumnDefs(rev.childTable).slice(0, 4),
      };
    } catch (e) {
      return { requestId: req.requestId, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { requestId: req.requestId, ok: false, error: "คำถามไม่รู้จัก" };
}
