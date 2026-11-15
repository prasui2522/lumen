/**
 * TS mirror of src-tauri/src/dbmodel.rs validation (PHASE-10-SPEC §2), for
 * inline errors. Rust stays authoritative; both are checked against the shared
 * fixture `src-tauri/src/fixtures/dbmodel/validation.json`. Lazy chunk only.
 */
import type { DbColumn, DbModel, DbTable, DbType } from "./db-model";

export const MAX_TABLES = 50;
export const MAX_COLUMNS = 100;
const MAX_ENUM_VALUES = 50;
const MAX_ENUM_VALUE_CHARS = 63;
const MAX_TEXT_DEFAULT_CHARS = 1000;
const MAX_IDENT_LEN = 63;

/** Same list and order as `PG_RESERVED` in dbmodel.rs (checked by a test). */
export const PG_RESERVED: readonly string[] = [
  "all", "analyse", "analyze", "and", "any", "array", "as", "asc", "asymmetric",
  "authorization", "binary", "both", "case", "cast", "check", "collate", "collation",
  "column", "concurrently", "constraint", "create", "cross", "current_catalog",
  "current_date", "current_role", "current_schema", "current_time", "current_timestamp",
  "current_user", "default", "deferrable", "desc", "distinct", "do", "else", "end",
  "except", "false", "fetch", "for", "foreign", "freeze", "from", "full", "grant",
  "group", "having", "ilike", "in", "initially", "inner", "intersect", "into", "is",
  "isnull", "join", "lateral", "leading", "left", "like", "limit", "localtime",
  "localtimestamp", "natural", "not", "notnull", "null", "offset", "on", "only", "or",
  "order", "outer", "overlaps", "placing", "primary", "references", "returning",
  "right", "select", "session_user", "similar", "some", "symmetric", "system_user",
  "table", "tablesample", "then", "to", "trailing", "true", "union", "unique", "user",
  "using", "variadic", "verbose", "when", "where", "window", "with",
];
const RESERVED = new Set(PG_RESERVED);
export const SYSTEM_NAMES: readonly string[] = ["rowid", "oid", "_rowid_", "tableoid", "xmin", "xmax", "cmin", "cmax", "ctid"];

export type ModelIssue = { tableId?: string; columnId?: string; field: string; message: string };

const chars = (s: string) => [...s].length;

/** UI input → stored name: trimmed, ASCII-lowercased, whitespace → `_`. */
export function normalizeIdentifier(raw: string): string {
  return [...raw.trim()].map((c) => (/\s/.test(c) ? "_" : c >= "A" && c <= "Z" ? c.toLowerCase() : c)).join("");
}

export function identifierError(name: string): string | null {
  const bytes = new TextEncoder().encode(name).length;
  const shapeOk = name.length > 0 && bytes <= MAX_IDENT_LEN && /^[a-z][a-z0-9_]*$/.test(name);
  if (!shapeOk) return name === "" ? "ต้องมีชื่อ" : "ชื่อใช้ได้เฉพาะ a-z 0-9 _ ขึ้นต้นด้วยตัวอักษร ไม่เกิน 63 ตัว";
  if (RESERVED.has(name)) return `${name} เป็นคำสงวน`;
  if (SYSTEM_NAMES.includes(name)) return `${name} เป็นชื่อของระบบ`;
  if (name.startsWith("pg_") || name.startsWith("sqlite_")) return "ห้ามขึ้นต้นด้วย pg_ หรือ sqlite_";
  return null;
}

function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d === 0) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const max = mo === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31;
  return d <= max;
}

/** Same as Rust `str::parse::<i64>`: optional sign, ASCII digits, in range. */
export function isI64(s: string): boolean {
  if (!/^[+-]?\d+$/.test(s)) return false;
  const n = BigInt(s);
  return n >= -9223372036854775808n && n <= 9223372036854775807n;
}

export function decimalFits(s: string, precision: number, scale: number): boolean {
  const body = s.startsWith("-") ? s.slice(1) : s;
  const dot = body.indexOf(".");
  const int = dot < 0 ? body : body.slice(0, dot);
  const frac = dot < 0 ? null : body.slice(dot + 1);
  if (int === "" || !/^\d+$/.test(int)) return false;
  if (frac !== null && (frac === "" || !/^\d+$/.test(frac) || frac.length > scale)) return false;
  return int.replace(/^0+/, "").length <= Math.max(0, precision - scale);
}

const keyType = (t: DbType): DbType => (t === "identity" ? "integer" : t);
const asSet = (ids: string[]) => [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const hasDup = (sorted: string[]) => sorted.some((x, i) => i > 0 && sorted[i - 1] === x);

function issue(t: DbTable | null, c: DbColumn | null, field: string, message: string): ModelIssue {
  const out: ModelIssue = { field, message };
  if (t) out.tableId = t.id;
  if (c) out.columnId = c.id;
  return out;
}

function validateDefault(t: DbTable, c: DbColumn, out: ModelIssue[]) {
  const def = c.default;
  if (!def) return;
  const bad = (m: string) => out.push(issue(t, c, "default", m));
  if (c.type === "json") return bad("JSON ไม่มีค่าเริ่มต้น");
  if (c.type === "identity") return bad("ลำดับอัตโนมัติไม่มีค่าเริ่มต้น");
  if (def.kind !== "literal") {
    const ok =
      (c.type === "timestamptz" && def.kind === "now") ||
      (c.type === "date" && def.kind === "today") ||
      (c.type === "uuid" && def.kind === "uuid");
    if (!ok) bad("ค่าเริ่มต้นไม่ตรงกับชนิด");
    return;
  }
  const v = def.value;
  let ok = false;
  if (typeof v === "boolean") ok = c.type === "boolean";
  else if (c.type === "integer") ok = isI64(v);
  else if (c.type === "decimal") ok = c.precision !== undefined && c.scale !== undefined && decimalFits(v, c.precision, c.scale);
  else if (c.type === "date") ok = isValidDate(v);
  else if (c.type === "text" || c.type === "asset") ok = chars(v) <= MAX_TEXT_DEFAULT_CHARS;
  else if (c.type === "enum") ok = !!c.values && c.values.includes(v);
  if (!ok) bad("ค่าเริ่มต้นไม่ตรงกับชนิด");
}

/** Every problem, in the same order as Rust `validate` (empty = valid). */
export function validateModel(model: DbModel): ModelIssue[] {
  const out: ModelIssue[] = [];
  if (model.tables.length === 0) out.push(issue(null, null, "model", "ต้องมีอย่างน้อย 1 ตาราง"));
  if (model.tables.length > MAX_TABLES) out.push(issue(null, null, "model", `ตารางได้ไม่เกิน ${MAX_TABLES} ตาราง`));
  const tableIds = new Set<string>();
  const tableNames = new Set<string>();
  const byId = new Map(model.tables.map((t) => [t.id, t] as const));

  for (const t of model.tables) {
    if (t.id === "" || tableIds.has(t.id)) out.push(issue(t, null, "table", "รหัสตารางซ้ำหรือว่าง"));
    tableIds.add(t.id);
    const tn = identifierError(t.name);
    if (tn) out.push(issue(t, null, "name", tn));
    else if (tableNames.has(t.name)) out.push(issue(t, null, "name", `ชื่อตารางซ้ำ: ${t.name}`));
    else tableNames.add(t.name);
    if (t.columns.length === 0) out.push(issue(t, null, "columns", "ต้องมีอย่างน้อย 1 คอลัมน์"));
    if (t.columns.length > MAX_COLUMNS) out.push(issue(t, null, "columns", `คอลัมน์ได้ไม่เกิน ${MAX_COLUMNS} คอลัมน์`));

    const cols = new Map(t.columns.map((c) => [c.id, c] as const));
    const colIds = new Set<string>();
    const colNames = new Set<string>();
    for (const c of t.columns) {
      if (c.id === "" || colIds.has(c.id)) out.push(issue(t, c, "column", "รหัสคอลัมน์ซ้ำหรือว่าง"));
      colIds.add(c.id);
      const cn = identifierError(c.name);
      if (cn) out.push(issue(t, c, "name", cn));
      else if (colNames.has(c.name)) out.push(issue(t, c, "name", `ชื่อคอลัมน์ซ้ำ: ${c.name}`));
      else colNames.add(c.name);
      if (c.type === "decimal") {
        const p = c.precision, s = c.scale;
        if (!(p !== undefined && s !== undefined && p >= 1 && p <= 38 && s <= p))
          out.push(issue(t, c, "precision", "ทศนิยม: ความแม่นยำ 1–38 และตำแหน่งทศนิยม 0 ถึงความแม่นยำ"));
      }
      if (c.type === "enum") {
        const vals = c.values ?? [];
        const lenOk = vals.every((v) => chars(v) >= 1 && chars(v) <= MAX_ENUM_VALUE_CHARS);
        if (vals.length === 0 || vals.length > MAX_ENUM_VALUES || new Set(vals).size !== vals.length || !lenOk)
          out.push(issue(t, c, "values", "ตัวเลือก: 1–50 ค่าไม่ซ้ำกัน แต่ละค่า 1–63 ตัวอักษร"));
      }
      validateDefault(t, c, out);
    }

    const pk = t.primaryKey;
    if (pk.length === 0) out.push(issue(t, null, "primaryKey", "ต้องมีคีย์หลัก"));
    if (hasDup(asSet(pk))) out.push(issue(t, null, "primaryKey", "คีย์หลักมีคอลัมน์ซ้ำ"));
    for (const id of pk) {
      const c = cols.get(id);
      if (!c) out.push(issue(t, null, "primaryKey", "คีย์หลักอ้างถึงคอลัมน์ที่ไม่มีอยู่"));
      else if (c.nullable) out.push(issue(t, c, "nullable", "คอลัมน์คีย์หลักต้องมีค่า"));
    }
    for (const c of t.columns) {
      if (c.type === "identity" && !(pk.length === 1 && pk[0] === c.id))
        out.push(issue(t, c, "type", "ลำดับอัตโนมัติต้องเป็นคีย์หลักเพียงคอลัมน์เดียว"));
    }

    const pkSet = asSet(pk);
    const seen: string[][] = [];
    for (const u of t.uniques) {
      const field = `unique:${u.id}`;
      const set = asSet(u.columns);
      if (u.columns.length === 0) {
        out.push(issue(t, null, field, "ไม่ซ้ำ: ต้องเลือกอย่างน้อย 1 คอลัมน์"));
        continue;
      }
      if (hasDup(set)) out.push(issue(t, null, field, "ไม่ซ้ำ: เลือกคอลัมน์ซ้ำ"));
      if (u.columns.some((id) => !cols.has(id))) out.push(issue(t, null, field, "ไม่ซ้ำ: อ้างถึงคอลัมน์ที่ไม่มีอยู่"));
      if (pkSet.length > 0 && sameSet(set, pkSet)) out.push(issue(t, null, field, "ไม่ซ้ำ: ซ้ำกับคีย์หลัก"));
      else if (seen.some((s) => sameSet(s, set))) out.push(issue(t, null, field, "ไม่ซ้ำ: มีชุดคอลัมน์นี้แล้ว"));
      seen.push(set);
    }

    for (const fk of t.foreignKeys) {
      const field = `foreignKey:${fk.id}`;
      const push = (m: string) => out.push(issue(t, null, field, m));
      if (fk.columns.length === 0 || fk.columns.length !== fk.refColumns.length) {
        push("ความสัมพันธ์: จำนวนคอลัมน์ไม่เท่ากัน");
        continue;
      }
      if (hasDup(asSet(fk.columns))) push("ความสัมพันธ์: เลือกคอลัมน์ซ้ำ");
      const local = fk.columns.map((id) => cols.get(id));
      if (local.some((c) => !c)) {
        push("ความสัมพันธ์: อ้างถึงคอลัมน์ที่ไม่มีอยู่");
        continue;
      }
      const rt = byId.get(fk.refTableId);
      if (!rt) {
        push("ความสัมพันธ์: ไม่พบตารางปลายทาง");
        continue;
      }
      const rcols = new Map(rt.columns.map((c) => [c.id, c] as const));
      const remote = fk.refColumns.map((id) => rcols.get(id));
      if (remote.some((c) => !c)) {
        push("ความสัมพันธ์: ไม่พบคอลัมน์ปลายทาง");
        continue;
      }
      if (!local.every((l, i) => keyType(l!.type) === keyType(remote[i]!.type))) push("ความสัมพันธ์: ชนิดคอลัมน์ไม่ตรงกัน");
      const refSet = asSet(fk.refColumns);
      const keyed =
        (rt.primaryKey.length > 0 && sameSet(refSet, asSet(rt.primaryKey))) ||
        rt.uniques.some((u) => u.columns.length > 0 && sameSet(asSet(u.columns), refSet));
      if (!keyed) push("ความสัมพันธ์: คอลัมน์ปลายทางต้องเป็นคีย์หลักหรือไม่ซ้ำ");
      if ((fk.onDelete ?? "no_action") === "set_null" && local.some((c) => !c!.nullable))
        push("ความสัมพันธ์: ตั้งเป็นว่างได้เมื่อทุกคอลัมน์ไม่บังคับมีค่า");
    }
  }
  return out;
}
