/**
 * Phase 11 D2: insert a validated StyleBlock into a page document.
 * Distinct from Phase 5B `insertBlock(BlockId)` in node-actions.
 */
import type { Node, NodeId, PageDocument } from "@/schema";
import { getChildren } from "@/schema";
import { insertNode, isContentLocked, resolveInsertTarget } from "@/lib/document-ops";
import { templateInsertIndex } from "@/lib/templates";
import {
  validateBlock,
  type StyleBlock,
} from "@/lib/block-format";
import { cleanMotion, cleanStates, cleanStyle } from "@/lib/breakpoints";
import type { NodeMotion } from "@/schema";

export type InsertBlockPosition =
  /** Top-level page slot; omit `index` → `templateInsertIndex` (after selection / end). */
  | { kind: "page"; index?: number }
  | { kind: "inline"; parentId: NodeId; index: number };

export type InsertBlockResult = {
  doc: PageDocument;
  rootId: NodeId;
  /** New ids are never equal to registry localIds. */
  idMap: Record<string, string>;
};

/**
 * Remap only node-id references. A deep remap of every string would also rewrite
 * layout enums when a localId collides (e.g. localId `row` + `direction: "row"`).
 */
function remapProps(
  props: Record<string, unknown>,
  idMap: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...props };
  const children = out.children;
  if (Array.isArray(children)) {
    out.children = children.map((c) =>
      typeof c === "string" ? (idMap[c] ?? c) : c,
    );
  }
  return out;
}

/** Materialise registry nodes with fresh UUIDs (localIds remapped). */
export function materialiseBlock(block: StyleBlock): {
  nodes: Node[];
  rootId: NodeId;
  idMap: Record<string, string>;
} {
  const idMap: Record<string, string> = {};
  for (const lid of Object.keys(block.nodes)) {
    let id = crypto.randomUUID();
    // Extremely unlikely, but never reuse a registry localId as the new id.
    while (id === lid || idMap[lid] === id) id = crypto.randomUUID();
    idMap[lid] = id;
  }
  const nodes: Node[] = [];
  for (const [lid, bn] of Object.entries(block.nodes)) {
    const id = idMap[lid]!;
    const props = remapProps(
      bn.props as unknown as Record<string, unknown>,
      idMap,
    ) as Node["props"];
    const node: Node = {
      id,
      type: bn.type,
      props,
      style: cleanStyle(bn.style ?? {}) ?? {},
    };
    if (bn.name?.trim()) node.name = bn.name.trim();
    if (bn.states) {
      const st = cleanStates(bn.states as Node["states"]);
      if (st) node.states = st;
    }
    if (bn.styleBreakpoints) {
      node.styleBreakpoints = bn.styleBreakpoints as Node["styleBreakpoints"];
    }
    if (bn.motion) {
      const motion = cleanMotion(bn.motion as NodeMotion);
      if (motion) node.motion = motion;
    }
    nodes.push(node);
  }
  return { nodes, rootId: idMap[block.root]!, idMap };
}

/**
 * Insert a style block. Validates first; invalid → null (T146 at UI layer).
 * Page scope → top-level slot; inline → palette-like target (or explicit position).
 */
export function insertBlock(
  doc: PageDocument,
  selectedId: NodeId | null,
  blockInput: StyleBlock | unknown,
  position?: InsertBlockPosition,
): InsertBlockResult | null {
  const { block, errors } = validateBlock(blockInput);
  if (!block || errors.length) return null;

  const page = doc.nodes[doc.root];
  if (!page || page.props.type !== "page") return null;
  if (isContentLocked(doc, page)) return null;

  const { nodes, rootId, idMap } = materialiseBlock(block);
  for (const n of nodes) {
    if (doc.nodes[n.id]) return null;
  }

  // Explicit inline wins (⋯ T144) even for page-scoped blocks.
  if (position?.kind === "inline") {
    return insertInline(doc, nodes, rootId, idMap, position.parentId, position.index);
  }

  if (block.scope === "page" || position?.kind === "page") {
    const kids = [...getChildren(page)];
    let index: number;
    if (position?.kind === "page" && typeof position.index === "number") {
      index = Math.max(0, Math.min(position.index, kids.length));
    } else {
      const computed = templateInsertIndex(doc, selectedId);
      if (computed === null) return null;
      index = computed;
    }
    kids.splice(index, 0, rootId);
    const nextNodes: PageDocument["nodes"] = {
      ...doc.nodes,
      [doc.root]: { ...page, props: { ...page.props, children: kids } },
    };
    for (const n of nodes) nextNodes[n.id] = n;
    return { doc: { ...doc, nodes: nextNodes }, rootId, idMap };
  }

  // inline scope, default target
  const target = resolveInsertTarget(doc, selectedId);
  if (!target) return null;
  return insertInline(doc, nodes, rootId, idMap, target.parentId, target.index);
}

function insertInline(
  doc: PageDocument,
  nodes: Node[],
  rootId: NodeId,
  idMap: Record<string, string>,
  parentId: NodeId,
  index: number,
): InsertBlockResult | null {
  const parent = doc.nodes[parentId];
  if (!parent || isContentLocked(doc, parent)) return null;

  // Seed non-root nodes first (`insertNode` refuses an id that already exists).
  let next: PageDocument = { ...doc, nodes: { ...doc.nodes } };
  const rootNode = nodes.find((n) => n.id === rootId)!;
  for (const n of nodes) {
    if (n.id !== rootId) next.nodes[n.id] = n;
  }
  const inserted = insertNode(next, rootNode, parentId, index);
  if (!inserted) return null;
  return { doc: inserted, rootId, idMap };
}
