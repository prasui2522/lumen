import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDocumentEmpty } from "@/components/editor/node-view";
import { ensurePages, openPageIdOf, syncOpenIntoPages } from "@/lib/project-pages";
import {
  RUNTIME_UPDATE_MS,
  payloadFromBundle,
  type PreviewBundle,
  type RuntimePayload,
} from "@/lib/preview-runtime";
import { publishSidecar, sidecarStatus, useSidecarStatus, viteFrameAllowed, viteFrameUrl } from "@/lib/preview-sidecar";
import {
  VITE_DIRTY_BADGE,
  VITE_UNSAVED_SUB,
  VITE_UNSAVED_TITLE,
  viteSaveState,
} from "@/lib/vite-save-hint";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";
import { DeviceStage, type FrameSource } from "@/components/editor/preview/DeviceStage";
import { phrase, usePhrase } from "@/lib/phrases";
import { peekLocale } from "@/lib/locale";

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Preview stage (DESIGN-PREVIEW-UX.md §4/§5; PREVIEW-CODE-VIEW S2/S6/S10).
 * Default is the Tier 1 export runtime. รันด้วย Vite swaps the frame to the
 * sidecar. S10: live Preview does not invoke the static HTML compiler.
 */
export function PreviewStage() {
  const p = usePhrase();
  const openDocument = useProjectsStore((s) => s.openDocument);
  const savedDocument = useProjectsStore((s) => s.savedDocument);
  const dirty = useProjectsStore((s) => s.dirty);
  const openPageId = useEditorStore((s) => s.openPageId);
  const previewStatus = useEditorStore((s) => s.previewStatus);
  const previewError = useEditorStore((s) => s.previewError);
  const setPreviewStatus = useEditorStore((s) => s.setPreviewStatus);
  const setPreviewError = useEditorStore((s) => s.setPreviewError);
  const setMode = useEditorStore((s) => s.setMode);
  const sidecar = useSidecarStatus();
  const [sidecarChecked, setSidecarChecked] = useState(false);

  // Entering Preview/Split mounts this stage. Read the live sidecar before
  // trusting a port left in memory after the 60s idle stop.
  useEffect(() => {
    let cancel = false;
    void sidecarStatus().then((s) => {
      if (cancel) return;
      publishSidecar(s);
      setSidecarChecked(true);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const [fellBack, setFellBack] = useState(false);
  const [payload, setPayload] = useState<RuntimePayload | null>(null);
  const payloadRef = useRef<RuntimePayload | null>(null);
  const seq = useRef(0);
  const entered = useRef(false);
  const alive = useRef(false);
  const lastDoc = useRef<unknown>(null);

  const compile = useCallback(async (force = false) => {
    const { openDocument: doc, openId } = useProjectsStore.getState();
    if (!force && doc && doc === lastDoc.current) return;
    lastDoc.current = doc;
    const my = ++seq.current;
    if (!doc) {
      setPreviewError("ไม่มีเอกสาร");
      setPreviewStatus("error");
      return;
    }
    if (isDocumentEmpty(doc)) {
      setPreviewStatus("ready");
      return;
    }
    const first = payloadRef.current === null;
    if (first) setPreviewStatus("loading");
    try {
      const bundle = await invoke<PreviewBundle>("preview_bundle", {
        projectId: openId,
        document: syncOpenIntoPages(ensurePages(doc), useEditorStore.getState().openPageId),
      });
      if (my !== seq.current || !alive.current) return;
      const p = payloadFromBundle(bundle);
      payloadRef.current = p;
      setPayload(p);
      setPreviewError(null);
      setPreviewStatus("ready");
    } catch (e) {
      if (my !== seq.current || !alive.current) return;
      if (payloadRef.current) {
        setPreviewStatus("ready");
        return;
      }
      setPreviewError(errMessage(e));
      setPreviewStatus("error");
    }
  }, [setPreviewError, setPreviewStatus]);

  useEffect(() => {
    if (!entered.current) {
      entered.current = true;
      void compile();
      return;
    }
    const t = window.setTimeout(() => void compile(), RUNTIME_UPDATE_MS);
    return () => window.clearTimeout(t);
  }, [openDocument, compile]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const retry = () => {
    payloadRef.current = null;
    setPayload(null);
    setPreviewError(null);
    setFellBack(false);
    void compile(true);
  };

  const fallbackToBuiltIn = useCallback(() => {
    if (payloadRef.current) {
      setFellBack(true);
      useEditorStore.getState().announce(phrase(peekLocale(), "กลับไปใช้ตัวอย่างในแอป"));
      return;
    }
    setFellBack(true);
    setPreviewError(phrase(peekLocale(), "สร้างตัวอย่างไม่ได้"));
    setPreviewStatus("error");
    useEditorStore.getState().announce(phrase(peekLocale(), "กลับไปใช้ตัวอย่างในแอป"));
  }, [setPreviewError, setPreviewStatus]);

  if (openDocument && isDocumentEmpty(openDocument)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6">
        <p className="text-sm font-medium">{p("หน้ายังว่าง")}</p>
        <p className="text-sm text-muted-foreground">
          {p("กลับไปที่ออกแบบเพื่อเพิ่มเนื้อหา")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMode("design")}
        >
          {p("ออกแบบ")}
        </Button>
      </div>
    );
  }

  const viteOn = viteFrameAllowed(sidecarChecked, sidecar);
  const pages = openDocument ? ensurePages(openDocument).pages! : [];
  const pid = openPageId ?? (openDocument ? openPageIdOf(openDocument) : null);
  const page = pages.find((p) => p.id === pid) ?? pages[0];

  if (viteOn && page && sidecar.port != null) {
    const source: FrameSource = {
      kind: "vite",
      url: viteFrameUrl(sidecar.port, page.path),
      port: sidecar.port,
      path: page.path,
      pageName: page.name,
    };
    // A3 item 10: a Thai hint instead of a blank frame before the first save; a badge for unsaved edits.
    const saveState = viteSaveState({
      savedEmpty: !savedDocument || isDocumentEmpty(savedDocument),
      openEmpty: !openDocument || isDocumentEmpty(openDocument),
      dirty,
    });
    if (saveState === "unsaved") {
      return (
        <div
          data-testid="vite-unsaved-hint"
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center"
        >
          <p className="text-sm font-medium text-foreground">{VITE_UNSAVED_TITLE}</p>
          <p className="max-w-md text-xs text-muted-foreground">{VITE_UNSAVED_SUB}</p>
        </div>
      );
    }
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {saveState === "dirty" ? (
          <p
            role="status"
            data-testid="vite-dirty-badge"
            className="shrink-0 border-b border-border bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground"
          >
            {VITE_DIRTY_BADGE}
          </p>
        ) : null}
        <DeviceStage source={source} />
      </div>
    );
  }

  if (previewStatus === "error") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6">
        <p className="text-sm font-medium text-destructive">{p("สร้างตัวอย่างไม่ได้")}</p>
        {previewError ? (
          <p className="max-w-md truncate text-center text-xs text-muted-foreground">
            {previewError}
          </p>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {p("ลองอีกครั้ง")}
        </Button>
      </div>
    );
  }

  if (!payload || previewStatus === "loading" || previewStatus === "idle") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{p("กำลังสร้างตัวอย่าง…")}</p>
      </div>
    );
  }

  const source: FrameSource = {
    kind: "runtime",
    payload,
    path: page?.path ?? "/",
    pageName: page?.name ?? "",
    onTimeout: fallbackToBuiltIn,
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {fellBack ? (
        <p
          role="status"
          className="shrink-0 border-b border-border bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground"
        >
          {p("กลับไปใช้ตัวอย่างในแอป")}
        </p>
      ) : null}
      <DeviceStage source={source} />
    </div>
  );
}
