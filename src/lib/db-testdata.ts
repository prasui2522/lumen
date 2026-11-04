/**
 * ข้อมูลทดสอบ (PHASE-10-SPEC §4, §6): the per-project SQLite test file, seen
 * from the UI. Lives in the lazy DB chunk only. The file is opened by the
 * grid (never at startup, never by merely entering ฐานข้อมูล) and closed when
 * the mode unmounts or the project changes, so Rust drops the connection.
 * Edits apply immediately, are not undoable, and never dirty the project.
 */
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { DbColumn, DbModel, DbTable } from "./db-model";
import { useProjectsStore } from "@/stores/projects-store";

export type WireValue = string | boolean | null;
export type OpenStatus = "ready" | "stale" | "invalid_model" | "corrupt";
export type TestStatus = "closed" | "opening" | OpenStatus | "error";
export type OpenResult = { status: OpenStatus; tables: { tableId: string; rowCount: number }[] };
export type RowsPage = { columns: string[]; rows: { rowid: number; values: WireValue[] }[]; total: number };

export const PAGE_SIZE = 100;

/** A built plan waiting for the confirm (lossy); its tmp file sits next to the test file. */
export type PendingPlan = { token: string; tables: PlanTable[]; model: DbModel };
/** Plan / apply failure shown in the stale banner. `expired` = แผนหมดอายุ (offer a re-plan). */
export type PlanError = { message: string; expired: boolean };
/** `อัปเดตข้อมูลทดสอบ` outcome: applied at once (lossless), needs the confirm, or failed. */
export type UpdateResult = "applied" | "confirm" | "error" | "cancelled";

type State = {
  status: TestStatus;
  error: string | null;
  /** Project and model the open result belongs to. */
  projectId: string | null;
  openedModel: DbModel | null;
  /** Last model the file was ready with (built, reset or migrated): the old ชื่อที่แสดง for the plan lines. */
  appliedModel: DbModel | null;
  /** โครงสร้าง / ข้อมูลทดสอบ, kept across table switches. */
  tab: "structure" | "data";
  setTab: (t: "structure" | "data") => void;
  open: (projectId: string, model: DbModel) => Promise<void>;
  reset: (projectId: string, model: DbModel) => Promise<boolean>;
  close: () => void;
  /** Step 7 (§7): planning or applying in flight (the banner button is busy). */
  planning: boolean;
  plan: PendingPlan | null;
  planError: PlanError | null;
  /** Plan for `model`; lossless → apply at once, else keep it for the confirm. */
  update: (model: DbModel) => Promise<UpdateResult>;
  /** Confirm: apply the pending plan. */
  applyPlan: () => Promise<boolean>;
  /** Cancel / Esc / leaving: drop the pending plan (and its tmp file). */
  discardPlan: () => void;
};

let seq = 0;
/** Bumped by discard/close so a plan that arrives late is thrown away. */
let planSeq = 0;

export const useTestDataStore = create<State>((set, get) => ({
  status: "closed",
  error: null,
  projectId: null,
  openedModel: null,
  appliedModel: null,
  tab: "structure",
  planning: false,
  plan: null,
  planError: null,
  setTab: (tab) => set({ tab }),
  open: async (projectId, model) => {
    const s = get();
    // Same project + same model object already opened: nothing to do.
    if (s.projectId === projectId && s.openedModel === model && s.status !== "closed" && s.status !== "error") return;
    const my = ++seq;
    ++planSeq; // Rust drops any pending plan on (re)open
    set({ status: "opening", error: null, projectId, openedModel: model, plan: null, planning: false, planError: null });
    try {
      const r = await invoke<OpenResult>("db_test_open", { projectId, model });
      if (my === seq) set(r.status === "ready" ? { status: r.status, appliedModel: model } : { status: r.status });
    } catch (e) {
      if (my === seq) set({ status: "error", error: String(e) });
    }
  },
  reset: async (projectId, model) => {
    const my = ++seq;
    get().discardPlan();
    set({ status: "opening", error: null, projectId, openedModel: model, planError: null });
    try {
      const r = await invoke<OpenResult>("db_test_reset", { projectId, model });
      if (my === seq) set(r.status === "ready" ? { status: r.status, appliedModel: model } : { status: r.status });
      return true;
    } catch (e) {
      if (my === seq) set({ status: "error", error: String(e) });
      return false;
    }
  },
  close: () => {
    const was = get().status;
    ++seq;
    ++planSeq;
    // Rust drops a pending plan (and its tmp file) with the connection.
    set({ status: "closed", error: null, projectId: null, openedModel: null, appliedModel: null, plan: null, planning: false, planError: null });
    // Only when something may be open: no redundant IPC.
    if (was !== "closed") void invoke("db_test_close").catch(() => {});
  },
  update: async (model) => {
    if (get().planning) return "cancelled";
    get().discardPlan();
    const my = ++planSeq;
    set({ planning: true, planError: null });
    try {
      const p = await planMigration(model);
      if (my !== planSeq) {
        void discardMigration(p.token).catch(() => {});
        return "cancelled";
      }
      if (updateAction(p) === "confirm") {
        set({ planning: false, plan: { token: p.token, tables: p.tables, model } });
        return "confirm";
      }
      const r = await applyMigration(p.token);
      if (my !== planSeq) return "cancelled";
      set({ planning: false, status: r.status, openedModel: model, appliedModel: model, error: null });
      return "applied";
    } catch (e) {
      if (my === planSeq) set({ planning: false, planError: planError(e) });
      return "error";
    }
  },
  applyPlan: async () => {
    const p = get().plan;
    if (!p || get().planning) return false;
    const my = ++planSeq;
    // The plan leaves the store first, so the dialog's close does not discard it.
    set({ plan: null, planning: true, planError: null });
    try {
      const r = await applyMigration(p.token);
      if (my === planSeq) set({ planning: false, status: r.status, openedModel: p.model, appliedModel: p.model, error: null });
      return true;
    } catch (e) {
      if (my === planSeq) set({ planning: false, planError: planError(e) });
      return false;
    }
  },
  discardPlan: () => {
    const p = get().plan;
    if (!p) return;
    ++planSeq;
    set({ plan: null });
    void discardMigration(p.token).catch(() => {});
  },
}));

// Leaving the project (close or switch) closes the file.
useProjectsStore.subscribe((s, prev) => {
  if (s.openId !== prev.openId) {
    useTestDataStore.getState().close();
    useTestDataStore.setState({ tab: "structure" });
  }
});

/* ---------------- pure helpers (unit-tested) ---------------- */

/** Wire value → cell text. */
export function displayValue(v: WireValue): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "จริง" : "เท็จ";
  return v;
}

/**
 * Editor text → wire value. Empty means NULL except for ข้อความ, where an
 * empty string is a value (Delete sets NULL there).
 */
export function parseInput(c: DbColumn, text: string): WireValue {
  if (c.type === "boolean") return text === "true";
  if (c.type === "text") return text;
  const t = c.type === "json" ? text : text.trim();
  return t === "" ? null : t;
}

/** Cells that cannot be edited in the grid. */
export const readOnlyColumn = (c: DbColumn) => c.type === "identity";

/** `ค่าซ้ำ: email` at row 3 → `แถว 3, email: ค่าซ้ำ`. */
export function errorLine(rowNumber: number | null, message: string): string {
  const m = /^(.+?): (.+)$/.exec(message);
  const body = m ? `${m[2]}: ${m[1]}` : message;
  return rowNumber === null ? body : `แถว ${rowNumber}, ${body}`;
}

/** `แถว {a}–{b} จาก {n}` for the page at `offset`. */
export function rangeLabel(offset: number, count: number, total: number): string {
  if (total === 0) return "แถว 0 จาก 0";
  return `แถว ${offset + 1}–${offset + count} จาก ${total}`;
}

export type Pos = { row: number; col: number };
export type Move = { pos: Pos } | { page: -1 | 1; pos: Pos } | null;

/**
 * Grid keyboard model (§6) outside an edit. `cols` counts the row-header
 * checkbox column (index 0). Returns the new active cell, a page change, or
 * null (key not handled: e.g. Tab leaves the grid).
 */
export function gridMove(
  key: string,
  ctrl: boolean,
  pos: Pos,
  rows: number,
  cols: number,
  page: { hasPrev: boolean; hasNext: boolean },
): Move {
  const last = { row: Math.max(rows - 1, 0), col: cols - 1 };
  const clamp = (p: Pos): Pos => ({ row: Math.min(Math.max(p.row, 0), last.row), col: Math.min(Math.max(p.col, 0), last.col) });
  switch (key) {
    case "ArrowUp":
      return { pos: clamp({ ...pos, row: pos.row - 1 }) };
    case "ArrowDown":
      return { pos: clamp({ ...pos, row: pos.row + 1 }) };
    case "ArrowLeft":
      return { pos: clamp({ ...pos, col: pos.col - 1 }) };
    case "ArrowRight":
      return { pos: clamp({ ...pos, col: pos.col + 1 }) };
    case "Home":
      return { pos: ctrl ? { row: 0, col: 0 } : { ...pos, col: 0 } };
    case "End":
      return { pos: ctrl ? last : { ...pos, col: last.col } };
    case "PageUp":
      return page.hasPrev ? { page: -1, pos: { row: 0, col: pos.col } } : { pos: clamp({ ...pos, row: 0 }) };
    case "PageDown":
      return page.hasNext ? { page: 1, pos: { row: 0, col: pos.col } } : { pos: clamp({ ...pos, row: last.row }) };
    default:
      return null;
  }
}

/**
 * Where a just-inserted row lands: rows are ordered by rowid and the new rowid
 * is the largest, so it is row `oldTotal` (0-based) → that page, and its
 * first editable column (grid col index, 1-based after the checkbox column).
 */
export function newRowTarget(oldTotal: number, columns: DbColumn[]): { offset: number; col: number } {
  const first = columns.findIndex((c) => !readOnlyColumn(c));
  return { offset: Math.floor(oldTotal / PAGE_SIZE) * PAGE_SIZE, col: (first < 0 ? 0 : first) + 1 };
}

/** After a commit: Enter → down, Tab → right, Shift+Tab → left (clamped). */
export function afterCommit(how: "enter" | "tab" | "shift-tab", pos: Pos, rows: number, cols: number): Pos {
  if (how === "enter") return { row: Math.min(pos.row + 1, Math.max(rows - 1, 0)), col: pos.col };
  const col = how === "tab" ? Math.min(pos.col + 1, cols - 1) : Math.max(pos.col - 1, 1);
  return { row: pos.row, col };
}

/** Add-row form: initial text per column; `auto` columns are filled by Rust or SQLite. */
export type FormField = { auto: string | null; text: string };
export function addRowForm(t: DbTable): Record<string, FormField> {
  const out: Record<string, FormField> = {};
  for (const c of t.columns) {
    const d = c.default;
    let auto: string | null = null;
    let text = "";
    if (c.type === "identity" || d?.kind === "uuid") auto = "อัตโนมัติ";
    else if (d?.kind === "now") auto = "เวลาปัจจุบัน";
    else if (d?.kind === "today") auto = "วันนี้";
    else if (d?.kind === "literal") text = String(d.value);
    else if (c.type === "boolean") text = "false";
    out[c.id] = { auto, text };
  }
  return out;
}

/**
 * Form → `db_test_insert` values. Auto columns left empty are omitted (Rust
 * or the SQLite default fills them); other empty fields are omitted too, so
 * a NOT NULL column without a default reports `ต้องมีค่า`.
 */
export function insertValues(t: DbTable, form: Record<string, FormField>): Record<string, WireValue> {
  const out: Record<string, WireValue> = {};
  for (const c of t.columns) {
    const f = form[c.id];
    if (!f || c.type === "identity") continue;
    if (c.type === "boolean") {
      out[c.id] = f.text === "true";
      continue;
    }
    if (f.text === "" ) continue;
    out[c.id] = parseInput(c, f.text);
  }
  return out;
}

/**
 * Add-row dialog initial focus: the first column the user fills in, i.e. not
 * identity and not auto (uuid / now / today defaults); else the first column.
 */
export function firstManualColumn(t: DbTable, form: Record<string, FormField>): string | null {
  const c = t.columns.find((c) => c.type !== "identity" && !form[c.id]?.auto) ?? t.columns[0];
  return c?.id ?? null;
}

/**
 * After a pager button was used: if it is now disabled, focus moves to the
 * other one, or to the grid's tab stop when both are disabled. `null` = the
 * pressed button is still enabled (focus stays).
 */
export function pagerFocus(
  pressed: "prev" | "next",
  can: { hasPrev: boolean; hasNext: boolean },
): "prev" | "next" | "grid" | null {
  const still = pressed === "prev" ? can.hasPrev : can.hasNext;
  if (still) return null;
  const other = pressed === "prev" ? "next" : "prev";
  return (other === "prev" ? can.hasPrev : can.hasNext) ? other : "grid";
}

/** Column named in a Rust error (`ต้องมีค่า: email` → the email column id). */
export function errorColumn(t: DbTable, message: string): string | null {
  const name = /: ([^,]+)/.exec(message)?.[1]?.trim();
  return t.columns.find((c) => c.name === name)?.id ?? null;
}

/* ---------------- IPC (thin) ---------------- */

export const fetchRows = (tableId: string, offset: number) =>
  invoke<RowsPage>("db_test_rows", { tableId, offset, limit: PAGE_SIZE });
export const insertRow = (tableId: string, values: Record<string, WireValue>) =>
  invoke<{ rowid: number }>("db_test_insert", { tableId, values });
/** Resolves to the stored value (normalized by Rust, e.g. a canonical uuid). */
export const updateCell = (tableId: string, rowid: number, columnId: string, value: WireValue) =>
  invoke<{ value: WireValue }>("db_test_update", { tableId, rowid, columnId, value }).then((r) => r.value);
export const deleteRows = (tableId: string, rowids: number[]) =>
  invoke<{ deleted: number }>("db_test_delete", { tableId, rowids });

/* ---------------- step 7: schema change → test rows (PHASE-10-SPEC §7) ---------------- */

/** Rust `testmigrate::TablePlan` (serde camelCase). */
export type PlanTable = { tableId: string; name: string; rowsLost: number; valuesLost: number; dropped: boolean };
/** Rust `testmigrate::PlanResult`. */
export type MigrationPlan = { token: string; lossless: boolean; tables: PlanTable[] };

/** `db_test_apply` error for a token that is no longer the current plan. */
export const PLAN_EXPIRED = "แผนหมดอายุ";

/** Builds `<id>.sqlite.tmp` from `model` (the file must be open). */
export const planMigration = (model: DbModel) => invoke<MigrationPlan>("db_test_plan", { model });
/** Renames the planned file over the old one and reopens it (`ready`). */
export const applyMigration = (token: string) => invoke<OpenResult>("db_test_apply", { token });
/** Drops the plan and its tmp file; the open file stays stale. */
export const discardMigration = (token: string) => invoke<void>("db_test_discard", { token });

/** `อัปเดตข้อมูลทดสอบ`: lossless → apply with no dialog; otherwise confirm. */
export const updateAction = (p: Pick<MigrationPlan, "tables">): "apply" | "confirm" => (isLossless(p) ? "apply" : "confirm");

/** Rust error → banner error; แผนหมดอายุ offers a re-plan. */
export function planError(e: unknown): PlanError {
  const message = String(e);
  return { message, expired: message === PLAN_EXPIRED };
}

/**
 * tableId → ชื่อที่แสดง for `planLines`: the first model (in order) with a
 * non-blank label for that table wins, i.e. the NEW model, then the OLD one
 * (a dropped table is only there); none → undefined (SQL name in planLines).
 */
export function labelLookup(...models: (Pick<DbModel, "tables"> | null | undefined)[]): (tableId: string) => string | undefined {
  const m = new Map<string, string>();
  for (const model of models)
    for (const t of model?.tables ?? []) if (!m.has(t.id) && t.label?.trim()) m.set(t.id, t.label);
  return (id) => m.get(id);
}

/** Rust `testdb::OPEN_ERROR` / `testmigrate::MIGRATE_ERROR`. */
export const OPEN_ERROR = "เปิดข้อมูลทดสอบไม่ได้";
export const MIGRATE_ERROR = "อัปเดตข้อมูลทดสอบไม่ได้";

/** What follows a known Rust prefix (`X` → "", `X: d` → "d"); other messages unchanged. */
export function errorDetail(prefix: string, message: string | null | undefined): string {
  const m = (message ?? "").trim();
  return m.startsWith(prefix) ? m.slice(prefix.length).replace(/^[\s:]+/, "") : m;
}

/** Open-error banner body (its title is already เปิดข้อมูลทดสอบไม่ได้): the detail, else what to try. */
export const openErrorText = (error: string | null | undefined) =>
  errorDetail(OPEN_ERROR, error) || "ไฟล์อาจถูกใช้อยู่ ดิสก์เต็ม หรือแอปเขียนโฟลเดอร์ข้อมูลไม่ได้ แก้แล้วกด ลองอีกครั้ง";

/** Stale-banner plan / apply error; no doubled prefix when Rust already says อัปเดตข้อมูลทดสอบไม่ได้. */
export const planErrorText = (message: string) =>
  message.trim().startsWith(MIGRATE_ERROR) ? message.trim() : `${MIGRATE_ERROR}: ${message}`;

/** Error line inside a full-reset confirm that failed (the dialog stays open). */
export function rebuildErrorText(fail: string, error: string | null | undefined): string {
  const d = errorDetail(OPEN_ERROR, error);
  return d ? `${fail}: ${d}` : `${fail} ลองกดอีกครั้ง หรือกด ยกเลิก`;
}

/** Nothing lost in any table (same rule as Rust's `lossless`). */
export const isLossless = (p: Pick<MigrationPlan, "tables">) =>
  p.tables.every((t) => t.rowsLost === 0 && t.valuesLost === 0);

const COUNT = new Intl.NumberFormat("en-US");

/**
 * Confirm-dialog lines (§7), one per table that loses something:
 * `{name}: ลบ {r} แถว, ล้าง {v} ค่า` (a zero part is left out), and
 * `ตาราง {name} จะถูกลบ` for a dropped table (plus its row count, if any).
 * Tables that lose nothing are skipped; dropped tables are always listed.
 * Counts use a thousands separator (1,234). `label` maps a table id to its
 * ชื่อที่แสดง; an empty or missing label falls back to the SQL name.
 */
export function planLines(p: Pick<MigrationPlan, "tables">, label?: (tableId: string) => string | null | undefined): string[] {
  const lines: string[] = [];
  const n = (x: number) => COUNT.format(x);
  for (const t of p.tables) {
    const name = label?.(t.tableId)?.trim() || t.name;
    if (t.dropped) {
      lines.push(t.rowsLost > 0 ? `ตาราง ${name} จะถูกลบ (ลบ ${n(t.rowsLost)} แถว)` : `ตาราง ${name} จะถูกลบ`);
      continue;
    }
    const parts = [t.rowsLost > 0 && `ลบ ${n(t.rowsLost)} แถว`, t.valuesLost > 0 && `ล้าง ${n(t.valuesLost)} ค่า`].filter(Boolean);
    if (parts.length) lines.push(`${name}: ${parts.join(", ")}`);
  }
  return lines;
}

/**
 * Focus target after a confirm: the first candidate still in the document
 * (the opener, else the error banner's ลองอีกครั้ง, else the banner's first
 * button), so a failed rebuild that swapped in the error banner never leaves
 * focus on <body>.
 */
export function firstConnected<T extends { isConnected: boolean }>(...c: (T | null | undefined)[]): T | null {
  return c.find((e): e is T => !!e && e.isConnected) ?? null;
}
