import type { DbTable } from "./db-model";
import type { ModelIssue } from "./db-validate";

/** A ปัญหาของตาราง item: its text and the element ids it may focus, in order. */
export type TableProblem = { key: string; text: string; targets: string[] };

/** Shown for a key column id that no longer exists (was "?"). */
export const MISSING_COLUMN = "(ไม่พบคอลัมน์)";
/** Shown for a relation whose target table no longer exists (was "?"). */
export const MISSING_TABLE = "(ไม่พบตาราง)";

/** Column names for a key's column ids; an empty set gives "". */
export function keyColumnNames(t: DbTable | undefined, ids: string[]): string {
  return ids.map((id) => t?.columns.find((c) => c.id === id)?.name || MISSING_COLUMN).join(", ");
}

/** `prefix detail`, or just `prefix` when there is no detail (no trailing space). */
export function withDetail(prefix: string, detail: string): string {
  const d = detail.trim();
  return d ? `${prefix} ${d}` : prefix;
}

/** How a column is named in a problem: its name, else its position. */
function columnLabel(t: DbTable, columnId: string): string {
  const i = t.columns.findIndex((c) => c.id === columnId);
  const name = i >= 0 ? t.columns[i].name.trim() : "";
  return name ? `คอลัมน์ ${name}` : i >= 0 ? `คอลัมน์ที่ ${i + 1}` : "คอลัมน์";
}

/** Element ids an issue's item may focus, best first (the first focusable one wins). */
export function problemTargets(t: DbTable, base: string, x: ModelIssue): string[] {
  if (x.columnId !== undefined) {
    const id = `${base}-${x.columnId}`;
    switch (x.field) {
      case "type":
        return [`${id}-type`];
      case "precision":
        return [`${id}-decimal`, `${id}-type`];
      case "values":
        return [`${id}-enum`, `${id}-type`];
      case "nullable":
        return [`${id}-null`, `${id}-pk`, `${id}-name`];
      case "default":
        return [`${id}-default`, `${id}-default-value`, `${id}-name`];
      default:
        return [`${id}-name`];
    }
  }
  if (x.field === "columns") return [`${base}-add-col`];
  if (x.field === "primaryKey") return t.columns[0] ? [`${base}-${t.columns[0].id}-pk`, `${base}-add-col`] : [`${base}-add-col`];
  if (x.field === "table" || x.field === "name") return [`${base}-name`];
  if (x.field.startsWith("unique:")) return [`${base}-uq-${x.field.slice(7)}`];
  if (x.field.startsWith("foreignKey:")) return [`${base}-fk-${x.field.slice(11)}`];
  return [];
}

/**
 * Every issue of one table, in validation order, once per (column, field,
 * message): table, column and key problems alike. Column and table-name items
 * say what they belong to, e.g. `คอลัมน์ price: ค่าเริ่มต้นไม่ตรงกับชนิด`.
 */
export function tableProblems(t: DbTable, issues: ModelIssue[]): TableProblem[] {
  const base = `db-${t.id}`;
  const seen = new Set<string>();
  const out: TableProblem[] = [];
  for (const x of issues) {
    if (x.tableId !== t.id) continue;
    const key = `${x.columnId ?? ""}|${x.field}|${x.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text =
      x.columnId !== undefined
        ? `${columnLabel(t, x.columnId)}: ${x.message}`
        : x.field === "name"
          ? `ชื่อตาราง: ${x.message}`
          : x.message;
    out.push({ key, text, targets: problemTargets(t, base, x) });
  }
  return out;
}

/** Focus the first target that exists and can take focus; false = none could. */
export function focusProblemTarget(targets: string[], doc: Pick<Document, "getElementById"> = document): boolean {
  for (const id of targets) {
    const el = doc.getElementById(id) as HTMLElement | null;
    if (!el || el.tabIndex < 0 || (el as HTMLButtonElement).disabled || el.closest("[inert],[hidden]")) continue;
    el.focus();
    if (el.ownerDocument?.activeElement === el) return true;
  }
  return false;
}
