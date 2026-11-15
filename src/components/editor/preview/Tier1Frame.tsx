import { useEffect, useRef, type CSSProperties } from "react";
import {
  RUNTIME_READY_TIMEOUT_MS,
  RUNTIME_URL,
  frameMessage,
  type AppToFrame,
  type RuntimePayload,
} from "@/lib/preview-runtime";

export type Tier1FrameProps = {
  payload: RuntimePayload;
  /** Route of the page open in the editor; sent with every payload. */
  path: string;
  title: string;
  style?: CSSProperties;
  className?: string;
  frameRef?: (el: HTMLIFrameElement | null) => void;
  onHeight?: (h: number) => void;
  /** The frame's router moved (a page link inside the page). */
  onRoute?: (path: string) => void;
  onExternal?: (href: string) => void;
  onSelect?: (id: string | null) => void;
  onBoxes?: (boxes: { id: string; x: number; y: number; w: number; h: number }[]) => void;
  /** Form↔DB submit from Preview (`data-wb-action="dbSubmit"`). */
  onDbSubmit?: (msg: { buttonId: string; values: Record<string, string | boolean> }) => void;
  /**
   * Form↔DB data query from Preview. Return a result object; the frame posts `wb:dbResult`.
   */
  onDbQuery?: (
    msg: Extract<import("@/lib/preview-runtime").FrameToApp, { type: "wb:dbQuery" }>,
  ) => Promise<Record<string, unknown>>;
  /** Runtime did not answer in time (missing build, blocked script) → caller falls back. */
  onTimeout?: () => void;
};

/**
 * S2 Tier 1 frame: the prebuilt export runtime in a sandboxed iframe
 * (`allow-scripts` only → opaque origin, no Tauri IPC). The document and the
 * generated CSS travel over `postMessage`; messages back are accepted only from
 * this frame's own window. Never re-mounted for a device change (DeviceStage).
 */
export function Tier1Frame({
  payload,
  path,
  title,
  style,
  className,
  frameRef,
  onHeight,
  onRoute,
  onExternal,
  onSelect,
  onBoxes,
  onDbSubmit,
  onDbQuery,
  onTimeout,
}: Tier1FrameProps) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const latest = useRef({
    payload,
    path,
    onHeight,
    onRoute,
    onExternal,
    onSelect,
    onBoxes,
    onDbSubmit,
    onDbQuery,
    onTimeout,
  });
  latest.current = {
    payload,
    path,
    onHeight,
    onRoute,
    onExternal,
    onSelect,
    onBoxes,
    onDbSubmit,
    onDbQuery,
    onTimeout,
  };
  const lastSentPath = useRef<string | null>(null);

  const send = (m: AppToFrame) => {
    ref.current?.contentWindow?.postMessage(m, "*");
  };

  // Messages from the frame + ready timeout.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!ready.current) latest.current.onTimeout?.();
    }, RUNTIME_READY_TIMEOUT_MS);
    const onMessage = (e: MessageEvent) => {
      const m = frameMessage(e, ref.current);
      if (!m) return;
      switch (m.type) {
        case "wb:ready": {
          ready.current = true;
          window.clearTimeout(timer);
          const { payload: p, path: pth } = latest.current;
          lastSentPath.current = pth;
          send({ type: "wb:site", ...p, path: pth });
          break;
        }
        case "wb:height":
          latest.current.onHeight?.(m.height);
          break;
        case "wb:route":
          latest.current.onRoute?.(m.path);
          break;
        case "wb:external":
          latest.current.onExternal?.(m.href);
          break;
        case "wb:select":
          latest.current.onSelect?.(m.id);
          break;
        case "wb:boxes":
          latest.current.onBoxes?.(m.boxes);
          break;
        case "wb:dbSubmit":
          latest.current.onDbSubmit?.({ buttonId: m.buttonId, values: m.values });
          break;
        case "wb:dbQuery": {
          const handler = latest.current.onDbQuery;
          if (!handler) break;
          void handler(m)
            .then((result) => {
              send({ type: "wb:dbResult", requestId: m.requestId, ...result });
            })
            .catch((err) => {
              send({
                type: "wb:dbResult",
                requestId: m.requestId,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          break;
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  // New document → re-send (keeps the frame's route unless the editor page changed).
  useEffect(() => {
    if (!ready.current) return;
    const pathChanged = lastSentPath.current !== path;
    lastSentPath.current = path;
    send({ type: "wb:site", ...payload, path: pathChanged ? path : undefined });
  }, [payload, path]);

  return (
    <iframe
      ref={(el) => {
        ref.current = el;
        frameRef?.(el);
      }}
      title={title}
      src={RUNTIME_URL}
      // Scripts run; no same-origin → opaque origin, no IPC, no app navigation.
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      style={style}
      className={className}
    />
  );
}
