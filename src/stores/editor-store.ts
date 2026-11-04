import { create } from "zustand";
import type { PageDocument } from "@/schema";

/** Undo/redo depth cap (snapshots share structure, so each is cheap). */
export const HISTORY_LIMIT = 100;
/** Writes with the same key closer than this merge into one step. */
const COALESCE_MS = 800;

/** Undo snapshot: the node tree plus the selection of that moment. */
export type HistEntry = { doc: PageDocument; sel: string | null };

export type HistoryGroup = {
  token: number;
  /** An entry was pushed for this group (later writes coalesce into it). */
  pushed: boolean;
  /** Redo stack at group start, restored if the group is reverted (Esc). */
  future: HistEntry[];
};

/** `database` = Phase 10 designer (lazy chunk, PHASE-10-SPEC §5). */
export type EditorMode = "design" | "preview" | "database";
/**
 * Phase 10 bridge: the lazy DB chunk publishes its model history here so the
 * command palette can route เลิกทำ/ทำซ้ำ in `ฐานข้อมูล` without importing DB
 * code. Null until the database mode has loaded.
 */
export type ModelHistoryBridge = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

export type PreviewStatus = "idle" | "loading" | "ready" | "error";

/** Editor chrome state — document persistence lives in projects-store (SQLite). */
type EditorState = {
  documentTitle: string;
  isSidebarOpen: boolean;
  selectedNodeId: string | null;
  /**
   * Layer row to focus after a template insert. Stays set until that row
   * actually holds focus, so a menu's close-restore cannot leave it null
   * before the row exists. Not selection — selection stays `selectedNodeId`.
   */
  focusLayerId: string | null;
  setFocusLayerId: (id: string | null) => void;
  /** Open project page id (home first). Null until a project is opened. */
  openPageId: string | null;
  setOpenPageId: (id: string | null) => void;
  /** PagesPanel opens rename when set (palette เพิ่มหน้า / +). */
  pendingPageRenameId: string | null;
  requestPageRename: (id: string) => void;
  clearPendingPageRename: () => void;
  mode: EditorMode;
  previewStatus: PreviewStatus;
  previewError: string | null;
  /** Style panel sections collapsed this session (kept across projects). */
  collapsedStyleSections: Record<string, boolean>;
  toggleStyleSection: (id: string) => void;
  /** Add-element palette groups collapsed this session (kept across projects). */
  collapsedPaletteGroups: Record<string, boolean>;
  togglePaletteGroup: (id: string) => void;
  /** Node whose text is being edited inline on the canvas. */
  editingNodeId: string | null;
  setEditingNodeId: (id: string | null) => void;
  /** Document history (in-memory only; SQLite remains source of truth). */
  past: HistEntry[];
  future: HistEntry[];
  histKey: string | null;
  histAt: number;
  histGroup: HistoryGroup | null;
  /** Record `prev` as an undo step (coalesced by group or key+time). */
  pushHistory: (prev: PageDocument, key?: string) => void;
  clearHistory: () => void;
  setDocumentTitle: (title: string) => void;
  toggleSidebar: () => void;
  setSelectedNodeId: (id: string | null) => void;
  setMode: (mode: EditorMode) => void;
  setPreviewStatus: (status: PreviewStatus) => void;
  setPreviewError: (error: string | null) => void;
  /** Entering editor → Design; leaving → Design + clear preview. */
  resetEditorChrome: () => void;
  /** Text of EditorPage's one sr-only status region (save, Preview page switch). */
  announcement: string;
  /** Polite cue: clear, then set on the next frame so a repeat is read again. */
  announce: (msg: string) => void;
  modelHistory: ModelHistoryBridge | null;
  setModelHistory: (h: ModelHistoryBridge | null) => void;
  /** Phase 10: `.sql` export published by the lazy DB chunk while `ฐานข้อมูล` is shown. */
  dbExport: (() => void) | null;
  setDbExport: (f: (() => void) | null) => void;
};

const EMPTY_HISTORY = {
  past: [] as HistEntry[],
  future: [] as HistEntry[],
  histKey: null,
  histAt: 0,
  histGroup: null,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  documentTitle: "หน้าใหม่",
  isSidebarOpen: true,
  selectedNodeId: null,
  focusLayerId: null,
  setFocusLayerId: (focusLayerId) => set({ focusLayerId }),
  openPageId: null,
  setOpenPageId: (openPageId) => set({ openPageId }),
  pendingPageRenameId: null,
  requestPageRename: (id) => set({ pendingPageRenameId: id }),
  clearPendingPageRename: () => set({ pendingPageRenameId: null }),
  mode: "design",
  previewStatus: "idle",
  previewError: null,
  collapsedStyleSections: {},
  toggleStyleSection: (id) =>
    set((s) => ({
      collapsedStyleSections: {
        ...s.collapsedStyleSections,
        [id]: !s.collapsedStyleSections[id],
      },
    })),
  collapsedPaletteGroups: {},
  togglePaletteGroup: (id) =>
    set((s) => ({
      collapsedPaletteGroups: {
        ...s.collapsedPaletteGroups,
        [id]: !s.collapsedPaletteGroups[id],
      },
    })),
  editingNodeId: null,
  setEditingNodeId: (editingNodeId) => set({ editingNodeId }),
  ...EMPTY_HISTORY,
  pushHistory: (prev, key) => {
    const s = get();
    const now = Date.now();
    const g = s.histGroup;
    const coalesce = g
      ? g.pushed
      : key !== undefined && s.histKey === key && now - s.histAt < COALESCE_MS;
    set({
      past: coalesce
        ? s.past
        : [...s.past, { doc: prev, sel: s.selectedNodeId }].slice(-HISTORY_LIMIT),
      future: [],
      histKey: key ?? null,
      histAt: now,
      histGroup: g && !g.pushed ? { ...g, pushed: true } : g,
    });
  },
  clearHistory: () => set({ ...EMPTY_HISTORY }),
  setDocumentTitle: (title) => set({ documentTitle: title }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setMode: (mode) => {
    if (mode === "preview") {
      // Start preview pipeline; selection stays in store for return to Design.
      set({
        mode,
        editingNodeId: null,
        previewStatus: "loading",
        previewError: null,
      });
      return;
    }
    // Design / database: tear down any preview surface status.
    set({
      mode,
      editingNodeId: mode === "database" ? null : get().editingNodeId,
      previewStatus: "idle",
      previewError: null,
    });
  },
  announcement: "",
  modelHistory: null,
  setModelHistory: (modelHistory) => set({ modelHistory }),
  dbExport: null,
  setDbExport: (dbExport) => set({ dbExport }),
  announce: (msg) => {
    set({ announcement: "" });
    requestAnimationFrame(() => set({ announcement: msg }));
  },
  setPreviewStatus: (previewStatus) => set({ previewStatus }),
  setPreviewError: (previewError) => set({ previewError }),
  resetEditorChrome: () =>
    set({
      mode: "design",
      previewStatus: "idle",
      previewError: null,
      documentTitle: "หน้าใหม่",
      isSidebarOpen: true,
      selectedNodeId: null,
      focusLayerId: null,
      openPageId: null,
      pendingPageRenameId: null,
      editingNodeId: null,
      // Project switch / leave clears undo history.
      ...EMPTY_HISTORY,
    }),
}));
