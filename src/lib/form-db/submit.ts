/**
 * Collect bound field values and prepare insert/update payloads (hash secrets).
 */
import type { DbColumn, DbModel, DbTable } from "@/lib/db-model";
import type { AuthAdapter, DbFormBinding, NodeDb } from "@/lib/form-db/types";
import type { Node, NodeId } from "@/schema";

export type CollectedField = {
  nodeId: NodeId;
  columnId: string;
  raw: string | boolean;
  secret?: DbColumn["secret"];
};

function childrenOf(node: Node): NodeId[] {
  if ("children" in node.props && Array.isArray((node.props as { children?: NodeId[] }).children)) {
    return (node.props as { children: NodeId[] }).children;
  }
  return [];
}

/** Walk up from nodeId to find nearest ancestor with db.form. */
export function findAncestorForm(
  nodes: Record<NodeId, Node>,
  nodeId: NodeId,
): { formNodeId: NodeId; form: DbFormBinding } | null {
  const parentOf = new Map<NodeId, NodeId>();
  for (const [id, n] of Object.entries(nodes)) {
    for (const c of childrenOf(n)) parentOf.set(c, id);
  }
  let cur: NodeId | undefined = nodeId;
  while (cur) {
    const n = nodes[cur];
    if (n?.db?.form) return { formNodeId: cur, form: n.db.form };
    cur = parentOf.get(cur);
  }
  return null;
}

/** Collect db.column fields under a form container. */
export function collectFormFields(
  nodes: Record<NodeId, Node>,
  formNodeId: NodeId,
  valuesByNodeId: Record<string, string | boolean>,
): CollectedField[] {
  const out: CollectedField[] = [];
  const walk = (id: NodeId) => {
    const n = nodes[id];
    if (!n) return;
    if (n.db?.column) {
      const raw = valuesByNodeId[id];
      if (raw !== undefined) {
        out.push({ nodeId: id, columnId: n.db.column, raw });
      }
    }
    for (const c of childrenOf(n)) walk(c);
  };
  walk(formNodeId);
  return out;
}

export type PreparedValues = {
  values: Record<string, string | number | boolean | null>;
  /** Column ids that were hashed (never log these). */
  hashedColumns: string[];
};

/**
 * Map collected fields → wire values; hash secret columns via AuthAdapter.
 * Password UI fields write to the secret column only.
 */
export async function prepareSubmitValues(
  table: DbTable,
  fields: CollectedField[],
  auth: AuthAdapter,
): Promise<PreparedValues> {
  const byId = new Map(table.columns.map((c) => [c.id, c]));
  const values: Record<string, string | number | boolean | null> = {};
  const hashedColumns: string[] = [];

  for (const f of fields) {
    const col = byId.get(f.columnId);
    if (!col) continue;
    if (col.secret === "argon2id" || /password/i.test(col.name)) {
      const plain = String(f.raw);
      if (plain === "") continue;
      values[col.id] = await auth.hashPassword(plain);
      hashedColumns.push(col.id);
      continue;
    }
    if (col.type === "boolean") {
      values[col.id] = f.raw === true || f.raw === "true";
      continue;
    }
    if (col.type === "integer") {
      const n = Number(f.raw);
      if (!Number.isFinite(n)) continue;
      values[col.id] = String(Math.trunc(n));
      continue;
    }
    if (col.type === "decimal") {
      const n = Number(f.raw);
      if (!Number.isFinite(n)) continue;
      values[col.id] = String(f.raw);
      continue;
    }
    if (f.raw === "" || f.raw === null) {
      if (col.nullable) values[col.id] = null;
      continue;
    }
    values[col.id] = String(f.raw);
  }

  return { values, hashedColumns };
}

export function tableByForm(model: DbModel, form: DbFormBinding): DbTable | null {
  return model.tables.find((t) => t.id === form.tableId) ?? null;
}

/** Read NodeDb from a node (typed). */
export function nodeDb(node: Node | undefined): NodeDb | undefined {
  return node?.db;
}
