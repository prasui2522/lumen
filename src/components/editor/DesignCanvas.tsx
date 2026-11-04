import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { shouldPreventSpaceScroll } from "@/lib/canvas-space";
import { Button } from "@/components/ui/button";
import {
  NodeView,
  getDraggedNodeId,
  isDocumentEmpty,
  type NodeViewContext,
} from "@/components/editor/node-view";
import {
  canDropNode,
  canInsertInto,
  createNode,
  findParent,
  insertNode,
  isPaletteType,
  moveNodeInDocument,
  seedDemoUnderPage,
  setNodeProp,
  siblingOf,
  textPropKey,
  type ParentRef,
} from "@/lib/document-ops";
import { redo, undo } from "@/lib/history";
import { canEditText, deleteNodeAction } from "@/lib/node-actions";
import { toast } from "@/lib/toast";
import { isEditableInOverlay, isOverlayOpen, nativeUndoAllowed } from "@/lib/modal";
import {
  PALETTE_DRAG_MIME,
  getDragPayload,
  setDragPayload,
  type DragPayload,
} from "@/lib/drag-session";
import { getChildren, isContainerType, type PageDocument } from "@/schema";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";

/**
 * Strict ALLOWLIST for canvas shortcuts (no undo yet): only when focus is the
 * canvas surface itself or a row / the container of the Layers tree. Anything
 * else — top bar, palette, Style panel, inputs, contenteditable — is ignored.
 */
function isCanvasShortcutFocus(): HTMLElement | null {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || a.isContentEditable) return null;
  if (a.dataset.kbdScope === "canvas") return a;
  const layers = a.closest<HTMLElement>('[data-kbd-scope="layers"]');
  if (layers && (a === layers || a.dataset.layerRow !== undefined)) return layers;
  return null;
}

/** Insertion slot for pointer Y over `overId` (container → among children; leaf → before/after). */
function resolveDrop(
  doc: PageDocument,
  overId: string,
  clientY: number,
  targetEl: HTMLElement | null,
): ParentRef | null {
  const over = doc.nodes[overId];
  if (!over) return null;

  if (isContainerType(over.type)) {
    const kids = getChildren(over);
    let index = kids.length;
    for (let i = 0; i < kids.length; i++) {
      const childEl =
        (targetEl?.querySelector(
          `:scope > [data-node-id="${kids[i]}"]`,
        ) as HTMLElement | null) ??
        (targetEl?.querySelector(
          `[data-node-id="${kids[i]}"]`,
        ) as HTMLElement | null);
      if (!childEl) continue;
      const rect = childEl.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    return { parentId: overId, index };
  }

  const parent = findParent(doc, overId);
  if (!parent) return null;
  let index = parent.index + 1;
  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) index = parent.index;
  }
  return { parentId: parent.parentId, index };
}

/**
 * Where the browser's own text undo applies (text-like inputs, textarea,
 * contenteditable incl. the inline editor) — document undo stays out.
 */
const NATIVE_TEXT_INPUTS = new Set([
  "text", "number", "search", "url", "email", "password", "tel", "",
]);
function isNativeTextTarget(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el instanceof HTMLInputElement) {
    return NATIVE_TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled;
  }
  return false;
}

function readPayload(e: DragEvent): DragPayload | null {
  const p = getDragPayload();
  if (p) return p;
  const t = e.dataTransfer.getData(PALETTE_DRAG_MIME);
  if (t && isPaletteType(t)) return { kind: "new", nodeType: t };
  const id = getDraggedNodeId(e);
  return id ? { kind: "move", nodeId: id } : null;
}

function isValidSlot(
  doc: PageDocument,
  payload: DragPayload,
  slot: ParentRef,
): boolean {
  return payload.kind === "move"
    ? canDropNode(doc, payload.nodeId, slot.parentId, slot.index)
    : canInsertInto(doc, slot.parentId, slot.index);
}

/**
 * Phase 2 Design canvas — live PageDocument tree with select, DnD
 * (move + palette insert) and keyboard basics. Design-only chrome.
 */
export function DesignCanvas() {
  const openDocument = useProjectsStore((s) => s.openDocument);
  const updateOpenDocument = useProjectsStore((s) => s.updateOpenDocument);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const editingNodeId = useEditorStore((s) => s.editingNodeId);
  const setEditingNodeId = useEditorStore((s) => s.setEditingNodeId);
  const scopeRef = useRef<HTMLDivElement | null>(null);
  // Mounting with focus on <body> (e.g. the new-project dialog went with the
  // project list): take it in the same commit, before anything can see <body>.
  useLayoutEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) scopeRef.current?.focus({ preventScroll: true });
  }, []);

  const [dropIndicator, setDropIndicator] = useState<ParentRef | null>(null);
  const indicatorRef = useRef<ParentRef | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const setIndicator = useCallback((next: ParentRef | null) => {
    const cur = indicatorRef.current;
    if (
      cur === next ||
      (cur && next && cur.parentId === next.parentId && cur.index === next.index)
    ) {
      return; // dragover fires continuously — avoid re-render churn
    }
    indicatorRef.current = next;
    setDropIndicator(next);
  }, []);

  const handleOver = useCallback(
    (nodeId: string, e: DragEvent, el: HTMLElement | null) => {
      const doc = useProjectsStore.getState().openDocument;
      const payload = getDragPayload();
      if (!doc || !payload) return;
      const slot = resolveDrop(doc, nodeId, e.clientY, el);
      if (slot && isValidSlot(doc, payload, slot)) {
        e.dataTransfer.dropEffect = payload.kind === "move" ? "move" : "copy";
        setIndicator(slot);
      } else {
        e.dataTransfer.dropEffect = "none";
        setIndicator(null);
      }
    },
    [setIndicator],
  );

  const handleDrop = useCallback(
    (nodeId: string, e: DragEvent, el: HTMLElement | null) => {
      const doc = useProjectsStore.getState().openDocument;
      const payload = readPayload(e);
      setIndicator(null);
      setDragPayload(null);
      if (!doc || !payload) return;
      const slot = resolveDrop(doc, nodeId, e.clientY, el);
      if (!slot || !isValidSlot(doc, payload, slot)) return;

      if (payload.kind === "move") {
        const next = moveNodeInDocument(
          doc,
          payload.nodeId,
          slot.parentId,
          slot.index,
        );
        if (!next) return;
        updateOpenDocument(next);
        setSelectedNodeId(payload.nodeId);
      } else {
        const node = createNode(payload.nodeType);
        const next = insertNode(doc, node, slot.parentId, slot.index);
        if (!next) return;
        updateOpenDocument(next);
        setSelectedNodeId(node.id);
      }
    },
    [setIndicator, setSelectedNodeId, updateOpenDocument],
  );

  // Clear indicator when any drag ends (incl. palette drags / drops outside).
  useEffect(() => {
    const clear = () => {
      setIndicator(null);
      setDragPayload(null);
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, [setIndicator]);

  // Undo / redo (Design only). Works from palette/Style buttons etc., but not
  // inside native text fields or the inline editor (browser text undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const isUndo = k === "z" && !e.shiftKey;
      const isRedo = (k === "z" && e.shiftKey) || (k === "y" && !e.shiftKey);
      if (!isUndo && !isRedo) return;
      if (isOverlayOpen()) {
        // Never edit the document behind a dialog — and block the browser's
        // native undo too, which could revert a field edit behind it. Text
        // fields inside the overlay keep their own native undo.
        // …but only while the field has its own history (WebKit's undo stack
        // is document-wide and would otherwise edit another field).
        if (!isEditableInOverlay(e.target) || !nativeUndoAllowed(e.target, isRedo)) e.preventDefault();
        return;
      }
      if (useEditorStore.getState().editingNodeId) return;
      if (isNativeTextTarget(document.activeElement)) return;
      // Always claim the key outside text fields: with nothing to undo the
      // browser's own (document-wide) undo would otherwise refill a cleared
      // field, e.g. the palette search.
      if (isUndo) undo();
      else redo();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commitEdit = useCallback(
    (nodeId: string, text: string, refocus: boolean) => {
      setEditingNodeId(null);
      const doc = useProjectsStore.getState().openDocument;
      const node = doc?.nodes[nodeId];
      const key = node ? textPropKey(node) : null;
      const trimmed = text.trim();
      // Empty text keeps the previous content (an empty node can't be clicked).
      if (doc && key && trimmed === "") {
        toast.info("ข้อความว่างไม่ได้ — คงข้อความเดิมไว้");
      } else if (doc && key) {
        const next = setNodeProp(doc, nodeId, key, trimmed);
        // One inline edit session = one write = one undo step.
        if (next) updateOpenDocument(next);
      }
      if (refocus) scopeRef.current?.focus({ preventScroll: true });
    },
    [setEditingNodeId, updateOpenDocument],
  );

  // Keyboard basics (Design only — component unmounts in Preview).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      // Inline text edit open → keys belong to the text, never node commands.
      if (useEditorStore.getState().editingNodeId) return;
      // Dialog / alert-dialog / menu / popover open → keys belong to it.
      if (isOverlayOpen()) return;
      // F2 Ruling 2: Space on the canvas / a selected node never scrolls the window (text fields keep it).
      if (shouldPreventSpaceScroll(e, document.activeElement as HTMLElement | null)) {
        e.preventDefault();
        return;
      }
      const scopeEl = isCanvasShortcutFocus();
      if (!scopeEl) return;
      const doc = useProjectsStore.getState().openDocument;
      if (!doc) return;
      const sel = useEditorStore.getState().selectedNodeId;
      const select = useEditorStore.getState().setSelectedNodeId;
      const selNode = sel ? doc.nodes[sel] : undefined;

      switch (e.key) {
        case "Enter": {
          if (!selNode || !canEditText(doc, selNode.id)) return;
          e.preventDefault(); // also stops a focused layer row "clicking"
          useEditorStore.getState().setEditingNodeId(selNode.id);
          return;
        }
        case "Escape": {
          if (!selNode) return;
          e.preventDefault();
          if (selNode.id === doc.root) {
            select(null);
          } else {
            select(findParent(doc, selNode.id)?.parentId ?? null);
          }
          return;
        }
        case "ArrowUp":
        case "ArrowDown": {
          e.preventDefault();
          if (!selNode) {
            const root = doc.nodes[doc.root];
            select(root ? (getChildren(root)[0] ?? doc.root) : null);
            return;
          }
          const sib = siblingOf(doc, selNode.id, e.key === "ArrowUp" ? -1 : 1);
          if (sib) select(sib);
          return;
        }
        case "Delete":
        case "Backspace": {
          if (!selNode || selNode.id === doc.root) return;
          e.preventDefault();
          // Shared with the layers context menu (same fallback + focus restore).
          deleteNodeAction(selNode.id, scopeEl);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep keyboard/layers selection visible on canvas (no smooth scroll).
  useEffect(() => {
    if (!selectedNodeId) return;
    const el = canvasRef.current?.querySelector(
      `[data-node-id="${selectedNodeId}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedNodeId]);

  const empty = openDocument ? isDocumentEmpty(openDocument) : true;

  const ctx: NodeViewContext | null = useMemo(() => {
    if (!openDocument) return null;
    return {
      document: openDocument,
      editable: true,
      selectedNodeId,
      dropIndicator,
      suppressRootEmptyHint: empty,
      editingNodeId,
      onStartEdit: setEditingNodeId,
      onCommitEdit: commitEdit,
      onSelect: setSelectedNodeId,
      onDragStart: (id) => setSelectedNodeId(id),
      onDragEnd: () => setIndicator(null),
      onDragOverNode: (id, e) =>
        handleOver(id, e, e.currentTarget as HTMLElement),
      onDropOnNode: (id, e) =>
        handleDrop(id, e, e.currentTarget as HTMLElement),
    };
  }, [
    openDocument,
    selectedNodeId,
    dropIndicator,
    empty,
    editingNodeId,
    setEditingNodeId,
    commitEdit,
    setSelectedNodeId,
    setIndicator,
    handleOver,
    handleDrop,
  ]);

  if (!openDocument || !ctx) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        กำลังเปิดโปรเจกต์…
      </div>
    );
  }

  const rootId = openDocument.root;
  const rootEl = () =>
    canvasRef.current?.querySelector(
      `[data-node-id="${rootId}"]`,
    ) as HTMLElement | null;

  return (
    <div
      ref={scopeRef}
      data-kbd-scope="canvas"
      tabIndex={0}
      aria-label="ผืนผ้าใบ"
      className="flex min-h-0 flex-1 items-start justify-center overflow-auto scrollbar-thin p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      style={{
        backgroundImage:
          "radial-gradient(circle, color-mix(in oklch, var(--foreground) 12%, transparent) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }}
      // Backdrop click clears selection (does not select the page root).
      onClick={() => setSelectedNodeId(null)}
      onDragLeave={(e) => {
        const to = e.relatedTarget as globalThis.Node | null;
        if (!to || !e.currentTarget.contains(to)) setIndicator(null);
      }}
    >
      <div
        ref={canvasRef}
        className="theme-light relative w-full max-w-3xl min-h-[480px] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm"
        onClick={(e) => {
          // Area of the card below the page content: clear, don't select root.
          e.stopPropagation();
          setSelectedNodeId(null);
        }}
        // Card area outside the page element behaves as "append to page".
        onDragOver={(e) => {
          if (!getDragPayload()) return;
          e.preventDefault();
          handleOver(rootId, e, rootEl());
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(rootId, e, rootEl());
        }}
      >
        <NodeView ctx={ctx} nodeId={rootId} />
        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium">หน้ายังว่าง</p>
            <p className="text-sm text-muted-foreground">
              ลากหรือคลิกองค์ประกอบจากแผงซ้าย หรือเพิ่มตัวอย่างเนื้อหา
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                const next = seedDemoUnderPage(openDocument);
                if (!next) return;
                updateOpenDocument(next);
                const root = next.nodes[next.root];
                setSelectedNodeId(
                  (root && getChildren(root)[0]) ?? next.root,
                );
              }}
            >
              เพิ่มตัวอย่างเนื้อหา
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
