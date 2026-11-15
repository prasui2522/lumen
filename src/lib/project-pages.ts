import { isLocked, type Node, type PageDocument, type ProjectPage } from "@/schema";

const RESERVED = new Set(["index", "assets", "styles"]);
/** One path segment (Phase 8). */
const SEGMENT = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
/** Nested paths for admin pack, e.g. `/admin/products/new` (1–4 segments). */
const NESTED_PATH = /^\/[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?){0,3}$/;

/** Thai inline error when a path change is rejected. */
export type PathError =
  | "ว่าง"
  | "รูปแบบไม่ถูกต้อง"
  | "ชื่อสงวนไว้"
  | "ซ้ำ";

export function emptyPageNode(): Node {
  const id = crypto.randomUUID();
  return {
    id,
    type: "page",
    props: { type: "page", children: [] },
    style: {},
  };
}

export function makeProjectPage(name: string, path: string): ProjectPage {
  const root = emptyPageNode();
  return {
    id: crypto.randomUUID(),
    name,
    path,
    root: root.id,
    nodes: { [root.id]: root },
  };
}

/** Ensure `pages` exists (home first). Does not rewrite version. */
export function ensurePages(doc: PageDocument): PageDocument {
  if (doc.pages && doc.pages.length > 0) {
    const home = doc.pages[0];
    if (home.path !== "/") {
      const pages = [{ ...home, path: "/" }, ...doc.pages.slice(1)];
      return { ...doc, pages };
    }
    return doc;
  }
  return {
    ...doc,
    pages: [
      {
        id: crypto.randomUUID(),
        name: "หน้าแรก",
        path: "/",
        root: doc.root,
        nodes: doc.nodes,
      },
    ],
  };
}

export function openPageIdOf(doc: PageDocument): string {
  const d = ensurePages(doc);
  const match = d.pages!.find((p) => p.root === doc.root);
  return match?.id ?? d.pages![0].id;
}

/** Write the open tree back into its `pages` entry. */
export function syncOpenIntoPages(doc: PageDocument, openPageId?: string | null): PageDocument {
  const d = ensurePages(doc);
  const id = openPageId ?? openPageIdOf(d);
  const pages = d.pages!.map((p) =>
    p.id === id ? { ...p, root: doc.root, nodes: doc.nodes } : p,
  );
  return { ...d, pages };
}

export function pageById(doc: PageDocument, id: string): ProjectPage | null {
  return ensurePages(doc).pages!.find((p) => p.id === id) ?? null;
}

export function switchToPage(doc: PageDocument, toPageId: string): PageDocument | null {
  const synced = syncOpenIntoPages(doc);
  const page = synced.pages!.find((p) => p.id === toPageId);
  if (!page) return null;
  return { ...synced, root: page.root, nodes: page.nodes };
}

/**
 * Dirty for the whole project: meta + every page's id/name/path/root/nodes.
 * Ignores which page is currently open (root/nodes view).
 */
export function isProjectDirty(doc: PageDocument, saved: PageDocument | null): boolean {
  if (!saved) return true;
  if (doc.meta !== saved.meta) return true;
  const a = ensurePages(doc).pages!;
  const b = ensurePages(saved).pages!;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.path !== y.path ||
      x.root !== y.root ||
      x.nodes !== y.nodes
    ) {
      return true;
    }
  }
  return false;
}

/** Toggle `locked` on a page's root node. One undo when applied via updateOpenDocument. */
export function togglePageRootLocked(doc: PageDocument, pageId: string): PageDocument | null {
  const synced = syncOpenIntoPages(doc);
  const page = synced.pages!.find((p) => p.id === pageId);
  if (!page) return null;
  const root = page.nodes[page.root];
  if (!root) return null;
  const nextLocked = !isLocked(root);
  let nextRoot: Node;
  if (nextLocked) {
    nextRoot = { ...root, locked: true };
  } else {
    const { locked: _drop, ...rest } = root;
    nextRoot = rest;
  }
  const nodes = { ...page.nodes, [page.root]: nextRoot };
  const pages = synced.pages!.map((p) => (p.id === pageId ? { ...p, nodes } : p));
  if (synced.root === page.root) {
    return { ...synced, pages, nodes };
  }
  return { ...synced, pages };
}

/** Normalize user input: trim, lowercase, ensure leading `/`. */
export function normalizePathInput(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/**
 * Validate a non-home path. Home (`/`) is not validated here.
 * Returns a Thai error code, or null when ok.
 */
export function validatePagePath(
  path: string,
  pages: ProjectPage[],
  selfId?: string,
): PathError | null {
  if (path === "/") return "รูปแบบไม่ถูกต้อง";
  if (!path.startsWith("/")) return "รูปแบบไม่ถูกต้อง";
  const seg = path.slice(1);
  if (!seg) return "ว่าง";
  if (!NESTED_PATH.test(path)) return "รูปแบบไม่ถูกต้อง";
  const parts = seg.split("/");
  for (const part of parts) {
    if (!SEGMENT.test(part)) return "รูปแบบไม่ถูกต้อง";
    if (RESERVED.has(part)) return "ชื่อสงวนไว้";
  }
  const clash = pages.some((p) => p.id !== selfId && p.path === path);
  if (clash) return "ซ้ำ";
  return null;
}

export function pathErrorMessage(err: PathError): string {
  switch (err) {
    case "ว่าง":
      return "กรุณาใส่เส้นทาง";
    case "รูปแบบไม่ถูกต้อง":
      return "ใช้ a-z, 0-9, ขีดกลาง 1–40 ตัวต่อช่วง หลัง / (ได้หลายช่วง เช่น /admin/products/new)";
    case "ชื่อสงวนไว้":
      return "ชื่อนี้สงวนไว้";
    case "ซ้ำ":
      return "เส้นทางนี้มีแล้ว";
  }
}

/** First free `/page-2`, `/page-3`, … */
export function nextDefaultPath(pages: ProjectPage[]): string {
  let n = 2;
  const used = new Set(pages.map((p) => p.path));
  while (used.has(`/page-${n}`)) n += 1;
  return `/page-${n}`;
}

/** Insert a new page after the open page. Returns the new doc and new page id. */
export function addPage(doc: PageDocument, openPageId: string): { doc: PageDocument; pageId: string } {
  const synced = syncOpenIntoPages(doc, openPageId);
  const pages = [...synced.pages!];
  const idx = Math.max(0, pages.findIndex((p) => p.id === openPageId));
  const page = makeProjectPage("หน้าใหม่", nextDefaultPath(pages));
  pages.splice(idx + 1, 0, page);
  return {
    doc: { ...synced, pages, root: page.root, nodes: page.nodes },
    pageId: page.id,
  };
}

export function renamePage(doc: PageDocument, pageId: string, name: string): PageDocument | null {
  const synced = syncOpenIntoPages(doc);
  const pages = synced.pages!.map((p) => (p.id === pageId ? { ...p, name } : p));
  if (!synced.pages!.some((p) => p.id === pageId)) return null;
  return { ...synced, pages };
}

export function setPagePath(doc: PageDocument, pageId: string, raw: string): { doc: PageDocument } | { error: PathError } {
  const synced = syncOpenIntoPages(doc);
  const page = synced.pages!.find((p) => p.id === pageId);
  if (!page) return { error: "รูปแบบไม่ถูกต้อง" };
  if (page.path === "/") return { error: "รูปแบบไม่ถูกต้อง" };
  // normalizePathInput("") becomes "/" and would miss the ว่าง message.
  if (!raw.trim()) return { error: "ว่าง" };
  const path = normalizePathInput(raw);
  const err = validatePagePath(path, synced.pages!, pageId);
  if (err) return { error: err };
  const pages = synced.pages!.map((p) => (p.id === pageId ? { ...p, path } : p));
  return { doc: { ...synced, pages } };
}

/** Move page up/down among non-home pages. Home stays index 0. */
export function movePage(doc: PageDocument, pageId: string, dir: -1 | 1): PageDocument | null {
  const synced = syncOpenIntoPages(doc);
  const pages = [...synced.pages!];
  const i = pages.findIndex((p) => p.id === pageId);
  if (i <= 0) return null; // missing or home
  const j = i + dir;
  if (j <= 0 || j >= pages.length) return null;
  const tmp = pages[i]!;
  pages[i] = pages[j]!;
  pages[j] = tmp;
  return { ...synced, pages };
}

/**
 * Delete a non-home page. Returns the doc opened on `focusPageId`
 * (previous sibling, else home).
 */
export function deletePage(
  doc: PageDocument,
  pageId: string,
): { doc: PageDocument; focusPageId: string } | null {
  const synced = syncOpenIntoPages(doc);
  const pages = synced.pages!;
  const i = pages.findIndex((p) => p.id === pageId);
  if (i <= 0) return null;
  const focusPageId = pages[i - 1]!.id;
  const nextPages = pages.filter((p) => p.id !== pageId);
  const focus = nextPages.find((p) => p.id === focusPageId) ?? nextPages[0]!;
  return {
    doc: { ...synced, pages: nextPages, root: focus.root, nodes: focus.nodes },
    focusPageId: focus.id,
  };
}

/** HTML file name for a page path (`/` → index.html). */
export function pageHtmlName(path: string): string {
  if (path === "/") return "index.html";
  return `${path.slice(1)}.html`;
}

export function pageCssName(path: string): string {
  if (path === "/") return "styles.css";
  return `${path.slice(1)}.css`;
}

/** Map page paths (and trailing-slash forms) → relative HTML file. */
export function pagePathHrefMap(pages: ProjectPage[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of pages) {
    const file = pageHtmlName(p.path);
    map[p.path] = file;
    if (p.path !== "/") map[`${p.path}/`] = file;
  }
  return map;
}
