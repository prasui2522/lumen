import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { documentForSave, wireDocumentForSave } from "../lib/breakpoints";
import { ensurePages, isProjectDirty, openPageIdOf, syncOpenIntoPages } from "../lib/project-pages";
import type { PageDocument } from "../schema";
import { useEditorStore } from "./editor-store";

/**
 * Dirty = whole project (meta + all pages) differs from last saved/opened.
 * Switching the open page must not dirty — open root/nodes are only a view.
 * Page/node identity uses structural sharing, so undo to saved clears dirty.
 */
function isDirty(doc: PageDocument, saved: PageDocument | null): boolean {
  return isProjectDirty(doc, saved);
}

/**
 * Project dirty = document dirty OR an unsaved Phase 10 DB model is pending
 * (PHASE-10-SPEC §8). Plain data only; no DB code lives in this store.
 */
export function projectDirty(documentDirty: boolean, pendingDbModel: unknown): boolean {
  return documentDirty || pendingDbModel !== null;
}

function acceptDocument(doc: PageDocument): PageDocument {
  const withPages = ensurePages(doc);
  // Open home (first page) after load/create.
  const home = withPages.pages![0]!;
  return { ...withPages, root: home.root, nodes: home.nodes };
}

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

export type ProjectWithDocument = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  document: PageDocument;
};

type ProjectsState = {
  projects: ProjectSummary[];
  loading: boolean;
  error: string | null;
  /**
   * Last `list_projects` outcome. `failed` survives `clearError` so dismissing
   * the alert is not an empty list. Only `ready` may show the empty state.
   */
  projectsStatus: "idle" | "ready" | "failed";
  /** Ephemeral open document cache (not a competing persistence layer). */
  openId: string | null;
  openName: string | null;
  openDocument: PageDocument | null;
  /** Last opened/saved document (reference) — basis for `dirty`. */
  savedDocument: PageDocument | null;
  dirty: boolean;
  /**
   * Phase 10: DB model edited since the last save, else `null`. Set by the lazy
   * DB store on every model change; sent with the next save, then cleared.
   */
  pendingDbModel: unknown | null;

  clearError: () => void;
  refreshProjects: () => Promise<void>;
  createProject: (name: string) => Promise<ProjectWithDocument | null>;
  openProject: (id: string) => Promise<ProjectWithDocument | null>;
  saveOpenProject: (opts?: { name?: string }) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
  setOpenTitle: (title: string) => void;
  /**
   * Committed title (Ctrl/Cmd+S in the title field). Unlike per-keystroke
   * `setOpenTitle`, typing back to the saved title is not dirty.
   */
  commitOpenTitle: (title: string) => void;
  /**
   * Replace in-memory open document (canvas / panel mutations). Records an
   * undo step; `historyKey` lets rapid writes to the same field coalesce.
   */
  updateOpenDocument: (
    document: PageDocument,
    opts?: { historyKey?: string },
  ) => void;
  /** Undo/redo restore — no history entry. */
  restoreDocument: (document: PageDocument) => void;
  closeOpen: () => void;
  /** Phase 10: mark the DB model pending (or `null` = nothing pending). */
  setPendingDbModel: (model: unknown | null) => void;
};

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  projectsStatus: "idle",
  openId: null,
  openName: null,
  openDocument: null,
  savedDocument: null,
  dirty: false,
  pendingDbModel: null,

  clearError: () => set({ error: null }),

  refreshProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await invoke<ProjectSummary[]>("list_projects");
      set({ projects, loading: false, projectsStatus: "ready" });
    } catch (e) {
      set({ loading: false, error: errMessage(e), projectsStatus: "failed" });
    }
  },

  createProject: async (name) => {
    set({ loading: true, error: null });
    try {
      const project = await invoke<ProjectWithDocument>("create_project", {
        name,
      });
      const document = acceptDocument(project.document);
      useEditorStore.getState().setOpenPageId(openPageIdOf(document));
      set({
        openId: project.id,
        openName: project.name,
        openDocument: document,
        savedDocument: document,
        dirty: false,
        pendingDbModel: null,
        loading: false,
      });
      await get().refreshProjects();
      return project;
    } catch (e) {
      set({ loading: false, error: errMessage(e) });
      return null;
    }
  },

  openProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const project = await invoke<ProjectWithDocument>("open_project", { id });
      const document = acceptDocument(project.document);
      useEditorStore.getState().setOpenPageId(openPageIdOf(document));
      set({
        openId: project.id,
        openName: project.name,
        openDocument: document,
        savedDocument: document,
        dirty: false,
        pendingDbModel: null,
        loading: false,
      });
      return project;
    } catch (e) {
      set({ loading: false, error: errMessage(e) });
      return null;
    }
  },

  saveOpenProject: async (opts) => {
    const { openId, openDocument } = get();
    if (!openId || !openDocument) {
      set({ error: "ไม่มีโปรเจกต์ที่เปิดอยู่" });
      return false;
    }
    set({ loading: true, error: null });
    // A save is a boundary: the next edit to the same field must not merge
    // into the pre-save undo step (key coalescing window).
    useEditorStore.setState({ histKey: null });
    try {
      const name = opts?.name;
      const named =
        name !== undefined
          ? {
              ...openDocument,
              meta: { ...openDocument.meta, title: name },
            }
          : openDocument;
      const openPageId = useEditorStore.getState().openPageId;
      const synced = syncOpenIntoPages(named, openPageId);
      const document = documentForSave(synced);
      // Phase 10: the pending DB model rides on the same save (one Rust
      // transaction); the key is omitted when nothing is pending.
      const pendingDbModel = get().pendingDbModel;
      await invoke("save_project", {
        id: openId,
        name,
        document: wireDocumentForSave(synced),
        ...(pendingDbModel !== null ? { dbModel: pendingDbModel } : {}),
      });
      // Edits made while the save was in flight stay dirty (document and model).
      const current = get().openDocument;
      const unchanged = current === openDocument;
      const latestModel = get().pendingDbModel;
      const stillPending = latestModel === pendingDbModel ? null : latestModel;
      set({
        openDocument: unchanged ? document : current,
        savedDocument: document,
        openName: name ?? get().openName,
        pendingDbModel: stillPending,
        dirty: projectDirty(unchanged ? false : !!current && isDirty(current, document), stillPending),
        loading: false,
      });
      await get().refreshProjects();
      return true;
    } catch (e) {
      set({ loading: false, error: errMessage(e) });
      return false;
    }
  },

  deleteProject: async (id) => {
    set({ loading: true, error: null });
    try {
      await invoke("delete_project", { id });
      const state = get();
      if (state.openId === id) {
        set({
          openId: null,
          openName: null,
          openDocument: null,
          savedDocument: null,
          dirty: false,
          pendingDbModel: null,
        });
      }
      set({ loading: false });
      await get().refreshProjects();
      return true;
    } catch (e) {
      set({ loading: false, error: errMessage(e) });
      return false;
    }
  },

  setOpenTitle: (title) => {
    const doc = get().openDocument;
    if (!doc) return;
    set({
      openName: title,
      openDocument: {
        ...doc,
        meta: { ...doc.meta, title },
      },
      dirty: true,
    });
  },

  commitOpenTitle: (title) => {
    const { openDocument: doc, savedDocument: saved } = get();
    if (!doc) return;
    const { title: _t, ...rest } = doc.meta;
    const savedMeta = saved?.meta;
    let meta = { ...doc.meta, title };
    if (savedMeta && savedMeta.title === title) {
      const { title: _s, ...savedRest } = savedMeta;
      const keys = new Set([...Object.keys(rest), ...Object.keys(savedRest)]);
      const same = [...keys].every(
        (k) => (rest as Record<string, unknown>)[k] === (savedRest as Record<string, unknown>)[k],
      );
      if (same) meta = savedMeta;
    }
    const next = { ...doc, meta };
    set({ openName: title, openDocument: next, dirty: projectDirty(isDirty(next, saved), get().pendingDbModel) });
  },

  updateOpenDocument: (document, opts) => {
    const { openId, openDocument: prev, savedDocument } = get();
    if (!openId || !prev || prev === document) return;
    const openPageId = useEditorStore.getState().openPageId;
    const next = syncOpenIntoPages(ensurePages(document), openPageId);
    // A write that changes nothing (e.g. the rename popover after เพิ่มหน้า
    // submitted with the same name) must not become an undo step.
    if (next.meta === prev.meta && next.root === prev.root && next.nodes === prev.nodes && !isProjectDirty(next, prev)) return;
    useEditorStore.getState().pushHistory(prev, opts?.historyKey);
    set({ openDocument: next, dirty: projectDirty(isDirty(next, savedDocument), get().pendingDbModel) });
  },

  restoreDocument: (document) => {
    if (!get().openId) return;
    const next = ensurePages(document);
    useEditorStore.getState().setOpenPageId(openPageIdOf(next));
    set({
      openDocument: next,
      dirty: projectDirty(isDirty(next, get().savedDocument), get().pendingDbModel),
    });
  },

  closeOpen: () => {
    useEditorStore.getState().setOpenPageId(null);
    set({
      openId: null,
      openName: null,
      openDocument: null,
      savedDocument: null,
      dirty: false,
      pendingDbModel: null,
    });
  },

  setPendingDbModel: (model) => {
    const { openId, openDocument, savedDocument } = get();
    if (!openId) return;
    const documentDirty = !!openDocument && isDirty(openDocument, savedDocument);
    set({ pendingDbModel: model, dirty: projectDirty(documentDirty, model) });
  },
}));
