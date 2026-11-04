import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDocumentEmpty } from "@/components/editor/node-view";
import { documentForPreview } from "@/lib/breakpoints";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";
import { DeviceStage } from "@/components/editor/preview/DeviceStage";

/** Debounce for recompiles while Preview is open (doc edits, e.g. title). */
const RECOMPILE_MS = 200;

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Preview stage (DESIGN-PREVIEW-UX.md §4/§5, Phase 3): the in-memory
 * PageDocument (unsaved edits included) is compiled by the Rust
 * `compile_preview` command and shown in a sandboxed iframe (`srcdoc`,
 * `sandbox="allow-same-origin"` WITHOUT allow-scripts → no scripts, no
 * navigation of the app, no popups; same-origin only so the parent can read
 * the content height for auto-sizing). The compiler also emits inert links
 * and a strict CSP for Preview. Framing (device presets, fill) is DeviceStage
 * (DEVICE-PREVIEW-SPEC §4).
 */
export function PreviewStage() {
  const openDocument = useProjectsStore((s) => s.openDocument);
  const previewStatus = useEditorStore((s) => s.previewStatus);
  const previewError = useEditorStore((s) => s.previewError);
  const setPreviewStatus = useEditorStore((s) => s.setPreviewStatus);
  const setPreviewError = useEditorStore((s) => s.setPreviewError);
  const setMode = useEditorStore((s) => s.setMode);

  const [html, setHtml] = useState<string | null>(null);
  const htmlRef = useRef<string | null>(null);
  /** Monotonic request id — responses from older requests are ignored. */
  const seq = useRef(0);
  const entered = useRef(false);
  /** Mounted flag: responses after leaving Preview are dropped. */
  const alive = useRef(false);
  /**
   * Document object last sent to compile_preview (in flight or done). Same
   * object again → skip: dedupes StrictMode's double effect run in dev (which
   * used to invoke twice on entering Preview). Every edit produces a new
   * document object, so recompiles after edits are unaffected; `retry` forces.
   */
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
      setPreviewStatus("ready"); // empty state renders below
      return;
    }
    // First build shows the loading state; later rebuilds keep the old frame.
    if (htmlRef.current === null) setPreviewStatus("loading");
    try {
      const out = await invoke<string>("compile_preview", {
        document: documentForPreview(doc),
        projectId: openId,
      });
      if (my !== seq.current || !alive.current) return; // stale / left Preview
      htmlRef.current = out;
      setHtml(out);
      setPreviewError(null);
      setPreviewStatus("ready");
    } catch (e) {
      if (my !== seq.current || !alive.current) return;
      setPreviewError(errMessage(e));
      setPreviewStatus("error");
    }
  }, [setPreviewError, setPreviewStatus]);

  /** Open page root at the last effect run: a change means a page switch. */
  const lastRoot = useRef<string | null>(null);

  // Enter Preview → compile now; doc changes while open → debounced. A page
  // switch (e.g. a Preview page link) compiles at once: the frame is on the
  // blank marker page until the new srcDoc arrives.
  useEffect(() => {
    const root = openDocument?.root ?? null;
    const pageSwitched = lastRoot.current !== null && root !== lastRoot.current;
    lastRoot.current = root;
    if (!entered.current) {
      entered.current = true;
      void compile();
      return;
    }
    if (pageSwitched) {
      void compile();
      return;
    }
    const t = window.setTimeout(() => void compile(), RECOMPILE_MS);
    return () => window.clearTimeout(t);
  }, [openDocument, compile]);

  // Leaving Preview: drop any in-flight response. (Not seq++: StrictMode's
  // simulated unmount/remount must not invalidate the deduped first compile.)
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const retry = () => {
    htmlRef.current = null;
    setHtml(null);
    setPreviewError(null);
    void compile(true);
  };

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

  if (html === null || previewStatus === "loading" || previewStatus === "idle") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/40 p-6">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">กำลังสร้างตัวอย่าง…</p>
      </div>
    );
  }

  // Device frames, scale-to-fit and fill auto-height live in DeviceStage. A
  // device switch never reaches this component's compile logic.
  return <DeviceStage html={html} />;
}
