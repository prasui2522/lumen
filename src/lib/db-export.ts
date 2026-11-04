/**
 * `ส่งออก .sql` (PHASE-10-SPEC §9): save dialog → `db_sql_export` with the
 * in-memory model. An invalid model (decision 7: 0 tables is invalid) never
 * opens the dialog; it toasts its first error instead. Lazy chunk only.
 */
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "@/lib/toast";
import { exportFileName } from "./export-project";
import type { DbModel } from "./db-model";
import { useDbModelStore } from "./db-model-store";
import { useProjectsStore } from "@/stores/projects-store";
import { lastRestoredFocus } from "./modal";
import { validateModel } from "./db-validate";

/** `<project>-schema.sql`, stem from the `exportFileName` rules. */
export function sqlExportFileName(projectName: string | null | undefined): string {
  return exportFileName(projectName).replace(/\.zip$/, "-schema.sql");
}

export type SqlExportDeps = {
  save: (o: { title: string; defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
  toast: { success: (m: string) => void; error: (m: string) => void };
};

const defaults: SqlExportDeps = {
  save: (o) => save(o),
  invoke: (cmd, args) => invoke(cmd, args),
  toast,
};

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function exportSql(
  model: DbModel,
  projectName: string | null | undefined,
  unsaved: boolean,
  deps: SqlExportDeps = defaults,
): Promise<{ status: "invalid"; tableId: string | null } | { status: "cancelled" | "done" | "failed" }> {
  const first = validateModel(model)[0];
  if (first) {
    // Table-less errors (e.g. 0 tables, decision 7) have no table part.
    const t = first.tableId ? model.tables.find((x) => x.id === first.tableId) : undefined;
    deps.toast.error(t ? `ส่งออกไม่ได้: ${t.name || "(ไม่มีชื่อ)"} — ${first.message}` : `ส่งออกไม่ได้: ${first.message}`);
    return { status: "invalid", tableId: first.tableId ?? null };
  }
  let dest: string | null;
  try {
    dest = await deps.save({
      title: "ส่งออกโครงสร้างฐานข้อมูล",
      defaultPath: sqlExportFileName(projectName),
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
  } catch (e) {
    deps.toast.error(`ส่งออกไม่สำเร็จ: ${errMessage(e)}`);
    return { status: "failed" };
  }
  if (!dest) return { status: "cancelled" };
  try {
    const written = (await deps.invoke("db_sql_export", { model, destPath: dest })) as string;
    const name = baseName(written);
    deps.toast.success(unsaved ? `ส่งออกแล้ว: ${name} (รวมการแก้ไขที่ยังไม่บันทึก)` : `ส่งออกแล้ว: ${name}`);
    return { status: "done" };
  } catch (e) {
    deps.toast.error(`ส่งออกไม่สำเร็จ: ${errMessage(e)}`);
    return { status: "failed" };
  }
}

/** Busy flag shared by the button and the palette command (one export at a time). */
export const useSqlExportStore = create<{ busy: boolean }>(() => ({ busy: false }));

/**
 * Run the export (button or palette). Ignored while busy. Focus afterwards:
 * - invalid with a table: select that table, wait for its editor to render,
 *   then focus its first ปัญหาของตาราง button (else its first invalid field);
 * - everything else (cancel, success, failure, table-less invalid): back to
 *   where the export started — the ส่งออก .sql button, or the element the
 *   palette was opened from — falling back to the ส่งออก .sql button. Never BODY.
 */
export async function runSqlExport(deps?: SqlExportDeps): Promise<Awaited<ReturnType<typeof exportSql>> | null> {
  if (useSqlExportStore.getState().busy) return null;
  useSqlExportStore.setState({ busy: true });
  const dom = typeof document !== "undefined";
  const started = dom ? document.activeElement : null;
  const fromOverlay = !!(dom && started instanceof Element && started.closest('[role="dialog"]'));
  try {
    const db = useDbModelStore.getState();
    const p = useProjectsStore.getState();
    const r = await exportSql(db.model, p.openName, p.pendingDbModel !== null, deps);
    if (dom) {
      // The palette restores its own focus when it closes: act after that.
      if (fromOverlay) await untilNoOpenDialog();
      if (r.status === "invalid" && r.tableId) await focusTableProblem(r.tableId);
      else returnFocus(fromOverlay ? (lastRestoredFocus() ?? exportButton()) : started);
    }
    return r;
  } finally {
    useSqlExportStore.setState({ busy: false });
  }
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function untilNoOpenDialog(maxFrames = 120) {
  // Wait until the palette is unmounted (exit animation included); Radix
  // restores focus from a timeout after unmount, so yield past that too.
  for (let i = 0; i < maxFrames && document.querySelector('[role="dialog"]'); i++) await frame();
  await frame();
  await new Promise((r) => setTimeout(r, 0));
}

async function focusTableProblem(tableId: string) {
  useDbModelStore.getState().selectTable(tableId);
  const sel = `[data-table-editor="${CSS.escape(tableId)}"]`;
  for (let i = 0; i < 60 && !document.querySelector(sel); i++) await frame();
  await frame();
  const main = document.querySelector(sel);
  const el =
    main?.querySelector<HTMLElement>("[data-table-problem]:not(:disabled)") ??
    main?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (el) el.focus();
  else returnFocus(null);
}

const exportButton = () => document.querySelector<HTMLElement>("[data-sql-export]");

function returnFocus(target: Element | null) {
  const lost = !document.activeElement || document.activeElement === document.body;
  const t = target instanceof HTMLElement && target.isConnected && target !== document.body ? target : null;
  if (t && (lost || document.activeElement !== t)) t.focus({ preventScroll: true });
  if (!document.activeElement || document.activeElement === document.body)
    exportButton()?.focus({ preventScroll: true });
}
