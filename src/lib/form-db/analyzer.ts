/**
 * Analyze a DbTable → form field widgets (Form-from-table).
 */
import type { DbColumn, DbModel, DbTable } from "@/lib/db-model";
import { forwardLookups } from "@/lib/form-db/relationships";
import type { AnalyzedFormField, FormFieldWidget, InputKind } from "@/lib/form-db/types";

const ASSET_HINT = /^(image|photo|cover|avatar|picture|thumbnail)$/i;
const LONG_TEXT = /description|note|body|content|bio|about/i;
const PASSWORD = /password/i;

function isAutoPk(table: DbTable, col: DbColumn): boolean {
  if (!table.primaryKey.includes(col.id)) return false;
  if (col.type === "identity") return true;
  if (col.type === "uuid" && col.default?.kind === "uuid") return true;
  return false;
}

function isAutoTimestamp(col: DbColumn): boolean {
  return (
    (col.type === "timestamptz" && col.default?.kind === "now") ||
    (col.type === "date" && col.default?.kind === "today")
  );
}

function displayLabel(col: DbColumn): string {
  return col.label?.trim() || col.name;
}

export function analyzeTableToFormFields(table: DbTable, model: DbModel): AnalyzedFormField[] {
  const lookups = forwardLookups(model, table);
  const out: AnalyzedFormField[] = [];

  for (const col of table.columns) {
    const base = {
      columnId: col.id,
      columnName: col.name,
      label: displayLabel(col),
    };

    if (isAutoPk(table, col) || isAutoTimestamp(col)) {
      out.push({ ...base, widget: "skip", reason: "auto" });
      continue;
    }

    if (col.secret === "argon2id" || PASSWORD.test(col.name)) {
      out.push({
        ...base,
        widget: "password",
        inputKind: "password",
        reason: col.secret ? "secret" : "password-name",
      });
      continue;
    }

    const fkLookup = lookups.get(col.id);
    if (fkLookup) {
      out.push({ ...base, widget: "select", lookup: fkLookup, reason: "fk" });
      continue;
    }

    if (col.type === "asset" || (col.type === "text" && ASSET_HINT.test(col.name))) {
      out.push({
        ...base,
        widget: "asset",
        inputKind: "asset",
        reason: col.type === "asset" ? "asset-type" : "asset-name",
      });
      continue;
    }

    if (col.type === "boolean") {
      out.push({ ...base, widget: "switch", reason: "boolean" });
      continue;
    }

    if (col.type === "enum" && col.values?.length) {
      out.push({ ...base, widget: "select", reason: "enum" });
      continue;
    }

    if (col.type === "integer" || col.type === "decimal") {
      out.push({ ...base, widget: "number", inputKind: "number", reason: col.type });
      continue;
    }

    if (col.type === "date") {
      out.push({ ...base, widget: "date", inputKind: "date", reason: "date" });
      continue;
    }

    if (col.type === "timestamptz") {
      out.push({ ...base, widget: "datetime", inputKind: "datetime-local", reason: "timestamptz" });
      continue;
    }

    if (col.type === "json") {
      out.push({ ...base, widget: "hint", reason: "json-manual" });
      continue;
    }

    if (col.type === "text" && LONG_TEXT.test(col.name)) {
      out.push({ ...base, widget: "textarea", reason: "long-text" });
      continue;
    }

    if (col.type === "text" || col.type === "uuid") {
      const inputKind: InputKind = "text";
      out.push({ ...base, widget: "input", inputKind, reason: col.type });
      continue;
    }

    out.push({ ...base, widget: "hint", reason: `unsupported:${col.type}` });
  }

  return out;
}

/** Columns not yet bound under a form (by column id). */
export function missingFormFields(
  analyzed: AnalyzedFormField[],
  boundColumnIds: Set<string>,
): AnalyzedFormField[] {
  return analyzed.filter((f) => f.widget !== "skip" && f.widget !== "hint" && !boundColumnIds.has(f.columnId));
}

export function widgetToInputKind(widget: FormFieldWidget): InputKind | undefined {
  switch (widget) {
    case "password":
      return "password";
    case "number":
      return "number";
    case "date":
      return "date";
    case "datetime":
      return "datetime-local";
    case "asset":
      return "asset";
    case "input":
      return "text";
    default:
      return undefined;
  }
}
