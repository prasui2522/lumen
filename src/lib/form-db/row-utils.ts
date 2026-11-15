/**
 * Convert db_test RowsPage ↔ maps used by relationship helpers.
 */
import type { DbModel, DbTable } from "@/lib/db-model";
import type { RowsPage, WireValue } from "@/lib/db-testdata";
import type { RowValues } from "@/lib/form-db/relationships";
import { defaultListColumns } from "@/lib/form-db/admin-pack";
import { forwardLookups } from "@/lib/form-db/relationships";

export function rowsPageToMaps(page: RowsPage): { rowid: number; values: RowValues }[] {
  return page.rows.map((r) => {
    const values: RowValues = {};
    page.columns.forEach((colId, i) => {
      values[colId] = (r.values[i] ?? null) as string | number | boolean | null;
    });
    return { rowid: r.rowid, values };
  });
}

export function wireRecordFromMap(values: RowValues): Record<string, WireValue> {
  const out: Record<string, WireValue> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    if (typeof v === "number") out[k] = String(v);
    else out[k] = v as WireValue;
  }
  return out;
}

export type ListColumnDef = {
  columnId: string;
  name: string;
  label: string;
};

export function listColumnDefs(table: DbTable): ListColumnDef[] {
  return defaultListColumns(table).map((id) => {
    const c = table.columns.find((col) => col.id === id)!;
    return { columnId: id, name: c.name, label: c.label || c.name };
  });
}

/** Tables needed to resolve FK labels for `table`. */
export function lookupTableIds(model: DbModel, table: DbTable): string[] {
  const ids = new Set<string>();
  for (const l of forwardLookups(model, table).values()) ids.add(l.tableId);
  return [...ids];
}
