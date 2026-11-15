/**
 * Admin pack: login/signup/dashboard/list/new/edit + relationships.
 */
import { createNode } from "@/lib/document-ops";
import type { DbModel, DbTable } from "@/lib/db-model";
import { analyzeTableToFormFields } from "@/lib/form-db/analyzer";
import { buildFormPageFromTable } from "@/lib/form-db/build-form-page";
import { findReverseForeignKeys, pickLabelColumn } from "@/lib/form-db/relationships";
import type { NodeDb } from "@/lib/form-db/types";
import type { Node, NodeId, PageDocument, ProjectPage } from "@/schema";
import { ensurePages, syncOpenIntoPages } from "@/lib/project-pages";

export type AdminPackMode = "auto" | "guideline";

export type AdminGuidelineItem = {
  adminSource: string;
  path: string;
  name: string;
  kind: "login" | "signup" | "dashboard" | "list" | "new" | "edit";
  tableId?: string;
};

export type AdminPackResult = {
  guideline: AdminGuidelineItem[];
  /** Pages to insert when mode is auto (missing only). */
  pages: ProjectPage[];
  /** Existing adminSource keys that were skipped (already present / customized). */
  skipped: string[];
};

function withDb(node: Node, db: NodeDb): Node {
  return { ...node, db };
}

function heading(content: string, level: 1 | 2 = 2): Node {
  const n = createNode("heading");
  return { ...n, props: { type: "heading", level, content } };
}

function text(content: string): Node {
  const n = createNode("text");
  return { ...n, props: { type: "text", content } };
}

function link(label: string, href: string): Node {
  const n = createNode("link");
  return { ...n, props: { type: "link", label, href } };
}

function button(label: string, action: "dbSubmit" | "none" | "link" = "none", href?: string): Node {
  const n = createNode("button");
  return {
    ...n,
    props: {
      type: "button",
      label,
      action,
      ...(href ? { href } : {}),
    },
  };
}

function input(label: string, inputKind: "text" | "password" = "text"): Node {
  const n = createNode("input");
  return {
    ...n,
    props: { type: "input", label, placeholder: label, inputKind },
  };
}

function pageFromChildren(
  name: string,
  path: string,
  children: Node[],
  adminSource: string,
  extraRootDb?: NodeDb,
): ProjectPage {
  const container = createNode("container");
  const containerNode = withDb(
    {
      ...container,
      props: {
        type: "container",
        children: children.map((c) => c.id),
        direction: "column",
        gap: 12,
      },
    },
    { adminSource, ...extraRootDb },
  );
  const root = createNode("page");
  const pageNode: Node = { ...root, props: { type: "page", children: [containerNode.id] } };
  const nodes: Record<NodeId, Node> = {
    [pageNode.id]: pageNode,
    [containerNode.id]: containerNode,
  };
  for (const c of children) nodes[c.id] = c;
  return {
    id: crypto.randomUUID(),
    name,
    path,
    root: pageNode.id,
    nodes,
  };
}

/** Detect users-like auth table: username/email + secret password. */
export function findAuthTable(model: DbModel): DbTable | null {
  for (const t of model.tables) {
    const hasIdentity = t.columns.some((c) => /^(username|email)$/i.test(c.name));
    const hasSecret = t.columns.some((c) => c.secret === "argon2id" || /password/i.test(c.name));
    if (hasIdentity && hasSecret) return t;
  }
  return null;
}

function existingAdminSources(doc: PageDocument): Map<string, string> {
  const map = new Map<string, string>();
  const pages = ensurePages(doc).pages ?? [];
  for (const p of pages) {
    for (const n of Object.values(p.nodes)) {
      const src = n.db?.adminSource;
      if (src) map.set(src, p.path);
    }
  }
  return map;
}

function buildLoginPage(auth: DbTable): ProjectPage {
  const identityCol = auth.columns.find((c) => /^(username|email)$/i.test(c.name))!;
  const hashCol = auth.columns.find((c) => c.secret === "argon2id" || /password/i.test(c.name))!;
  const h = heading("เข้าสู่ระบบ");
  const idField = withDb(input(identityCol.label || identityCol.name, "text"), { column: identityCol.id });
  const pwField = withDb(input("รหัสผ่าน", "password"), { column: hashCol.id });
  const submit = button("เข้าสู่ระบบ", "dbSubmit");
  const toSignup = link("สมัครสมาชิก", "/signup");
  return pageFromChildren("เข้าสู่ระบบ", "/login", [h, idField, pwField, submit, toSignup], "admin:login", {
    form: { tableId: auth.id, op: "load", keyColumnId: identityCol.id },
  });
}

function buildSignupPage(auth: DbTable): ProjectPage {
  const built = buildFormPageFromTable(auth, { version: 1, tables: [auth] }, {
    path: "/signup",
    name: "สมัครสมาชิก",
    op: "insert",
    adminSource: "admin:signup",
    title: "สมัครสมาชิก",
  });
  return built.page;
}

function buildDashboard(tables: DbTable[]): ProjectPage {
  const h = heading("แดชบอร์ด", 1);
  const intro = text("เลือกตารางเพื่อจัดการข้อมูล");
  const links = tables.map((t) => link(t.label || t.name, `/admin/${t.name}`));
  const logout = button("ออกจากระบบ", "none");
  return pageFromChildren("แดชบอร์ด", "/admin", [h, intro, ...links, logout], "admin:dashboard");
}

function buildListPage(table: DbTable, model: DbModel): ProjectPage {
  const h = heading(table.label || table.name, 1);
  const searchHint = text("ค้นหาได้ทั้งค่าในคอลัมน์และชื่อที่เกี่ยว (FK)");
  const newLink = link("เพิ่มรายการ", `/admin/${table.name}/new`);
  const dash = link("← แดชบอร์ด", "/admin");
  // Placeholder list container — runtime fills rows with resolveFks + search
  const listBox = createNode("container");
  const listNode = withDb(
    {
      ...listBox,
      props: { type: "container", children: [], direction: "column", gap: 8 },
      name: "รายการ",
    },
    {
      list: { tableId: table.id, resolveFks: true, search: true },
      adminSource: `admin:${table.name}:list-body`,
    },
  );
  const labelNote = text(
    analyzeTableToFormFields(table, model)
      .filter((f) => f.lookup)
      .map((f) => `${f.columnName}→lookup`)
      .join(", ") || "ไม่มี FK",
  );
  // list binding only on listNode (avoid double DbListPanel on the page shell)
  return pageFromChildren(
    `รายการ ${table.label || table.name}`,
    `/admin/${table.name}`,
    [dash, h, searchHint, newLink, listNode, labelNote],
    `admin:${table.name}:list`,
  );
}

function buildEditPageWithRelated(table: DbTable, model: DbModel): ProjectPage {
  const built = buildFormPageFromTable(table, model, {
    path: `/admin/${table.name}/edit`,
    name: `แก้ไข ${table.label || table.name}`,
    op: "update",
    adminSource: `admin:${table.name}:edit`,
    title: `แก้ไข ${table.label || table.name}`,
  });

  const reverse = findReverseForeignKeys(model, table.id);
  if (reverse.length === 0) return built.page;

  const nodes = { ...built.page.nodes };
  const formId = built.formContainerId;
  const form = nodes[formId];
  if (!form || form.props.type !== "container") return built.page;

  const extraIds: NodeId[] = [];
  for (const rev of reverse) {
    const title = text(`ที่เกี่ยวข้อง: ${rev.childTable.label || rev.childTable.name}`);
    const panel = createNode("container");
    const panelNode = withDb(
      {
        ...panel,
        props: { type: "container", children: [title.id], direction: "column", gap: 6 },
        name: `related:${rev.childTable.name}`,
      },
      {
        related: { parentTableId: table.id, fkId: rev.fk.id },
        adminSource: `admin:${table.name}:related:${rev.childTable.name}`,
      },
    );
    nodes[title.id] = title;
    nodes[panelNode.id] = panelNode;
    extraIds.push(panelNode.id);
  }

  nodes[formId] = {
    ...form,
    props: { ...form.props, children: [...form.props.children, ...extraIds] },
  };

  return { ...built.page, nodes };
}

export function planAdminPack(
  model: DbModel,
  tableIds: string[] | "all",
): AdminGuidelineItem[] {
  const tables =
    tableIds === "all" ? model.tables : model.tables.filter((t) => tableIds.includes(t.id));
  const items: AdminGuidelineItem[] = [];
  const auth = findAuthTable(model);
  if (auth) {
    items.push({ adminSource: "admin:login", path: "/login", name: "เข้าสู่ระบบ", kind: "login", tableId: auth.id });
    items.push({ adminSource: "admin:signup", path: "/signup", name: "สมัครสมาชิก", kind: "signup", tableId: auth.id });
  }
  items.push({ adminSource: "admin:dashboard", path: "/admin", name: "แดชบอร์ด", kind: "dashboard" });
  for (const t of tables) {
    items.push({
      adminSource: `admin:${t.name}:list`,
      path: `/admin/${t.name}`,
      name: `รายการ ${t.label || t.name}`,
      kind: "list",
      tableId: t.id,
    });
    items.push({
      adminSource: `admin:${t.name}:new`,
      path: `/admin/${t.name}/new`,
      name: `เพิ่ม ${t.label || t.name}`,
      kind: "new",
      tableId: t.id,
    });
    items.push({
      adminSource: `admin:${t.name}:edit`,
      path: `/admin/${t.name}/edit`,
      name: `แก้ไข ${t.label || t.name}`,
      kind: "edit",
      tableId: t.id,
    });
  }
  return items;
}

/**
 * Build admin pages. Skips any adminSource already present in the document
 * (does not overwrite customized pages).
 */
export function buildAdminPack(
  doc: PageDocument,
  model: DbModel,
  opts: { mode: AdminPackMode; tableIds?: string[] | "all" },
): AdminPackResult {
  const tableIds = opts.tableIds ?? "all";
  const tables =
    tableIds === "all" ? model.tables : model.tables.filter((t) => tableIds.includes(t.id));
  const guideline = planAdminPack(model, tableIds);
  const existing = existingAdminSources(doc);
  const skipped: string[] = [];
  const pages: ProjectPage[] = [];

  if (opts.mode === "guideline") {
    return { guideline, pages: [], skipped: [] };
  }

  const auth = findAuthTable(model);
  const want = new Set(guideline.map((g) => g.adminSource));

  const maybeAdd = (source: string, build: () => ProjectPage) => {
    if (!want.has(source)) return;
    if (existing.has(source)) {
      skipped.push(source);
      return;
    }
    pages.push(build());
  };

  if (auth) {
    maybeAdd("admin:login", () => buildLoginPage(auth));
    maybeAdd("admin:signup", () => buildSignupPage(auth));
  }
  maybeAdd("admin:dashboard", () => buildDashboard(tables));

  for (const t of tables) {
    maybeAdd(`admin:${t.name}:list`, () => buildListPage(t, model));
    maybeAdd(`admin:${t.name}:new`, () =>
      buildFormPageFromTable(t, model, {
        path: `/admin/${t.name}/new`,
        name: `เพิ่ม ${t.label || t.name}`,
        op: "insert",
        adminSource: `admin:${t.name}:new`,
        title: `เพิ่ม ${t.label || t.name}`,
      }).page,
    );
    maybeAdd(`admin:${t.name}:edit`, () => buildEditPageWithRelated(t, model));
  }

  return { guideline, pages, skipped };
}

/** Merge generated pages into the document (append). */
export function applyAdminPackPages(doc: PageDocument, pages: ProjectPage[]): PageDocument {
  if (pages.length === 0) return doc;
  const synced = syncOpenIntoPages(ensurePages(doc));
  const nextPages = [...synced.pages!, ...pages];
  const last = pages[pages.length - 1]!;
  return {
    ...synced,
    pages: nextPages,
    root: last.root,
    nodes: last.nodes,
    version: 5,
  };
}

/** Default list column label helper for tests / runtime. */
export function listColumnLabel(table: DbTable, columnId: string): string {
  const c = table.columns.find((col) => col.id === columnId);
  return c?.label || c?.name || columnId;
}

export function defaultListColumns(table: DbTable): string[] {
  const label = pickLabelColumn(table);
  const cols = table.columns
    .filter((c) => !table.primaryKey.includes(c.id) && c.name !== "created_at" && c.name !== "password_hash")
    .map((c) => c.id);
  if (label && !cols.includes(label)) cols.unshift(label);
  return cols.slice(0, 8);
}
