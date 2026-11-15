/**
 * FK helpers for list label resolution, search, and reverse-related panels.
 */
import type { DbForeignKey, DbModel, DbTable } from "@/lib/db-model";
import type { DbLookupBinding } from "@/lib/form-db/types";

const LABEL_NAMES = ["name", "title", "code", "label", "username", "email"] as const;

/** Prefer name/code/title columns for FK option labels. */
export function pickLabelColumn(table: DbTable): string | null {
  for (const n of LABEL_NAMES) {
    const c = table.columns.find((col) => col.name === n);
    if (c) return c.id;
  }
  const text = table.columns.find(
    (c) => c.type === "text" && !table.primaryKey.includes(c.id) && c.name !== "password_hash",
  );
  return text?.id ?? table.columns.find((c) => !table.primaryKey.includes(c.id))?.id ?? null;
}

export function pickValueColumn(table: DbTable): string | null {
  return table.primaryKey[0] ?? table.columns[0]?.id ?? null;
}

/** Build dbLookup from a single-column FK (v1). */
export function lookupFromForeignKey(model: DbModel, fk: DbForeignKey): DbLookupBinding | null {
  if (fk.columns.length !== 1 || fk.refColumns.length !== 1) return null;
  const ref = model.tables.find((t) => t.id === fk.refTableId);
  if (!ref) return null;
  const valueColumnId = fk.refColumns[0]!;
  const labelColumnId = pickLabelColumn(ref);
  if (!labelColumnId) return null;
  return { tableId: ref.id, valueColumnId, labelColumnId };
}

/** Map FK column id → lookup binding for a table. */
export function forwardLookups(model: DbModel, table: DbTable): Map<string, DbLookupBinding> {
  const out = new Map<string, DbLookupBinding>();
  for (const fk of table.foreignKeys) {
    if (fk.columns.length !== 1) continue;
    const binding = lookupFromForeignKey(model, fk);
    if (binding) out.set(fk.columns[0]!, binding);
  }
  return out;
}

export type ReverseFk = {
  childTable: DbTable;
  fk: DbForeignKey;
  /** Column on child that holds the parent key. */
  childColumnId: string;
};

/** FKs in other tables that point at `tableId`. */
export function findReverseForeignKeys(model: DbModel, tableId: string): ReverseFk[] {
  const out: ReverseFk[] = [];
  for (const t of model.tables) {
    if (t.id === tableId) continue;
    for (const fk of t.foreignKeys) {
      if (fk.refTableId !== tableId || fk.columns.length !== 1) continue;
      out.push({ childTable: t, fk, childColumnId: fk.columns[0]! });
    }
  }
  return out;
}

export type RowValues = Record<string, string | number | boolean | null>;

/**
 * Resolve display string for a cell. When `lookups` has the column and
 * `refRows` has the related table, returns the label; else stringifies value.
 */
export function resolveCellLabel(
  columnId: string,
  value: string | number | boolean | null | undefined,
  lookups: Map<string, DbLookupBinding>,
  refRows: Map<string, RowValues[]>,
): string {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value);
  const lookup = lookups.get(columnId);
  if (!lookup) return raw;
  const rows = refRows.get(lookup.tableId) ?? [];
  const hit = rows.find((r) => String(r[lookup.valueColumnId] ?? "") === raw);
  if (!hit) return raw;
  const label = hit[lookup.labelColumnId];
  return label === null || label === undefined || label === "" ? raw : String(label);
}

/** Case-insensitive search across raw values and resolved FK labels. */
export function filterRowsBySearch(
  rows: RowValues[],
  query: string,
  columnIds: string[],
  lookups: Map<string, DbLookupBinding>,
  refRows: Map<string, RowValues[]>,
): RowValues[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    columnIds.some((colId) => {
      const raw = row[colId];
      const label = resolveCellLabel(colId, raw, lookups, refRows);
      return String(raw ?? "").toLowerCase().includes(q) || label.toLowerCase().includes(q);
    }),
  );
}

/** Child rows whose FK column equals parent key. */
export function relatedChildRows(
  childRows: RowValues[],
  childColumnId: string,
  parentKey: string,
): RowValues[] {
  return childRows.filter((r) => String(r[childColumnId] ?? "") === parentKey);
}
