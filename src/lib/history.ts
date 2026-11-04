import type { PageDocument } from "@/schema";
import { useEditorStore, type HistEntry } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";

/**
 * Undo/redo over the node tree (root + nodes). Title/meta is NOT part of
 * history — restores keep the current meta so undo never rewrites the title
 * the top bar shows. Snapshots live in editor-store (capped, in-memory) and
 * carry the selection of their moment: undoing a delete reselects the
 * restored node, redoing an add selects the added node.
 */

/** Apply a snapshot's tree onto the current document (keep current meta). */
function treeOf(snapshot: PageDocument, current: PageDocument): PageDocument {
  if (
    snapshot.root === current.root &&
    snapshot.nodes === current.nodes &&
    snapshot.pages === current.pages
  ) {
    return current;
  }
  return {
    ...current,
    root: snapshot.root,
    nodes: snapshot.nodes,
    pages: snapshot.pages,
  };
}

function applySelection(doc: PageDocument, sel: string | null) {
  const e = useEditorStore.getState();
  e.setEditingNodeId(null);
  if (sel && doc.nodes[sel]) e.setSelectedNodeId(sel);
  else if (e.selectedNodeId && !doc.nodes[e.selectedNodeId]) e.setSelectedNodeId(null);
}

function step(from: "past" | "future"): boolean {
  const e = useEditorStore.getState();
  const p = useProjectsStore.getState();
  const cur = p.openDocument;
  const stack = e[from];
  if (!cur || stack.length === 0 || e.histGroup) return false;
  const target = stack[stack.length - 1];
  const here: HistEntry = { doc: cur, sel: e.selectedNodeId };
  useEditorStore.setState(
    from === "past"
      ? { past: e.past.slice(0, -1), future: [...e.future, here], histKey: null }
      : { past: [...e.past, here], future: e.future.slice(0, -1), histKey: null },
  );
  const next = treeOf(target.doc, cur);
  p.restoreDocument(next);
  applySelection(next, target.sel);
  return true;
}

/** Returns false when there is nothing to undo (caller must not eat the key). */
export function undo(): boolean {
  return step("past");
}

/** Returns false when there is nothing to redo (caller must not eat the key). */
export function redo(): boolean {
  return step("future");
}

let tokenSeq = 0;

/**
 * Open a group: every document write until `endHistoryGroup` becomes ONE
 * undo step (one typing burst / one slider drag). Returns a token so a stale
 * owner (e.g. an unmounted input) cannot close someone else's group.
 */
export function beginHistoryGroup(): number {
  const token = ++tokenSeq;
  useEditorStore.setState((s) => ({
    histGroup: { token, pushed: false, future: s.future },
    histKey: null,
  }));
  return token;
}

export function endHistoryGroup(token: number): void {
  const e = useEditorStore.getState();
  const g = e.histGroup;
  if (g?.token !== token) return;
  // A session that ends where it started (typed back, native text undo, a
  // drag returned to its start) leaves no step: drop it like Esc does.
  const prev = e.past[e.past.length - 1];
  const cur = useProjectsStore.getState().openDocument;
  if (g.pushed && prev && cur && sameTree(prev.doc, cur)) revertHistoryGroup(token);
  useEditorStore.setState({ histGroup: null, histKey: null });
}

/** Tree content equality (root, nodes, pages); meta is not part of history. */
export function sameTree(a: PageDocument, b: PageDocument): boolean {
  if (a.root === b.root && a.nodes === b.nodes && a.pages === b.pages) return true;
  return JSON.stringify([a.root, a.nodes, a.pages]) === JSON.stringify([b.root, b.nodes, b.pages]);
}

/**
 * Drop the group's step and restore the exact pre-group document — no
 * history entry remains, redo is restored, and (because the pre-group
 * document object itself comes back) `dirty` returns to its earlier value.
 * Used by Esc in a field and by a slider drag that ends where it started.
 */
export function revertHistoryGroup(token: number): void {
  const e = useEditorStore.getState();
  const g = e.histGroup;
  if (g?.token !== token) return;
  if (g.pushed && e.past.length > 0) {
    const prev = e.past[e.past.length - 1];
    const cur = useProjectsStore.getState().openDocument;
    useEditorStore.setState({
      past: e.past.slice(0, -1),
      future: g.future,
      histGroup: { token, pushed: false, future: g.future },
      histKey: null,
    });
    if (cur) useProjectsStore.getState().restoreDocument(treeOf(prev.doc, cur));
  }
}
