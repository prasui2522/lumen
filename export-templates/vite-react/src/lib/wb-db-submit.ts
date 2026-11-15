/**
 * Export-side dbSubmit: localStorage stub, or Supabase Auth + PostgREST (Phase C).
 */
import { auth, stubHashPassword } from "@/lib/wb-db-runtime";
import { getExportedDbModel, localInsert, localRead, localWrite } from "@/lib/wb-db-client";
import type { SiteNode } from "@/lib/site-types";
import {
  isAuthLikeTable,
  isSupabaseBackend,
  supabaseConfig,
  supabaseDelete,
  supabaseInsert,
  supabaseSignUp,
  supabaseUpdate,
} from "@/lib/wb-db-supabase";

function findAncestorForm(
  nodes: Record<string, SiteNode>,
  nodeId: string,
): { formNodeId: string; form: NonNullable<NonNullable<SiteNode["db"]>["form"]> } | null {
  const parentOf = new Map<string, string>();
  for (const [id, n] of Object.entries(nodes)) {
    const kids = (n.props.children as string[] | undefined) ?? [];
    for (const c of kids) parentOf.set(c, id);
  }
  let cur: string | undefined = nodeId;
  while (cur) {
    const n = nodes[cur];
    if (n?.db?.form) return { formNodeId: cur, form: n.db.form };
    cur = parentOf.get(cur);
  }
  return null;
}

function collectValues(
  nodes: Record<string, SiteNode>,
  formNodeId: string,
  rootEl: ParentNode,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const walk = (id: string) => {
    const n = nodes[id];
    if (!n) return;
    if (n.db?.column) {
      const el =
        rootEl.querySelector(`[data-node-id="${CSS.escape(id)}"]`) ??
        rootEl.querySelector(`[data-wb-node-id="${CSS.escape(id)}"]`);
      const input = el?.querySelector("input, textarea, select") as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null;
      if (input) {
        if (input instanceof HTMLInputElement && input.type === "checkbox") out[id] = input.checked;
        else out[id] = input.value;
      }
    }
    for (const c of (n.props.children as string[] | undefined) ?? []) walk(c);
  };
  walk(formNodeId);
  return out;
}

export async function runExportDbSubmit(opts: {
  buttonId: string;
  nodes: Record<string, SiteNode>;
  rootEl: ParentNode;
}): Promise<{ ok: boolean; error?: string }> {
  const found = findAncestorForm(opts.nodes, opts.buttonId);
  if (!found) return { ok: false, error: "ไม่พบฟอร์ม" };
  const model = getExportedDbModel();
  const table = model?.tables.find((t) => t.id === found.form.tableId);
  if (!table) return { ok: false, error: "ไม่พบตาราง (ยังไม่มี dbModel ในไซต์)" };

  const byNode = collectValues(opts.nodes, found.formNodeId, opts.rootEl);
  const useSb = isSupabaseBackend();
  const cfg = useSb ? supabaseConfig() : null;

  const values: Record<string, string | boolean | null> = {};
  let plainPassword = "";
  for (const [nodeId, raw] of Object.entries(byNode)) {
    const colId = opts.nodes[nodeId]?.db?.column;
    if (!colId) continue;
    const col = table.columns.find((c) => c.id === colId);
    if (!col) continue;
    if (col.secret === "argon2id" || /password/i.test(col.name)) {
      const plain = String(raw);
      plainPassword = plain;
      if (plain && !useSb) values[colId] = await stubHashPassword(plain);
      continue;
    }
    values[colId] = typeof raw === "boolean" ? raw : String(raw);
  }

  // ——— Supabase path ———
  if (useSb && cfg) {
    if (found.form.op === "load") {
      const identity = table.columns.find((c) => /^(username|email)$/i.test(c.name));
      const hashCol = table.columns.find((c) => c.secret === "argon2id" || /password/i.test(c.name));
      if (!identity || !hashCol) return { ok: false, error: "ตารางล็อกอินไม่ครบ" };
      const idNode = Object.entries(opts.nodes).find(([, n]) => n.db?.column === identity.id)?.[0];
      const pwNode = Object.entries(opts.nodes).find(([, n]) => n.db?.column === hashCol.id)?.[0];
      const idVal = idNode ? String(byNode[idNode] ?? "") : "";
      const pwVal = pwNode ? String(byNode[pwNode] ?? "") : "";
      return auth.signIn(idVal, pwVal);
    }
    if (found.form.op === "insert" && isAuthLikeTable(table)) {
      const identity = table.columns.find((c) => /^(username|email)$/i.test(c.name));
      if (!identity) return { ok: false, error: "ไม่มีอีเมล/ชื่อผู้ใช้" };
      const email = String(values[identity.id] ?? "");
      if (!email || !plainPassword) return { ok: false, error: "ต้องมีอีเมลและรหัสผ่าน" };
      const signed = await supabaseSignUp(cfg, email, plainPassword);
      if (!signed.ok) return signed;
      // Optional profile row without password (RLS may require auth.uid()).
      const profile = { ...values };
      return supabaseInsert(cfg, table, profile);
    }
    if (found.form.op === "insert") {
      return supabaseInsert(cfg, table, values);
    }
    const keyCol = found.form.keyColumnId ?? table.primaryKey[0];
    if (!keyCol) return { ok: false, error: "ไม่มีคีย์หลัก" };
    const keyFromUrl = new URLSearchParams(window.location.search).get("id");
    const keyVal = values[keyCol] ?? keyFromUrl;
    if (keyVal === undefined || keyVal === null || keyVal === "") {
      return { ok: false, error: "ต้องมีค่าคีย์หลัก" };
    }
    if (found.form.op === "delete") {
      return supabaseDelete(cfg, table, keyCol, String(keyVal));
    }
    if (found.form.op === "update") {
      return supabaseUpdate(cfg, table, keyCol, String(keyVal), values);
    }
    return { ok: false, error: "op ไม่รองรับ" };
  }

  // ——— localStorage stub ———
  if (found.form.op === "insert") {
    localInsert(table.id, values);
    const identity = table.columns.find((c) => /^(username|email)$/i.test(c.name));
    const hashCol = table.columns.find((c) => c.secret === "argon2id" || /password/i.test(c.name));
    if (identity && hashCol && typeof values[identity.id] === "string" && typeof values[hashCol.id] === "string") {
      const raw = sessionStorage.getItem("wb.auth.users");
      const users = raw ? (JSON.parse(raw) as { identity: string; passwordHash: string }[]) : [];
      const next = users.filter((u) => u.identity !== values[identity.id]);
      next.push({ identity: String(values[identity.id]), passwordHash: String(values[hashCol.id]) });
      sessionStorage.setItem("wb.auth.users", JSON.stringify(next));
    }
    return { ok: true };
  }

  if (found.form.op === "load") {
    const identity = table.columns.find((c) => /^(username|email)$/i.test(c.name));
    const hashCol = table.columns.find((c) => c.secret === "argon2id" || /password/i.test(c.name));
    if (!identity || !hashCol) return { ok: false, error: "ตารางล็อกอินไม่ครบ" };
    const idNode = Object.entries(opts.nodes).find(([, n]) => n.db?.column === identity.id)?.[0];
    const pwNode = Object.entries(opts.nodes).find(([, n]) => n.db?.column === hashCol.id)?.[0];
    const idVal = idNode ? String(byNode[idNode] ?? "") : "";
    const pwVal = pwNode ? String(byNode[pwNode] ?? "") : "";
    return auth.signIn(idVal, pwVal);
  }

  const keyCol = found.form.keyColumnId ?? table.primaryKey[0];
  if (!keyCol) return { ok: false, error: "ไม่มีคีย์หลัก" };
  const keyFromUrl = new URLSearchParams(window.location.search).get("id");
  const keyVal = values[keyCol] ?? keyFromUrl;
  if (keyVal === undefined || keyVal === null || keyVal === "") {
    return { ok: false, error: "ต้องมีค่าคีย์หลัก" };
  }

  const rows = localRead(table.id);
  const idx = rows.findIndex((r) => String(r.values[keyCol] ?? "") === String(keyVal));
  if (found.form.op === "delete") {
    if (idx < 0) return { ok: false, error: "ไม่พบแถว" };
    rows.splice(idx, 1);
    localWrite(table.id, rows);
    return { ok: true };
  }
  if (found.form.op === "update") {
    if (idx < 0) {
      localInsert(table.id, { ...values, [keyCol]: String(keyVal) });
      return { ok: true };
    }
    rows[idx] = { ...rows[idx]!, values: { ...rows[idx]!.values, ...values } };
    localWrite(table.id, rows);
    return { ok: true };
  }

  return { ok: false, error: "op ไม่รองรับ" };
}
