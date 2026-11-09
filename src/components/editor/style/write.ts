import type { PageDocument } from "@/schema";
import {
  setChartEditorCommit,
  setInputSuggestions,
  setListItems,
  setStaticItems,
  setTableEditorCommit,
  setTableModel,
  applyPreset,
  setNodeBreakpointStyle,
  setNodeProp,
  setNodeStateStyle,
  setNodeStates,
  setNodeStyle,
  type NodePropKey,
  type StyleKey,
} from "@/lib/document-ops";
import type { StylePreset } from "@/lib/presets-registry";
import type {
  ChartKind,
  ChartSeries,
  NodeStateName,
  NodeStates,
  StatePaintKey,
  StyleBreakpoint,
  StyleProps,
} from "@/schema";
import { STATE_PAINT_KEYS } from "@/schema";
import { glassStyle, type GlassLevel } from "@/lib/glass-material";
import { evaluatePagePerfIfHeavy } from "@/lib/page-perf-watch";
import { useProjectsStore } from "@/stores/projects-store";

type Op = (doc: PageDocument) => PageDocument | null;

/**
 * Apply one or more document-ops writes against the *current* store document
 * and push a single update (dirty + existing Save). No-ops don't mark dirty.
 */
export function applyOps(
  ops: Op[],
  historyKey?: string,
  opts?: { heavyStyleKeys?: readonly StyleKey[] },
): void {
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
  if (changed) {
    s.updateOpenDocument(doc, { historyKey });
    // B6.2: O(n) perf pass only when a heavy style key was written (§5.3).
    if (opts?.heavyStyleKeys?.length) {
      evaluatePagePerfIfHeavy(doc, opts.heavyStyleKeys);
    }
  }
}

export const styleOp =
  <K extends StyleKey>(
    nodeId: string,
    key: K,
    value: StyleProps[K] | undefined,
    bp?: StyleBreakpoint,
    /** B8.1: when set, write into `states[name]` (paint keys only; bp ignored). */
    state?: NodeStateName | null,
  ): Op =>
  (doc) => {
    if (state) {
      if (!(STATE_PAINT_KEYS as readonly string[]).includes(key)) return null;
      return setNodeStateStyle(
        doc,
        nodeId,
        state,
        key as StatePaintKey,
        value as StyleProps[StatePaintKey] | undefined,
      );
    }
    return bp
      ? setNodeBreakpointStyle(doc, nodeId, bp, key, value)
      : setNodeStyle(doc, nodeId, key, value);
  };

export const propOp =
  (nodeId: string, key: NodePropKey, value: string | number | boolean | undefined): Op =>
  (doc) =>
    setNodeProp(doc, nodeId, key, value);

export function writeStyle<K extends StyleKey>(
  nodeId: string,
  key: K,
  value: StyleProps[K] | undefined,
  bp?: StyleBreakpoint,
  state?: NodeStateName | null,
): void {
  // Same field + node + breakpoint/state within the coalesce window → one undo step.
  // Desktop and a phone edit of the same key stay separate steps.
  const hist = state
    ? `state:${nodeId}:${state}:${key}`
    : bp
      ? `style:${nodeId}:${bp}:${key}`
      : `style:${nodeId}:${key}`;
  applyOps([styleOp(nodeId, key, value, bp, state)], hist, {
    heavyStyleKeys: [key],
  });
}

/** Set glass thickness as one undo step, or clear only the frost. */
export function writeGlassThickness(nodeId: string, level: GlassLevel | ""): void {
  if (!level) {
    writeStyle(nodeId, "backdropFilter", undefined);
    return;
  }
  const patch = glassStyle(level);
  const keys = Object.keys(patch) as (keyof StyleProps)[];
  applyOps(
    keys.map((key) => (doc) => setNodeStyle(doc, nodeId, key, patch[key])),
    `glass:${nodeId}`,
    { heavyStyleKeys: ["backdropFilter"] },
  );
}

/** B8.2 T118: drop one named state object (empty `states` removed). One undo step. */
export function writeClearNodeState(nodeId: string, name: NodeStateName): void {
  applyOps(
    [
      (doc) => {
        const node = doc.nodes[nodeId];
        if (!node?.states?.[name]) return null;
        const next: NodeStates = { ...node.states };
        delete next[name];
        return setNodeStates(doc, nodeId, Object.keys(next).length > 0 ? next : undefined);
      },
    ],
    `state:${nodeId}:${name}:clear`,
  );
}

/**
 * Phase 11 C2: apply a style preset in one undo step.
 * @returns false when refused (locked / wrong kind) or no-op (already equal).
 */
export function writeApplyPreset(nodeId: string, preset: StylePreset): boolean {
  const doc = useProjectsStore.getState().openDocument;
  if (!doc) return false;
  if (!applyPreset(doc, nodeId, preset)) return false;
  applyOps([(d) => applyPreset(d, nodeId, preset)], `preset:${nodeId}:${preset.id}`, {
    heavyStyleKeys: ["boxShadow", "filter", "backdropFilter", "transition"],
  });
  return true;
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

/** Design-only command / context menu items (one undo step). */
export function writeStaticItems(nodeId: string, items: string[]): void {
  applyOps([(doc) => setStaticItems(doc, nodeId, items)], `prop:${nodeId}:staticItems`);
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
