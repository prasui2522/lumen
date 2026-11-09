import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { DesignCanvas } from "@/components/editor/DesignCanvas";
import { ViteDesignCanvas } from "@/components/editor/ViteDesignCanvas";
import { StylePanel } from "@/components/editor/StylePanel";
import { PreviewStage } from "@/components/editor/PreviewStage";
import { EditorPanes } from "@/components/editor/EditorPanes";
import { DeviceToolbar } from "@/components/editor/preview/DeviceToolbar";
import { ViteRunButton } from "@/components/editor/preview/ViteRunButton";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AppTooltipProvider } from "@/components/ui/tooltip";
import type { LeaveIntent } from "@/components/editor/UnsavedChangesDialog";
import { lazyNamed, useMountedOnce, whenIdle } from "@/lib/lazy";
import { exportOpenProject } from "@/lib/export-project";
import { setLastExportDest } from "@/lib/export-folder";
import { useSplitSettings } from "@/lib/split-settings";
import { SplitStage } from "@/components/editor/SplitStage";
import { modeShortcut, cyclePane, PANE_SELECTOR } from "@/lib/editor-shortcuts";
import { toast } from "@/lib/toast";
import { isOverlayOpen } from "@/lib/modal";
import { saveShortcutAction } from "@/lib/save-shortcut";
import { commitProjectTitle, titleBlurShouldSave } from "@/lib/project-title";
import { evaluatePagePerf } from "@/lib/page-perf-watch";
import { useSidecarSession } from "@/lib/preview-sidecar";

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Lazy: mounted on first leave attempt, preloaded at idle so it opens instantly. */
const UnsavedChangesDialog = lazyNamed(() =>
  import("@/components/editor/UnsavedChangesDialog").then((m) => m.UnsavedChangesDialog),
);
/** Opened from the top-bar field or Ctrl/Cmd+K — not preloaded, so cmdk stays out of startup. */
const CommandPalette = lazyNamed(() =>
  import("@/components/editor/CommandPalette").then((m) => m.CommandPalette),
);

/**
 * Phase 10 database designer. Loaded on the first switch to `ฐานข้อมูล` only:
 * no whenIdle preload (PHASE-10-SPEC §5), so DB code stays out of startup.
 */
const DatabaseMode = lazyNamed(() =>
  import("@/components/database/DatabaseMode").then((m) => m.DatabaseMode),
);
/** Phase 11 D4: Blocks flyout (no whenIdle preload per §5). */
const BlocksFlyout = lazyNamed(() =>
  import("@/components/editor/blocks-flyout").then((m) => m.BlocksFlyout),
);
/** DW-M3: read-only Code view (PREVIEW-CODE-VIEW S3 first slice). */
const CodeView = lazyNamed(() =>
  import("@/components/editor/code-view").then((m) => m.CodeView),
);
/** S6 A4: Vite status bar + S9 crash banner (lazy; not in initial JS). */
const ViteStatusBar = lazyNamed(() =>
  import("@/components/editor/preview/vite-status-bar").then((m) => m.ViteStatusBar),
);
const ViteErrorBanner = lazyNamed(() =>
  import("@/components/editor/preview/vite-status-bar").then((m) => m.ViteErrorBanner),
);

/** Set right before an intentional reload/close so beforeunload stays quiet. */
let allowUnload = false;

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const openProject = useProjectsStore((s) => s.openProject);
  const openId = useProjectsStore((s) => s.openId);
  const openName = useProjectsStore((s) => s.openName);
  const dirty = useProjectsStore((s) => s.dirty);
  const loading = useProjectsStore((s) => s.loading);
  const error = useProjectsStore((s) => s.error);
  const clearError = useProjectsStore((s) => s.clearError);
  const setOpenTitle = useProjectsStore((s) => s.setOpenTitle);
  const saveOpenProject = useProjectsStore((s) => s.saveOpenProject);
  const closeOpen = useProjectsStore((s) => s.closeOpen);

  const setDocumentTitle = useEditorStore((s) => s.setDocumentTitle);
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const mode = useEditorStore((s) => s.mode);
  const resetEditorChrome = useEditorStore((s) => s.resetEditorChrome);
  const openPageId = useEditorStore((s) => s.openPageId);
  const blocksFlyoutOpen = useEditorStore((s) => s.blocksFlyoutOpen);
  const setBlocksFlyoutOpen = useEditorStore((s) => s.setBlocksFlyoutOpen);
  const blocksFlyoutMounted = useMountedOnce(blocksFlyoutOpen);
  const splitPane = useSplitSettings().pane;
  const viteChrome = mode === "preview" || mode === "split";
  const viteChromeMounted = useMountedOnce(viteChrome);
  useSidecarSession(mode, openId);

  useEffect(() => {
    if (!projectId) return;
    // Entering editor → always Design.
    resetEditorChrome();
    setSelectedNodeId(null);
    void (async () => {
      const project = await openProject(projectId);
      if (!project) {
        navigate("/", { replace: true });
        return;
      }
      setDocumentTitle(project.name);
    })();
    return () => {
      closeOpen();
      // Leaving editor → reset Design + clear preview status/error.
      resetEditorChrome();
    };
    // intentionally re-run when route id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const title = openName ?? "หน้าใหม่";
  const documentReady = openId === projectId;

  // B6.2: one O(n) perf pass when a page opens in Design (§5.3) — not on every edit.
  useEffect(() => {
    if (!documentReady) return;
    if (mode !== "design" && mode !== "preview" && mode !== "split") return;
    evaluatePagePerf(useProjectsStore.getState().openDocument);
  }, [documentReady, openPageId, mode]);

  /* ---- Leave guard: in-app navigation, window close, reload ---- */
  const [leaveIntent, setLeaveIntent] = useState<LeaveIntent | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const unsavedMounted = useMountedOnce(leaveIntent !== null);
  useEffect(() => whenIdle(() => void UnsavedChangesDialog.preload()), []);

  const [cmdOpen, setCmdOpen] = useState(false);
  /** Polite screen-reader cue (manual save, Preview page switch); no toast. */
  const announcement = useEditorStore((s) => s.announcement);
  const [cmdQuery, setCmdQuery] = useState("");
  const cmdMounted = useMountedOnce(cmdOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useEditorStore.getState().editingNodeId) return;
      if (isOverlayOpen()) return;

      const nextMode = modeShortcut(e);
      if (nextMode) {
        e.preventDefault();
        useEditorStore.getState().setMode(nextMode);
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        const panes = [...document.querySelectorAll(PANE_SELECTOR)];
        const cur = document.activeElement?.closest(PANE_SELECTOR) ?? null;
        const next = cyclePane(cur, panes, e.shiftKey);
        (next as HTMLElement | null)?.focus({ preventScroll: true });
        return;
      }
      if (e.key === "Escape") {
        const m = useEditorStore.getState().mode;
        if (m === "code" || m === "split") {
          const canvas = document.querySelector<HTMLElement>('[data-kbd-scope="canvas"]');
          if (
            canvas &&
            document.activeElement &&
            canvas !== document.activeElement &&
            !canvas.contains(document.activeElement)
          ) {
            e.preventDefault();
            canvas.focus({ preventScroll: true });
          }
        }
      }
      const quickOpen =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key.toLowerCase() === "k" || e.key.toLowerCase() === "p");
      if (!quickOpen) return;
      e.preventDefault();
      setCmdOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Every in-app route change while dirty: back button, history back/forward
  // (mouse/Alt+←), switching project. Requires the data router (App.tsx).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      useProjectsStore.getState().dirty &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state === "blocked") setLeaveIntent("navigate");
  }, [blocker.state]);

  const leave = useCallback(
    async (intent: LeaveIntent) => {
      setLeaveIntent(null);
      if (intent === "navigate") {
        if (blocker.state === "blocked") blocker.proceed();
        else navigate("/");
      } else if (intent === "reload") {
        allowUnload = true;
        window.location.reload();
      } else if (inTauri()) {
        allowUnload = true;
        await getCurrentWindow().destroy();
      }
    },
    [blocker, navigate],
  );

  const stay = () => {
    setLeaveIntent(null);
    if (blocker.state === "blocked") blocker.reset();
  };

  // The blocker decides whether to ask (only when dirty).
  const requestBack = () => navigate("/");

  useEffect(() => {
    allowUnload = false;
    // Reload keys inside the app → our dialog instead of losing edits.
    const onKey = (e: KeyboardEvent) => {
      const reload =
        e.key === "F5" || ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "r");
      if (!reload || !useProjectsStore.getState().dirty) return;
      e.preventDefault();
      setLeaveIntent("reload");
    };
    // Fallback for any other unload (browser/dev): native "leave site?" prompt.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowUnload || !useProjectsStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    // Tauri window close: intercept only while dirty.
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (inTauri()) {
      void getCurrentWindow()
        .onCloseRequested((e) => {
          if (!useProjectsStore.getState().dirty) return;
          e.preventDefault();
          setLeaveIntent("close");
        })
        .then((u) => {
          if (disposed) u();
          else unlisten = u;
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unlisten?.();
    };
  }, []);

  /** Manual save (button or title commit). Failure toasts; success does not. */
  const saveManual = async (name?: string) => {
    const ok = await saveOpenProject({ name });
    if (!ok) toast.error("บันทึกไม่สำเร็จ");
    else {
      // Cleared first inside announce(), so a repeat save is announced again.
      useEditorStore.getState().announce("บันทึกแล้ว");
    }
    return ok;
  };

  // Ctrl/Cmd+S → same path as the บันทึก button (latest closure via ref).
  const shortcutSave = useRef<() => void>(() => {});
  // Name read at call time: a Ctrl+S title commit updates the store before
  // this component re-renders, so the render-time `openName` would be stale.
  shortcutSave.current = () => void saveManual(useProjectsStore.getState().openName ?? undefined);
  const cmdOpenRef = useRef(false);
  cmdOpenRef.current = cmdOpen;
  useEffect(() => {
    // Capture phase: the inline editor stops propagation of its keydowns.
    const onKey = (e: KeyboardEvent) => {
      const titleEl = () => {
        const a = document.activeElement;
        return a instanceof HTMLInputElement && a.hasAttribute("data-project-title") ? a : null;
      };
      const state = (titleDone = false) => ({
        blocked: cmdOpenRef.current || isOverlayOpen(),
        editing: !!useEditorStore.getState().editingNodeId,
        titleFocused: !titleDone && !!titleEl(),
        dirty: useProjectsStore.getState().dirty,
        saving: useProjectsStore.getState().loading,
      });
      let action = saveShortcutAction(e, state());
      if (action === "pass") return;
      e.preventDefault(); // never the webview/browser save dialog
      if (action === "commit") {
        // Same commit as Esc: blur runs the editor's finish → commitEdit
        // (synchronous store write), then focus returns to the canvas.
        document.querySelector<HTMLElement>("[data-editing]")?.blur();
        document
          .querySelector<HTMLElement>('[data-kbd-scope="canvas"]')
          ?.focus({ preventScroll: true });
        if (useEditorStore.getState().editingNodeId) return; // commit did not land
        action = saveShortcutAction(e, state());
      }
      if (action === "commit-title") {
        // Same rule as the field's blur (trim, empty → default), without
        // blur's unconditional save; the dirty check below decides.
        const el = titleEl();
        if (el) {
          const next = commitProjectTitle(el.value);
          useProjectsStore.getState().commitOpenTitle(next);
          useEditorStore.getState().setDocumentTitle(next);
        }
        action = saveShortcutAction(e, state(true));
      }
      if (action === "save") shortcutSave.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const saveAndLeave = async () => {
    if (!leaveIntent) return;
    setLeaveSaving(true);
    const ok = await saveOpenProject({ name: openName ?? undefined });
    setLeaveSaving(false);
    if (ok) await leave(leaveIntent);
    else {
      // Failed save must not dismiss the guard or unblock navigation.
      toast.error("บันทึกไม่สำเร็จ — ยังไม่ได้ออกจากหน้านี้");
    }
  };

  /* ---- Export ---- */
  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const r = await exportOpenProject();
      if (r.status === "done") {
        if (openId) setLastExportDest(openId, r.destPath);
        toast.success(
          r.includedUnsaved
            ? `ส่งออกแล้ว: ${r.fileName} (รวมการแก้ไขที่ยังไม่บันทึก)`
            : `ส่งออกแล้ว: ${r.fileName}`,
        );
      }
    } catch (e) {
      toast.error(`ส่งออกไม่สำเร็จ: ${errMessage(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppTooltipProvider>
    <div className="flex h-svh min-w-0 flex-col overflow-hidden bg-background">
      <EditorTopBar
        title={title}
        dirty={dirty}
        saving={loading}
        modeDisabled={!documentReady}
        onTitleChange={(t) => {
          setOpenTitle(t);
          setDocumentTitle(t);
        }}
        onTitleCommit={(t) => {
          // Blur / Enter: already normalised by commitProjectTitle in the top
          // bar; recompute dirty, then save only if something actually changed.
          useProjectsStore.getState().commitOpenTitle(t);
          setDocumentTitle(t);
          const { dirty, loading } = useProjectsStore.getState();
          if (titleBlurShouldSave({ dirty, saving: loading })) void saveManual(t);
        }}
        onSave={() => {
          void saveManual(openName ?? undefined);
        }}
        onBack={requestBack}
        onExport={() => void onExport()}
        onOpenSite={() => {
          if (!openId) return;
          void invoke("open_project_folder", { projectId: openId }).catch((e: unknown) =>
            toast.error(errMessage(e)),
          );
        }}
        exporting={exporting}
        exportDisabled={!documentReady}
        paletteQuery={cmdQuery}
        onPalette={(query) => {
          setCmdQuery(query);
          setCmdOpen(true);
        }}
        previewTools={
          mode === "preview" || (mode === "split" && splitPane === "preview")
            ? (compact) => <DeviceToolbar compact={compact} />
            : mode === "split"
              ? () => <ViteRunButton />
              : undefined
        }
      />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {cmdMounted ? (
        <Suspense fallback={null}>
          <CommandPalette
            open={cmdOpen}
            query={cmdQuery}
            onQueryChange={setCmdQuery}
            onOpenChange={(open) => {
              setCmdOpen(open);
              if (!open) setCmdQuery("");
            }}
            onSave={() => void saveManual(openName ?? undefined)}
            onExport={() => void onExport()}
            onBack={requestBack}
          />
        </Suspense>
      ) : null}

      {unsavedMounted ? (
        <Suspense fallback={null}>
          <UnsavedChangesDialog
            open={leaveIntent !== null}
            intent={leaveIntent ?? "navigate"}
            saving={leaveSaving}
            onSave={() => void saveAndLeave()}
            onDiscard={() => leaveIntent && void leave(leaveIntent)}
            onCancel={stay}
          />
        </Suspense>
      ) : null}

      {error ? (
        <div
          className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" onClick={clearError}>
            ปิด
          </Button>
        </div>
      ) : null}

      {viteChromeMounted && viteChrome ? (
        <Suspense fallback={null}>
          <ViteErrorBanner />
        </Suspense>
      ) : null}

      {mode === "database" ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {documentReady ? (
            <Suspense
              fallback={
                <div
                  role="status"
                  className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
                >
                  <Spinner className="size-4" aria-hidden />
                  กำลังโหลดฐานข้อมูล…
                </div>
              }
            >
              <DatabaseMode />
            </Suspense>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              กำลังเปิดโปรเจกต์…
            </div>
          )}
        </div>
      ) : mode === "split" ? (
        <SplitStage documentReady={documentReady} />
      ) : mode === "preview" ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {documentReady ? (
            <PreviewStage />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              กำลังเปิดโปรเจกต์…
            </div>
          )}
        </div>
      ) : mode === "code" ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {documentReady ? (
            <Suspense
              fallback={
                <div
                  role="status"
                  className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
                >
                  <Spinner className="size-4" aria-hidden />
                  กำลังโหลดโค้ด…
                </div>
              }
            >
              <CodeView />
            </Suspense>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              กำลังเปิดโปรเจกต์…
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <EditorPanes
            layers={<LayersPanel />}
            canvas={
              <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
                <ViteDesignCanvas
                  fallback={
                    <main
                      data-kbd-pane="canvas"
                      tabIndex={-1}
                      className="relative flex h-full min-h-0 min-w-0 flex-col bg-muted/40"
                    >
                      {documentReady ? (
                        <DesignCanvas />
                      ) : (
                        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                          กำลังเปิดโปรเจกต์…
                        </div>
                      )}
                    </main>
                  }
                />
                {blocksFlyoutMounted ? (
                  <Suspense fallback={null}>
                    <BlocksFlyout open={blocksFlyoutOpen} onOpenChange={setBlocksFlyoutOpen} />
                  </Suspense>
                ) : null}
              </div>
            }
            style={<StylePanel />}
          />
        </div>
      )}

      {viteChromeMounted ? (
        <Suspense fallback={null}>
          {viteChrome ? <ViteStatusBar /> : null}
        </Suspense>
      ) : null}
    </div>
    </AppTooltipProvider>
  );
}
