import type {
  Node,
  NodeId,
  PageDocument,
  ProjectPage,
  StyleBreakpoint,
  StyleBreakpoints,
  StyleProps,
} from "@/schema";
import { isVersion4Kind } from "@/schema";
import { ensurePages, openPageIdOf, syncOpenIntoPages } from "@/lib/project-pages";
import { previewPageMarkers, previewPagePaths } from "@/lib/preview-links";

const BREAKPOINTS: readonly StyleBreakpoint[] = ["tablet", "phone", "foldOpen"];

/** Drop keys whose value is unset. An empty object is not an override. */
export function cleanStyle(style: StyleProps | undefined): StyleProps | undefined {
  if (!style) return undefined;
  const out: StyleProps = {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue;
    // B1.2: empty array/object ≡ unset (boxShadow [] must not keep a breakpoint alive).
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0
    ) {
      continue;
    }
    (out as Record<string, unknown>)[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function cleanBreakpoints(map: StyleBreakpoints | undefined): StyleBreakpoints | undefined {
  if (!map) return undefined;
  const out: StyleBreakpoints = {};
  for (const key of BREAKPOINTS) {
    const style = cleanStyle(map[key]);
    if (style) out[key] = style;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function hasBreakpointOverride(doc: PageDocument): boolean {
  const pages = ensurePages(doc).pages!;
  return pages.some((page) =>
    Object.values(page.nodes).some((node) => cleanBreakpoints(node.styleBreakpoints) !== undefined),
  );
}

function cleanNodes(nodes: Record<NodeId, Node>): {
  nodes: Record<NodeId, Node>;
  anyBp: boolean;
  field: boolean;
  v4: boolean;
} {
  let anyBp = false;
  let field = false;
  let v4 = false;
  const out: Record<NodeId, Node> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (isVersion4Kind(node.type)) v4 = true; // includes the A3 checkbox (§4.4)
    else if (node.type === "input" || node.type === "switch") field = true;
    const map = cleanBreakpoints(node.styleBreakpoints);
    if (map) {
      anyBp = true;
      out[id] = { ...node, styleBreakpoints: map };
    } else if (node.styleBreakpoints) {
      const { styleBreakpoints: _drop, ...rest } = node;
      out[id] = rest;
    } else {
      out[id] = node;
    }
  }
  return { nodes: out, anyBp, field, v4 };
}

function versionFromFlags(v4: boolean, field: boolean, anyBp: boolean): 1 | 2 | 3 | 4 {
  return v4 ? 4 : field ? 3 : anyBp ? 2 : 1;
}

/**
 * What a save writes. Two or more pages → version 5 with `pages`. One page →
 * versions 1–4 under the live rule (6b → 4, input/switch → 3, breakpoint → 2,
 * else 1). Does not rewrite merely by opening.
 */
export function documentForSave(doc: PageDocument): PageDocument {
  const synced = syncOpenIntoPages(ensurePages(doc));
  const openId = openPageIdOf(synced);
  const cleanedPages: ProjectPage[] = synced.pages!.map((page) => {
    const { nodes } = cleanNodes(page.nodes);
    return { ...page, nodes };
  });
  const openPage = cleanedPages.find((p) => p.id === openId) ?? cleanedPages[0]!;
  if (cleanedPages.length >= 2) {
    return {
      version: 5,
      meta: synced.meta,
      root: openPage.root,
      nodes: openPage.nodes,
      pages: cleanedPages,
    };
  }
  const only = cleanedPages[0]!;
  const { nodes, anyBp, field, v4 } = cleanNodes(only.nodes);
  return {
    version: versionFromFlags(v4, field, anyBp),
    meta: synced.meta,
    root: only.root,
    nodes,
    pages: [{ ...only, nodes }],
  };
}

/** JSON body for save/export: single-page omits `pages`; v5 omits top-level root/nodes. */
export function wireDocumentForSave(doc: PageDocument): Record<string, unknown> {
  const prepared = documentForSave(doc);
  if (prepared.version === 5 && prepared.pages && prepared.pages.length >= 2) {
    return { version: 5, meta: prepared.meta, pages: prepared.pages };
  }
  return {
    version: prepared.version,
    meta: prepared.meta,
    root: prepared.root,
    nodes: prepared.nodes,
  };
}

/**
 * Open page only for compile_preview. `pagePaths` maps every authored page
 * form to its file; `pageMarkers` maps each file except the open page's to
 * its inert marker href (PHASE-9-SPEC §6), so Preview page links switch pages
 * and every other link stays without href. Export never gets markers.
 */
export function documentForPreview(doc: PageDocument): Record<string, unknown> {
  const synced = syncOpenIntoPages(ensurePages(doc));
  const pages = synced.pages!;
  return {
    version: preparedVersionForCompile(synced),
    meta: synced.meta,
    root: synced.root,
    nodes: synced.nodes,
    pagePaths: previewPagePaths(pages),
    pageMarkers: previewPageMarkers(pages, openPageIdOf(synced)),
    // B0.2 item 3: real page id for data-wb-page (Preview emits it too).
    pageId: openPageIdOf(synced),
  };
}

function preparedVersionForCompile(doc: PageDocument): number {
  // Compiler ignores version for rendering; keep a 1–4 marker.
  return doc.version === 5 ? 4 : doc.version;
}

/**
 * Set one breakpoint's overrides. The base `style` object is copied through
 * unchanged. An empty patch removes that breakpoint. Version is not bumped
 * here; `documentForSave` does that.
 */
export function withBreakpoint(
  doc: PageDocument,
  nodeId: NodeId,
  breakpoint: StyleBreakpoint,
  patch: StyleProps | undefined,
): PageDocument | null {
  const node = doc.nodes[nodeId];
  if (!node) return null;
  const prev = node.styleBreakpoints ?? {};
  const nextMap = cleanBreakpoints({ ...prev, [breakpoint]: cleanStyle(patch) });
  const nextNode = { ...node, style: node.style };
  if (nextMap) nextNode.styleBreakpoints = nextMap;
  else delete nextNode.styleBreakpoints;
  return { ...doc, nodes: { ...doc.nodes, [nodeId]: nextNode } };
}
