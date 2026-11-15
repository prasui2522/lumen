/**
 * Phase C: Supabase Auth + PostgREST adapters (fetch, no SDK).
 * Enable with VITE_WB_DB_BACKEND=supabase and URL + anon key.
 * Page nodes stay vendor-free — swap only this module / env.
 */
import type { DbQueryResult, RowValues } from "@/lib/wb-db-client";

export type SupabaseAuthAdapter = {
  hashPassword(plain: string): Promise<string>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
  signIn(identity: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  session(): { identity: string } | null;
  requireSession(): boolean;
};

type Model = NonNullable<DbQueryResult["model"]>;
type Table = Model["tables"][number];

const SESSION_KEY = "wb.supabase.session";

type StoredSession = {
  access_token: string;
  refresh_token?: string;
  identity: string;
  expires_at?: number;
};

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

/** True when export should talk to Supabase instead of localStorage. */
export function isSupabaseBackend(): boolean {
  const backend = String(import.meta.env.VITE_WB_DB_BACKEND ?? "local").toLowerCase();
  if (backend !== "supabase") return false;
  return !!supabaseConfig();
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s?.access_token || !s.identity) return null;
    if (s.expires_at && Date.now() / 1000 > s.expires_at - 30) return null;
    return s;
  } catch {
    return null;
  }
}

function writeSession(s: StoredSession | null) {
  if (!s) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

async function authFetch(
  cfg: SupabaseConfig,
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    apikey: cfg.anonKey,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { ok: res.ok, status: res.status, body };
}

export function createSupabaseAuthAdapter(cfg: SupabaseConfig = supabaseConfig()!): SupabaseAuthAdapter {
  return {
    // Supabase Auth hashes server-side; keep stubs for non-auth secret columns if ever called.
    async hashPassword(plain) {
      return plain;
    },
    async verifyPassword() {
      return false;
    },
    async signIn(identity, password) {
      const r = await authFetch(cfg, "/auth/v1/token?grant_type=password", {
        method: "POST",
        json: { email: identity, password },
      });
      if (!r.ok) {
        const msg =
          typeof r.body.error_description === "string"
            ? r.body.error_description
            : typeof r.body.msg === "string"
              ? r.body.msg
              : "เข้าสู่ระบบไม่สำเร็จ";
        return { ok: false, error: msg };
      }
      const access = String(r.body.access_token ?? "");
      const refresh = r.body.refresh_token ? String(r.body.refresh_token) : undefined;
      const expiresIn = typeof r.body.expires_in === "number" ? r.body.expires_in : 3600;
      const user = r.body.user as { email?: string } | undefined;
      writeSession({
        access_token: access,
        refresh_token: refresh,
        identity: user?.email ?? identity,
        expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      });
      return { ok: true };
    },
    async signOut() {
      const s = readSession();
      if (s) {
        await authFetch(cfg, "/auth/v1/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${s.access_token}` },
          json: {},
        }).catch(() => undefined);
      }
      writeSession(null);
    },
    session() {
      const s = readSession();
      return s ? { identity: s.identity } : null;
    },
    requireSession() {
      return readSession() !== null;
    },
  };
}

/** Sign up via GoTrue (used by dbSubmit insert on auth-like tables). */
export async function supabaseSignUp(
  cfg: SupabaseConfig,
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await authFetch(cfg, "/auth/v1/signup", {
    method: "POST",
    json: { email, password },
  });
  if (!r.ok) {
    const msg =
      typeof r.body.msg === "string"
        ? r.body.msg
        : typeof r.body.error_description === "string"
          ? r.body.error_description
          : "สมัครไม่สำเร็จ";
    return { ok: false, error: msg };
  }
  // Some projects return a session immediately.
  const access = r.body.access_token ? String(r.body.access_token) : "";
  if (access) {
    const user = r.body.user as { email?: string } | undefined;
    const expiresIn = typeof r.body.expires_in === "number" ? r.body.expires_in : 3600;
    writeSession({
      access_token: access,
      refresh_token: r.body.refresh_token ? String(r.body.refresh_token) : undefined,
      identity: user?.email ?? email,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    });
  }
  return { ok: true };
}

function bearer(cfg: SupabaseConfig): string {
  return readSession()?.access_token ?? cfg.anonKey;
}

async function rest(
  cfg: SupabaseConfig,
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ ok: boolean; status: number; rows: Record<string, unknown>[] }> {
  const headers: Record<string, string> = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${bearer(cfg)}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  let rows: Record<string, unknown>[] = [];
  try {
    const data = await res.json();
    rows = Array.isArray(data) ? data : [];
  } catch {
    rows = [];
  }
  return { ok: res.ok, status: res.status, rows };
}

function colName(table: Table, columnId: string): string | undefined {
  return table.columns.find((c) => c.id === columnId)?.name;
}

function rowToIds(table: Table, row: Record<string, unknown>): RowValues {
  const out: RowValues = {};
  for (const c of table.columns) {
    if (c.name in row) {
      const v = row[c.name];
      out[c.id] =
        v === null || v === undefined
          ? null
          : typeof v === "boolean" || typeof v === "number"
            ? v
            : String(v);
    }
  }
  return out;
}

function valuesToNames(table: Table, values: RowValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [colId, v] of Object.entries(values)) {
    const name = colName(table, colId);
    if (!name) continue;
    // Never send client-hashed password stubs to Postgres when using Auth.
    if (/password/i.test(name)) continue;
    out[name] = v;
  }
  return out;
}

function findTable(model: Model | undefined, tableId: string): Table | undefined {
  return model?.tables.find((t) => t.id === tableId);
}

function pickLabelColumn(ref: Table): string {
  return (
    ref.columns.find((c) => /^(name|title|code|label|email|username)$/i.test(c.name))?.id ??
    ref.columns[1]?.id ??
    ref.columns[0]!.id
  );
}

/** Answer the same DbQueryResult shape as the localStorage client. */
export async function supabaseQuery(
  cfg: SupabaseConfig,
  model: Model | undefined,
  req: {
    requestId: string;
    kind: string;
    tableId?: string;
    valueColumnId?: string;
    labelColumnId?: string;
    parentTableId?: string;
    fkId?: string;
    parentKey?: string;
  },
): Promise<DbQueryResult> {
  if (req.kind === "model") {
    return { requestId: req.requestId, ok: true, model };
  }
  if (!model) {
    return { requestId: req.requestId, ok: false, error: "ไม่มี dbModel" };
  }

  if (req.kind === "rows" && req.tableId) {
    const table = findTable(model, req.tableId);
    if (!table) return { requestId: req.requestId, ok: false, error: "ไม่พบตาราง" };
    const r = await rest(cfg, `${encodeURIComponent(table.name)}?select=*`);
    if (!r.ok) return { requestId: req.requestId, ok: false, error: `อ่าน ${table.name} ไม่สำเร็จ` };
    const rows = r.rows.map((row, i) => ({ rowid: i + 1, values: rowToIds(table, row) }));
    const refRows: Record<string, RowValues[]> = {};
    for (const fk of table.foreignKeys) {
      if (fk.columns.length !== 1) continue;
      const ref = findTable(model, fk.refTableId);
      if (!ref) continue;
      const rr = await rest(cfg, `${encodeURIComponent(ref.name)}?select=*`);
      if (rr.ok) refRows[ref.id] = rr.rows.map((row) => rowToIds(ref, row));
    }
    return { requestId: req.requestId, ok: true, rows, refRows, tableName: table.name };
  }

  if (req.kind === "lookupOptions" && req.tableId && req.valueColumnId && req.labelColumnId) {
    const table = findTable(model, req.tableId);
    if (!table) return { requestId: req.requestId, ok: true, options: [] };
    const vn = colName(table, req.valueColumnId);
    const ln = colName(table, req.labelColumnId);
    if (!vn || !ln) return { requestId: req.requestId, ok: true, options: [] };
    const r = await rest(
      cfg,
      `${encodeURIComponent(table.name)}?select=${encodeURIComponent(vn)},${encodeURIComponent(ln)}`,
    );
    return {
      requestId: req.requestId,
      ok: true,
      options: r.rows.map((row) => ({
        value: String(row[vn] ?? ""),
        label: String(row[ln] ?? row[vn] ?? ""),
      })),
    };
  }

  if (req.kind === "related" && req.fkId && req.parentKey) {
    const child = model.tables.find((t) => t.foreignKeys.some((f) => f.id === req.fkId));
    const fk = child?.foreignKeys.find((f) => f.id === req.fkId);
    if (!child || !fk || fk.columns.length !== 1) {
      return { requestId: req.requestId, ok: true, rows: [], columns: [] };
    }
    const childColId = fk.columns[0]!;
    const childColName = colName(child, childColId);
    if (!childColName) return { requestId: req.requestId, ok: true, rows: [], columns: [] };
    const r = await rest(
      cfg,
      `${encodeURIComponent(child.name)}?${encodeURIComponent(childColName)}=eq.${encodeURIComponent(req.parentKey)}&select=*`,
    );
    const cols = child.columns
      .filter((c) => !child.primaryKey.includes(c.id))
      .slice(0, 4)
      .map((c) => ({ columnId: c.id, name: c.name, label: c.label || c.name }));
    return {
      requestId: req.requestId,
      ok: true,
      rows: r.rows.map((row, i) => ({ rowid: i + 1, values: rowToIds(child, row) })),
      columns: cols,
      childTableName: child.name,
      editPathPrefix: `/admin/${child.name}/edit`,
      pkColumnId: child.primaryKey[0],
    };
  }

  if (req.kind === "listMeta" && req.tableId) {
    const table = findTable(model, req.tableId);
    if (!table) {
      return {
        requestId: req.requestId,
        ok: true,
        tableName: req.tableId,
        columns: [],
        lookups: {},
        editPathPrefix: "#",
      };
    }
    const lookups: Record<string, { tableId: string; valueColumnId: string; labelColumnId: string }> = {};
    for (const fk of table.foreignKeys) {
      if (fk.columns.length !== 1 || fk.refColumns.length !== 1) continue;
      const ref = findTable(model, fk.refTableId);
      if (!ref) continue;
      lookups[fk.columns[0]!] = {
        tableId: ref.id,
        valueColumnId: fk.refColumns[0]!,
        labelColumnId: pickLabelColumn(ref),
      };
    }
    const columns = table.columns
      .filter((c) => !table.primaryKey.includes(c.id) && c.name !== "created_at" && c.name !== "password_hash")
      .slice(0, 8)
      .map((c) => ({ columnId: c.id, name: c.name, label: c.label || c.name }));
    return {
      requestId: req.requestId,
      ok: true,
      tableName: table.name,
      columns,
      pkColumnId: table.primaryKey[0],
      lookups,
      editPathPrefix: `/admin/${table.name}/edit`,
    };
  }

  return { requestId: req.requestId, ok: true };
}

export async function supabaseInsert(
  cfg: SupabaseConfig,
  table: Table,
  values: RowValues,
): Promise<{ ok: boolean; error?: string }> {
  const payload = valuesToNames(table, values);
  const r = await rest(cfg, encodeURIComponent(table.name), { method: "POST", json: payload });
  if (!r.ok) return { ok: false, error: `เพิ่มแถวใน ${table.name} ไม่สำเร็จ` };
  return { ok: true };
}

export async function supabaseUpdate(
  cfg: SupabaseConfig,
  table: Table,
  keyColId: string,
  keyVal: string,
  values: RowValues,
): Promise<{ ok: boolean; error?: string }> {
  const keyName = colName(table, keyColId);
  if (!keyName) return { ok: false, error: "ไม่มีคีย์หลัก" };
  const payload = valuesToNames(table, values);
  delete payload[keyName];
  const r = await rest(
    cfg,
    `${encodeURIComponent(table.name)}?${encodeURIComponent(keyName)}=eq.${encodeURIComponent(keyVal)}`,
    { method: "PATCH", json: payload },
  );
  if (!r.ok) return { ok: false, error: `อัปเดต ${table.name} ไม่สำเร็จ` };
  return { ok: true };
}

export async function supabaseDelete(
  cfg: SupabaseConfig,
  table: Table,
  keyColId: string,
  keyVal: string,
): Promise<{ ok: boolean; error?: string }> {
  const keyName = colName(table, keyColId);
  if (!keyName) return { ok: false, error: "ไม่มีคีย์หลัก" };
  const r = await rest(
    cfg,
    `${encodeURIComponent(table.name)}?${encodeURIComponent(keyName)}=eq.${encodeURIComponent(keyVal)}`,
    { method: "DELETE" },
  );
  if (!r.ok) return { ok: false, error: `ลบจาก ${table.name} ไม่สำเร็จ` };
  return { ok: true };
}

export function isAuthLikeTable(table: Table): boolean {
  const hasIdentity = table.columns.some((c) => /^(username|email)$/i.test(c.name));
  const hasSecret = table.columns.some((c) => /password/i.test(c.name));
  return hasIdentity && hasSecret;
}
