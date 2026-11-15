/**
 * Build a form page (or field nodes) from analyzeTableToFormFields.
 */
import { createNode } from "@/lib/document-ops";
import type { DbModel, DbTable } from "@/lib/db-model";
import { analyzeTableToFormFields, widgetToInputKind } from "@/lib/form-db/analyzer";
import type { AnalyzedFormField, DbFormOp, NodeDb } from "@/lib/form-db/types";
import type { InputProps, Node, NodeId, ProjectPage } from "@/schema";

function heading(content: string): Node {
  const n = createNode("heading");
  return { ...n, props: { type: "heading", level: 2, content } };
}

function withDb(node: Node, db: NodeDb): Node {
  return { ...node, db };
}

function fieldFromAnalyzed(f: AnalyzedFormField): Node | null {
  if (f.widget === "skip" || f.widget === "hint") return null;

  if (f.widget === "textarea") {
    const n = createNode("textarea");
    return withDb(
      { ...n, props: { type: "textarea", label: f.label, placeholder: f.label } },
      { column: f.columnId },
    );
  }

  if (f.widget === "switch" || f.widget === "checkbox") {
    const n = createNode("switch");
    return withDb({ ...n, props: { type: "switch", label: f.label, checked: false } }, { column: f.columnId });
  }

  if (f.widget === "select") {
    const n = createNode("select");
    const options = f.lookup ? [] : []; // options filled at runtime from lookup / enum
    const node = withDb(
      { ...n, props: { type: "select", value: "", options } },
      f.lookup ? { column: f.columnId, lookup: f.lookup } : { column: f.columnId },
    );
    return node;
  }

  const n = createNode("input");
  const inputKind = widgetToInputKind(f.widget) ?? f.inputKind ?? "text";
  const props: InputProps = {
    type: "input",
    label: f.label,
    placeholder: f.label,
    inputKind,
  };
  return withDb({ ...n, props }, { column: f.columnId });
}

export function buildFormFieldNodes(fields: AnalyzedFormField[]): Node[] {
  const nodes: Node[] = [];
  for (const f of fields) {
    const node = fieldFromAnalyzed(f);
    if (node) nodes.push(node);
  }
  return nodes;
}

export type BuiltFormPage = {
  page: ProjectPage;
  /** Root container with db.form */
  formContainerId: NodeId;
};

/**
 * Create a standalone project page with dbForm insert/update + fields + submit.
 */
export function buildFormPageFromTable(
  table: DbTable,
  model: DbModel,
  opts: {
    path: string;
    name?: string;
    op?: DbFormOp;
    adminSource?: string;
    title?: string;
  },
): BuiltFormPage {
  const op = opts.op ?? "insert";
  const analyzed = analyzeTableToFormFields(table, model);
  const fieldNodes = buildFormFieldNodes(analyzed);
  const h = heading(opts.title ?? opts.name ?? table.label ?? table.name);
  const submit = createNode("button");
  const submitNode: Node = {
    ...submit,
    props: {
      type: "button",
      label: op === "update" ? "บันทึกการแก้ไข" : op === "delete" ? "ลบ" : "บันทึก",
      action: "dbSubmit",
    },
  };

  const childIds = [h.id, ...fieldNodes.map((n) => n.id), submitNode.id];
  const form = createNode("container");
  const formDb: NodeDb = {
    form: {
      tableId: table.id,
      op,
      keyColumnId: op === "insert" ? undefined : table.primaryKey[0],
    },
    adminSource: opts.adminSource,
  };
  const formNode = withDb(
    { ...form, props: { type: "container", children: childIds, direction: "column", gap: 12 } },
    formDb,
  );

  const pageNode: Node = {
    id: crypto.randomUUID(),
    type: "page",
    style: {},
    props: { type: "page", children: [formNode.id] },
  };

  const nodes: Record<NodeId, Node> = {
    [pageNode.id]: pageNode,
    [formNode.id]: formNode,
    [h.id]: h,
    [submitNode.id]: submitNode,
  };
  for (const n of fieldNodes) nodes[n.id] = n;

  return {
    formContainerId: formNode.id,
    page: {
      id: crypto.randomUUID(),
      name: opts.name ?? table.label ?? table.name,
      path: opts.path,
      root: pageNode.id,
      nodes,
    },
  };
}

/** Bound column ids under a container subtree. */
export function collectBoundColumnIds(nodes: Record<NodeId, Node>, rootId: NodeId): Set<string> {
  const out = new Set<string>();
  const walk = (id: NodeId) => {
    const n = nodes[id];
    if (!n) return;
    if (n.db?.column) out.add(n.db.column);
    const children =
      "children" in n.props && Array.isArray((n.props as { children?: NodeId[] }).children)
        ? (n.props as { children: NodeId[] }).children
        : [];
    for (const c of children) walk(c);
  };
  walk(rootId);
  return out;
}

/** Append missing analyzed fields into a form container (returns new nodes map). */
export function appendMissingFields(
  nodes: Record<NodeId, Node>,
  formContainerId: NodeId,
  table: DbTable,
  model: DbModel,
): Record<NodeId, Node> | null {
  const form = nodes[formContainerId];
  if (!form || form.props.type !== "container") return null;
  const bound = collectBoundColumnIds(nodes, formContainerId);
  const missing = analyzeTableToFormFields(table, model).filter(
    (f) => f.widget !== "skip" && f.widget !== "hint" && !bound.has(f.columnId),
  );
  if (missing.length === 0) return null;
  const added = buildFormFieldNodes(missing);
  const nextNodes = { ...nodes };
  for (const n of added) nextNodes[n.id] = n;
  const children = [...form.props.children];
  // Insert before last child if it is a submit button
  const lastId = children[children.length - 1];
  const last = lastId ? nextNodes[lastId] : null;
  const insertAt =
    last?.props.type === "button" && last.props.action === "dbSubmit" ? children.length - 1 : children.length;
  children.splice(insertAt, 0, ...added.map((n) => n.id));
  nextNodes[formContainerId] = {
    ...form,
    props: { ...form.props, children },
  };
  return nextNodes;
}

export function buildHintLines(table: DbTable, model: DbModel): string[] {
  return analyzeTableToFormFields(table, model).map((f) => {
    if (f.widget === "skip") return `• ${f.columnName}: ข้าม (${f.reason})`;
    if (f.widget === "hint") return `• ${f.columnName}: เลือกเอง (${f.reason})`;
    return `• ${f.columnName} → ${f.widget}${f.lookup ? " + lookup" : ""}`;
  });
}
