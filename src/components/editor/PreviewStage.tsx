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
import { useSidecarStatus, viteFrameUrl } from "@/lib/preview-sidecar";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";
import { DeviceStage, type FrameSource } from "@/components/editor/preview/DeviceStage";

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
  const openDocument = useProjectsStore((s) => s.openDocument);
  const openPageId = useEditorStore((s) => s.openPageId);
  const previewStatus = useEditorStore((s) => s.previewStatus);
  const previewError = useEditorStore((s) => s.previewError);
  const setPreviewStatus = useEditorStore((s) => s.setPreviewStatus);
  const setPreviewError = useEditorStore((s) => s.setPreviewError);
  const setMode = useEditorStore((s) => s.setMode);
  const sidecar = useSidecarStatus();

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
      useEditorStore.getState().announce("กลับไปใช้ตัวอย่างในแอป");
      return;
    }
    setFellBack(true);
    setPreviewError("สร้างตัวอย่างไม่ได้");
    setPreviewStatus("error");
    useEditorStore.getState().announce("กลับไปใช้ตัวอย่างในแอป");
  }, [setPreviewError, setPreviewStatus]);

  if (openDocument && isDocumentEmpty(openDocument)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6">
        <p className="text-sm font-medium">หน้ายังว่าง</p>
        <p className="text-sm text-muted-foreground">
          กลับไปที่ออกแบบเพื่อเพิ่มเนื้อหา
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMode("design")}
        >
          ออกแบบ
        </Button>
      </div>
    );
  }

  const viteOn = sidecar.state === "running" && sidecar.port != null;
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
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DeviceStage source={source} />
      </div>
    );
  }

  if (previewStatus === "error") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6">
        <p className="text-sm font-medium text-destructive">สร้างตัวอย่างไม่ได้</p>
        {previewError ? (
          <p className="max-w-md truncate text-center text-xs text-muted-foreground">
            {previewError}
          </p>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          ลองอีกครั้ง
        </Button>
      </div>
    );
  }

  if (!payload || previewStatus === "loading" || previewStatus === "idle") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">กำลังสร้างตัวอย่าง…</p>
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
          กลับไปใช้ตัวอย่างในแอป (Fell back to built-in Preview)
        </p>
      ) : null}
      <DeviceStage source={source} />
    </div>
  );
}
