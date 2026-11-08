import {
  createNode,
  findParent,
  insertNode,
  isContentLocked,
  moveNodeInDocument,
  removeNode,
  resolveInsertTarget,
  textPropKey,
  type PaletteType,
} from "@/lib/document-ops";
import { applyTemplate, buildTemplate, templateInsertIndex, type TemplateId } from "@/lib/templates";
import { buildBlock, type BlockId } from "@/lib/blocks";
import {
  insertBlock as insertStyleBlockTree,
} from "@/lib/block-insert";
import type { StyleBlock } from "@/lib/block-format";
import { buildPage, type PageId } from "@/lib/pages";
import { getChildren, type NodeId, type PageDocument } from "@/schema";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";

/**
 * Node commands shared by the canvas keyboard handler and the layers context
 * menu (UI-REFRESH S5), so selection fallback, focus restore and undo stay
 * identical. Each successful action = one `updateOpenDocument` without a
 * history key = exactly one undo step. Locked / root nodes are rejected by
 * the underlying document-ops (null → nothing written).
 */

const doc = (): PageDocument | null => useProjectsStore.getState().openDocument;

/** Delete node + subtree; select next sibling → previous → parent. */
export function deleteNodeAction(nodeId: NodeId, focusScope?: HTMLElement | null): boolean {
  const d = doc();
  if (!d || nodeId === d.root) return false;
  const res = removeNode(d, nodeId);
  if (!res) return false;
  useProjectsStore.getState().updateOpenDocument(res.document);
  useEditorStore.getState().setSelectedNodeId(res.nextSelectedId);
  // Deleted layer row unmounts → keep focus inside the allowed scope: the
  // newly selected layer row when the scope is the layers list (roving
  // tabindex entry point), else the scope itself (canvas).
  if (focusScope) {
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (a && a !== document.body) return;
      const sel = useEditorStore.getState().selectedNodeId;
      const row = sel
        ? focusScope.querySelector<HTMLElement>(`[data-layer-row][data-layer-id="${CSS.escape(sel)}"]`)
        : null;
      (row ?? focusScope).focus({ preventScroll: true });
    });
  }
  return true;
}

export function canDeleteNode(d: PageDocument, nodeId: NodeId): boolean {
  return nodeId !== d.root && removeNode(d, nodeId) !== null;
}

/** Same-parent move by one position; null when at the edge or not allowed. */
function movedDoc(d: PageDocument, nodeId: NodeId, dir: -1 | 1): PageDocument | null {
  const p = findParent(d, nodeId);
  if (!p) return null;
  const kids = getChildren(d.nodes[p.parentId]);
  const to = p.index + dir;
  if (to < 0 || to >= kids.length) return null;
  // moveNodeInDocument takes the pre-remove index (it adjusts same-parent moves).
  return moveNodeInDocument(d, nodeId, p.parentId, dir < 0 ? to : to + 1);
}

export function canMoveNode(d: PageDocument, nodeId: NodeId, dir: -1 | 1): boolean {
  return movedDoc(d, nodeId, dir) !== null;
}

export function moveNodeAction(nodeId: NodeId, dir: -1 | 1): boolean {
  const d = doc();
  if (!d) return false;
  const next = movedDoc(d, nodeId, dir);
  if (!next) return false;
  useProjectsStore.getState().updateOpenDocument(next);
  return true;
}

/** Same rule as the canvas Enter key. */
export function canEditText(d: PageDocument, nodeId: NodeId): boolean {
  const n = d.nodes[nodeId];
  return !!n && !!textPropKey(n) && !isContentLocked(d, n);
}

export function editTextAction(nodeId: NodeId): boolean {
  const d = doc();
  if (!d || !canEditText(d, nodeId)) return false;
  useEditorStore.getState().setSelectedNodeId(nodeId);
  useEditorStore.getState().setEditingNodeId(nodeId);
  return true;
}

/** Same insert as an ElementPalette click: at the selection, then select the new node. */
export function insertPaletteNode(type: PaletteType): boolean {
  const d = doc();
  if (!d) return false;
  const target = resolveInsertTarget(d, useEditorStore.getState().selectedNodeId);
  if (!target) return false;
  const node = createNode(type);
  const next = insertNode(d, node, target.parentId, target.index);
  if (!next) return false;
  useProjectsStore.getState().updateOpenDocument(next);
  useEditorStore.getState().setSelectedNodeId(node.id);
  return true;
}

/** Page can take a template as its next child (page itself is not locked). */
export function canInsertTemplate(d: PageDocument | null): boolean {
  return !!d && templateInsertIndex(d, null) !== null;
}

/**
 * Insert one template as a single undo step. Selects and focuses the first
 * heading (the copyright line, for ท้ายหน้า, which has no heading).
 */
export function insertTemplate(id: TemplateId): boolean {
  const d = doc();
  if (!d) return false;
  const built = buildTemplate(id);
  const next = applyTemplate(d, useEditorStore.getState().selectedNodeId, built);
  if (!next) return false;
  useProjectsStore.getState().updateOpenDocument(next);
  // Selection is unchanged: still the template's focus node (first heading,
  // or the copyright line). focusLayerId asks the layers panel to move
  // keyboard focus there after the palette / command menu finishes closing.
  const ed = useEditorStore.getState();
  ed.setSelectedNodeId(built.focusId);
  ed.setFocusLayerId(built.focusId);
  return true;
}

/** Same insert and focus as a template. Locked page is refused by canInsertTemplate. */
export function insertBlock(id: BlockId): boolean {
  const d = doc();
  if (!d) return false;
  const built = buildBlock(id);
  const next = applyTemplate(d, useEditorStore.getState().selectedNodeId, built);
  if (!next) return false;
  useProjectsStore.getState().updateOpenDocument(next);
  const ed = useEditorStore.getState();
  ed.setSelectedNodeId(built.focusId);
  ed.setFocusLayerId(built.focusId);
  return true;
}

/** Phase 11 D9: insert a registry StyleBlock (one undo step). */
export function insertRegistryStyleBlock(block: StyleBlock): boolean {
  const d = doc();
  if (!d || !canInsertTemplate(d)) return false;
  const sel = useEditorStore.getState().selectedNodeId;
  const result = insertStyleBlockTree(d, sel, block);
  if (!result) return false;
  useProjectsStore.getState().updateOpenDocument(result.doc, {
    historyKey: `block:${block.id}`,
  });
  const ed = useEditorStore.getState();
  ed.setSelectedNodeId(result.rootId);
  ed.setFocusLayerId(result.rootId);
  ed.announce(`แทรกบล็อก ${block.name} แล้ว`);
  return true;
}

/** Same insert and focus as a template. Locked page is refused by canInsertTemplate. */
export function insertPage(id: PageId): boolean {
  const d = doc();
  if (!d) return false;
  const built = buildPage(id);
  const next = applyTemplate(d, useEditorStore.getState().selectedNodeId, built);
  if (!next) return false;
  useProjectsStore.getState().updateOpenDocument(next);
  const ed = useEditorStore.getState();
  ed.setSelectedNodeId(built.focusId);
  ed.setFocusLayerId(built.focusId);
  return true;
}
