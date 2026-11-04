import type { PageDocument } from "@/schema";
import {
  setChartEditorCommit,
  setInputSuggestions,
  setListItems,
  setTableEditorCommit,
  setTableModel,
  setNodeBreakpointStyle,
  setNodeProp,
  setNodeStyle,
  type NodePropKey,
  type StyleKey,
} from "@/lib/document-ops";
import type { ChartKind, ChartSeries, StyleBreakpoint, StyleProps } from "@/schema";
import { useProjectsStore } from "@/stores/projects-store";

type Op = (doc: PageDocument) => PageDocument | null;

/**
 * Apply one or more document-ops writes against the *current* store document
 * and push a single update (dirty + existing Save). No-ops don't mark dirty.
 */
export function applyOps(ops: Op[], historyKey?: string): void {
  const s = useProjectsStore.getState();
  let doc = s.openDocument;
  if (!doc) return;
  let changed = false;
  for (const op of ops) {
    const next = op(doc);
    if (next) {
      doc = next;
      changed = true;
    }
  }
  if (changed) s.updateOpenDocument(doc, { historyKey });
}

export const styleOp =
  <K extends StyleKey>(
    nodeId: string,
    key: K,
    value: StyleProps[K] | undefined,
    bp?: StyleBreakpoint,
  ): Op =>
  (doc) =>
    bp
      ? setNodeBreakpointStyle(doc, nodeId, bp, key, value)
      : setNodeStyle(doc, nodeId, key, value);

export const propOp =
  (nodeId: string, key: NodePropKey, value: string | number | boolean | undefined): Op =>
  (doc) =>
    setNodeProp(doc, nodeId, key, value);

export function writeStyle<K extends StyleKey>(
  nodeId: string,
  key: K,
  value: StyleProps[K] | undefined,
  bp?: StyleBreakpoint,
): void {
  // Same field + node + breakpoint within the coalesce window → one undo step.
  // Desktop and a phone edit of the same key stay separate steps.
  applyOps(
    [styleOp(nodeId, key, value, bp)],
    bp ? `style:${nodeId}:${bp}:${key}` : `style:${nodeId}:${key}`,
  );
}

export function writeProp(
  nodeId: string,
  key: NodePropKey,
  value: string | number | boolean | undefined,
): void {
  applyOps([propOp(nodeId, key, value)], `prop:${nodeId}:${key}`);
}

/** Phase 11 A3.5: T23 suggestions list (one undo step). */
export function writeInputSuggestions(nodeId: string, suggestions: string[]): void {
  applyOps([(doc) => setInputSuggestions(doc, nodeId, suggestions)], `prop:${nodeId}:suggestions`);
}

/** Phase 11 A4.1: T24 list items (one undo step). */
export function writeListItems(nodeId: string, items: string[]): void {
  applyOps([(doc) => setListItems(doc, nodeId, items)], `prop:${nodeId}:items`);
}

/** Phase 11 A4.2: table columns + rows (one undo step). */
export function writeTableModel(
  nodeId: string,
  model: { columns: string[]; rows: string[][] },
): void {
  applyOps([(doc) => setTableModel(doc, nodeId, model)], `prop:${nodeId}:tableModel`);
}

/** Phase 11 A4.3: full table editor commit (one undo step). */
export function writeTableEditorCommit(
  nodeId: string,
  model: {
    columns: string[];
    rows: string[][];
    caption: string;
    headerRow: boolean;
    striped: boolean;
  },
): void {
  applyOps([(doc) => setTableEditorCommit(doc, nodeId, model)], `prop:${nodeId}:tableEditor`);
}

/** Phase 11 A5.4: full chart editor commit (one undo step). */
export function writeChartEditorCommit(
  nodeId: string,
  model: {
    kind: ChartKind;
    categories: string[];
    series: ChartSeries[];
    caption: string;
  },
): void {
  applyOps([(doc) => setChartEditorCommit(doc, nodeId, model)], `prop:${nodeId}:chartEditor`);
}
