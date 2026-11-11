import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";
import {
  addColumn as addColumnOp,
  addTable,
  EMPTY_DB_MODEL,
  moveColumn as moveColumnOp,
  moveTable as moveTableOp,
  removeColumn as removeColumnOp,
  removeTable as removeTableOp,
  columnDeleteImpact,
  tableDeleteImpact,
  updateColumn,
  updateTable,
  type DbModel,
} from "./db-model";
import { normalizeIdentifier } from "./db-validate";
import {
  announceAddedColumn,
  announceAddedTable,
  announceMoved,
  announceRemovedColumn,
  announceRemovedTable,
  announceRenamed,
} from "./announce-i18n";

/**
 * Phase 10 model store. Lives in the lazy database chunk only (§5); nothing
 * here runs at startup. The model is read from Rust when the mode first opens
 * for a project and kept across mode switches.
 *
 * §8: the model has its OWN undo history (cap 100), separate from the page
 * history. One `commit` = one step. Every change marks the model pending in
 * projects-store (dirty + sent on the next save); returning to the saved model
 * (by undo) clears it again.
 */
type Status = "idle" | "loading" | "ready" | "error";

export const DB_HISTORY_LIMIT = 100;

type DbModelState = {
  projectId: string | null;
  status: Status;
  error: string | null;
  model: DbModel;
  /** Last loaded/saved model (reference) — basis for pending. */
  savedModel: DbModel;
  past: DbModel[];
  future: DbModel[];
  /** UI: the table open in the main pane (not part of the model or history). */
  selectedTableId: string | null;
  ensureLoaded: (projectId: string) => Promise<void>;
  reload: () => Promise<void>;
  /** Replace the model as ONE undo step and mark it pending. */
  commit: (model: DbModel) => void;
  undo: () => boolean;
  redo: () => boolean;
  addTable: () => string | null;
  selectTable: (id: string | null) => void;
  /*
   * Named edits: one commit each, plus a polite announcement through the
   * editor status region (announce once, on commit — never per keystroke).
   */
  renameTable: (tableId: string, raw: string) => void;
  moveTable: (tableId: string, delta: number) => void;
  removeTable: (tableId: string) => void;
  addColumn: (tableId: string) => string | null;
  renameColumn: (tableId: string, columnId: string, raw: string) => void;
  moveColumn: (tableId: string, columnId: string, delta: number) => void;
  removeColumn: (tableId: string, columnId: string) => void;
  reset: () => void;
};

/** Structural equality (models are plain JSON; key order is stable from the ops). */
export function sameModel(a: DbModel, b: DbModel): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

const INITIAL = {
  projectId: null,
  status: "idle" as Status,
  error: null,
  model: EMPTY_DB_MODEL,
  savedModel: EMPTY_DB_MODEL,
  past: [] as DbModel[],
  future: [] as DbModel[],
  selectedTableId: null,
};

const say = (msg: string) => useEditorStore.getState().announce(msg);

function markPending(model: DbModel, saved: DbModel) {
  useProjectsStore.getState().setPendingDbModel(model === saved ? null : model);
}

export const useDbModelStore = create<DbModelState>((set, get) => ({
  ...INITIAL,

  ensureLoaded: async (projectId) => {
    const s = get();
    if (s.projectId === projectId && (s.status === "ready" || s.status === "loading")) return;
    set({ ...INITIAL, projectId, status: "loading" });
    try {
      const saved = await invoke<DbModel | null>("db_model_load", { projectId });
      if (get().projectId !== projectId) return; // project switched meanwhile
      const model = saved ?? EMPTY_DB_MODEL;
      set({ status: "ready", model, savedModel: model, selectedTableId: model.tables[0]?.id ?? null });
    } catch (e) {
      if (get().projectId !== projectId) return;
      set({ status: "error", error: errMessage(e) });
    }
  },

  reload: async () => {
    const id = get().projectId;
    if (!id) return;
    set({ status: "idle" });
    await get().ensureLoaded(id);
  },

  commit: (model) => {
    const s = get();
    // A no-op commit (same object or same content) never records history.
    if (s.status !== "ready" || model === s.model || sameModel(model, s.model)) return;
    const past = [...s.past, s.model];
    if (past.length > DB_HISTORY_LIMIT) past.shift();
    set({ model, past, future: [] });
    markPending(model, s.savedModel);
  },

  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (s.status !== "ready" || !prev) return false;
    set({ model: prev, past: s.past.slice(0, -1), future: [s.model, ...s.future] });
    markPending(prev, s.savedModel);
    return true;
  },

  redo: () => {
    const s = get();
    const next = s.future[0];
    if (s.status !== "ready" || !next) return false;
    set({ model: next, past: [...s.past, s.model], future: s.future.slice(1) });
    markPending(next, s.savedModel);
    return true;
  },

  addTable: () => {
    if (get().status !== "ready") return null;
    const { model, table } = addTable(get().model);
    get().commit(model);
    set({ selectedTableId: table.id });
    useEditorStore.getState().announce(announceAddedTable(table.name));
    return table.id;
  },

  selectTable: (selectedTableId) => set({ selectedTableId }),

  renameTable: (tableId, raw) => {
    const name = normalizeIdentifier(raw);
    const t = get().model.tables.find((x) => x.id === tableId);
    if (!t || t.name === name) return;
    get().commit(updateTable(get().model, tableId, { name }));
    say(announceRenamed(name));
  },

  moveTable: (tableId, delta) => {
    const next = moveTableOp(get().model, tableId, delta);
    if (next === get().model) return;
    get().commit(next);
    const i = next.tables.findIndex((t) => t.id === tableId);
    say(announceMoved(next.tables[i]!.name, i + 1, next.tables.length));
  },

  removeTable: (tableId) => {
    const t = get().model.tables.find((x) => x.id === tableId);
    if (!t) return;
    const fks = tableDeleteImpact(get().model, tableId);
    get().commit(removeTableOp(get().model, tableId));
    say(announceRemovedTable(t.name, fks));
  },

  addColumn: (tableId) => {
    if (get().status !== "ready") return null;
    const { model, columnId } = addColumnOp(get().model, tableId);
    get().commit(model);
    const c = model.tables.find((t) => t.id === tableId)?.columns.find((x) => x.id === columnId);
    if (c) say(announceAddedColumn(c.name));
    return columnId;
  },

  renameColumn: (tableId, columnId, raw) => {
    const name = normalizeIdentifier(raw);
    const c = get().model.tables.find((t) => t.id === tableId)?.columns.find((x) => x.id === columnId);
    if (!c || c.name === name) return;
    get().commit(updateColumn(get().model, tableId, columnId, { name }));
    say(announceRenamed(name));
  },

  moveColumn: (tableId, columnId, delta) => {
    const next = moveColumnOp(get().model, tableId, columnId, delta);
    if (next === get().model) return;
    get().commit(next);
    const cols = next.tables.find((t) => t.id === tableId)!.columns;
    const i = cols.findIndex((c) => c.id === columnId);
    say(announceMoved(cols[i]!.name, i + 1, cols.length));
  },

  removeColumn: (tableId, columnId) => {
    const c = get().model.tables.find((t) => t.id === tableId)?.columns.find((x) => x.id === columnId);
    if (!c) return;
    const { uniques, foreignKeys } = columnDeleteImpact(get().model, tableId, columnId);
    get().commit(removeColumnOp(get().model, tableId, columnId));
    say(announceRemovedColumn(c.name, uniques, foreignKeys));
  },

  reset: () => set({ ...INITIAL }),
}));

// Project closed or switched (openId changes): drop the cached model and its
// history (§8: the stack is cleared on project close). A successful save
// clears pendingDbModel while the model is unchanged: that model is now saved.
useProjectsStore.subscribe((s, prev) => {
  if (s.openId !== prev.openId) {
    useDbModelStore.getState().reset();
    return;
  }
  if (prev.pendingDbModel !== null && s.pendingDbModel === null) {
    const db = useDbModelStore.getState();
    if (db.status === "ready" && db.projectId === s.openId) useDbModelStore.setState({ savedModel: db.model });
  }
});

// Publish undo/redo availability for the command palette (§8 routing). Only
// the booleans change the bridge object, so the palette re-renders rarely.
function publishHistory() {
  const s = useDbModelStore.getState();
  const canUndo = s.status === "ready" && s.past.length > 0;
  const canRedo = s.status === "ready" && s.future.length > 0;
  const cur = useEditorStore.getState().modelHistory;
  if (cur && cur.canUndo === canUndo && cur.canRedo === canRedo) return;
  useEditorStore.getState().setModelHistory({
    canUndo,
    canRedo,
    undo: () => void useDbModelStore.getState().undo(),
    redo: () => void useDbModelStore.getState().redo(),
  });
}
useDbModelStore.subscribe(publishHistory);
publishHistory();
