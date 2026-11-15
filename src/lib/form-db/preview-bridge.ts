/**
 * Preview ↔ Tauri bridge for dbSubmit (hash + db_test_*).
 */
import { invoke } from "@tauri-apps/api/core";
import type { DbModel } from "@/lib/db-model";
import { createStubAuthAdapter, stubRegisterUser } from "@/lib/form-db/auth-adapter";
import {
  collectFormFields,
  findAncestorForm,
  prepareSubmitValues,
  tableByForm,
} from "@/lib/form-db/submit";
import { insertRow, updateCell, deleteRows, fetchRows } from "@/lib/db-testdata";
import type { Node, NodeId } from "@/schema";

export type DbSubmitMessage = {
  type: "wb:dbSubmit";
  buttonId: string;
  /** nodeId → value from the iframe. */
  values: Record<string, string | boolean>;
};

async function hashViaTauri(plain: string): Promise<string> {
  try {
    return await invoke<string>("hash_password", { plain });
  } catch {
    const { stubHashPassword } = await import("@/lib/form-db/auth-adapter");
    return stubHashPassword(plain);
  }
}

/**
 * Handle a dbSubmit from the preview frame. Requires an open test DB
 * (`db_test_open` already done in Database mode or opened here).
 */
export async function handlePreviewDbSubmit(
  nodes: Record<NodeId, Node>,
  model: DbModel,
  msg: DbSubmitMessage,
): Promise<{ ok: boolean; error?: string }> {
  const found = findAncestorForm(nodes, msg.buttonId);
  if (!found) return { ok: false, error: "ไม่พบฟอร์มที่ผูกตาราง" };
  const table = tableByForm(model, found.form);
  if (!table) return { ok: false, error: "ไม่พบตาราง" };

  const auth = createStubAuthAdapter(hashViaTauri);
  const fields = collectFormFields(nodes, found.formNodeId, msg.values);
  const prepared = await prepareSubmitValues(table, fields, auth);

  try {
    if (found.form.op === "insert") {
      const wire: Record<string, string | boolean | null> = {};
      for (const [k, v] of Object.entries(prepared.values)) {
        wire[k] = typeof v === "number" ? String(v) : v;
      }
      await insertRow(table.id, wire);
      // Register stub session users when inserting into auth-like table
      const identityCol = table.columns.find((c) => /^(username|email)$/i.test(c.name));
      const hashCol = table.columns.find((c) => c.secret === "argon2id" || /password/i.test(c.name));
      if (identityCol && hashCol) {
        const identity = prepared.values[identityCol.id];
        const hash = prepared.values[hashCol.id];
        if (typeof identity === "string" && typeof hash === "string") {
          stubRegisterUser(identity, hash);
        }
      }
      return { ok: true };
    }
    if (found.form.op === "update") {
      const keyCol = found.form.keyColumnId ?? table.primaryKey[0];
      if (!keyCol) return { ok: false, error: "ไม่มีคีย์หลัก" };
      const keyVal = prepared.values[keyCol] ?? msg.values[`key:${keyCol}`];
      if (keyVal === undefined || keyVal === null || keyVal === "") {
        return { ok: false, error: "ต้องมีค่าคีย์หลัก" };
      }
      // Locate rowid via a page scan (test DB API is rowid-based)
      const page = await fetchRows(table.id, 0);
      const keyIdx = page.columns.indexOf(keyCol);
      const row = page.rows.find((r) => String(r.values[keyIdx] ?? "") === String(keyVal));
      if (!row) return { ok: false, error: "ไม่พบแถว" };
      for (const [colId, val] of Object.entries(prepared.values)) {
        if (colId === keyCol) continue;
        await updateCell(table.id, row.rowid, colId, val as string | boolean | null);
      }
      return { ok: true };
    }
    if (found.form.op === "delete") {
      const keyCol = found.form.keyColumnId ?? table.primaryKey[0];
      if (!keyCol) return { ok: false, error: "ไม่มีคีย์หลัก" };
      const keyVal = prepared.values[keyCol] ?? msg.values[`key:${keyCol}`];
      const page = await fetchRows(table.id, 0);
      const keyIdx = page.columns.indexOf(keyCol);
      const row = page.rows.find((r) => String(r.values[keyIdx] ?? "") === String(keyVal));
      if (!row) return { ok: false, error: "ไม่พบแถว" };
      await deleteRows(table.id, [row.rowid]);
      return { ok: true };
    }
    if (found.form.op === "load") {
      // Login: verify password against stored hash
      const identityCol = table.columns.find((c) => /^(username|email)$/i.test(c.name));
      const hashCol = table.columns.find((c) => c.secret === "argon2id" || /password/i.test(c.name));
      if (!identityCol || !hashCol) return { ok: false, error: "ตารางล็อกอินไม่ครบ" };
      const identityField = fields.find((f) => f.columnId === identityCol.id);
      const passwordField = fields.find((f) => f.columnId === hashCol.id);
      if (!identityField || !passwordField) return { ok: false, error: "กรอกไม่ครบ" };
      const page = await fetchRows(table.id, 0);
      const idIdx = page.columns.indexOf(identityCol.id);
      const hashIdx = page.columns.indexOf(hashCol.id);
      const row = page.rows.find((r) => String(r.values[idIdx] ?? "") === String(identityField.raw));
      if (!row) return { ok: false, error: "ไม่พบผู้ใช้" };
      const hash = String(row.values[hashIdx] ?? "");
      const ok = await auth.verifyPassword(String(passwordField.raw), hash);
      if (!ok) {
        // Also try stub registry (in case hashes came from stub)
        const sign = await auth.signIn(String(identityField.raw), String(passwordField.raw));
        return sign;
      }
      sessionStorage.setItem("wb.auth.session", JSON.stringify({ identity: String(identityField.raw) }));
      return { ok: true };
    }
    return { ok: false, error: "op ไม่รองรับ" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
