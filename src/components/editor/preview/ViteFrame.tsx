import { useEffect, useRef, type CSSProperties } from "react";
import { frameMessage } from "@/lib/preview-runtime";
import { viteFrameOrigin } from "@/lib/preview-sidecar";

export type ViteFrameProps = {
  url: string;
  port: number;
  title: string;
  style?: CSSProperties;
  className?: string;
  frameRef?: (el: HTMLIFrameElement | null) => void;
  onHeight?: (h: number) => void;
  onRoute?: (path: string) => void;
  onExternal?: (href: string) => void;
  onSelect?: (id: string | null) => void;
  onBoxes?: (boxes: { id: string; x: number; y: number; w: number; h: number }[]) => void;
  onEdit?: (id: string | null) => void;
};

/**
 * S6 Tier 2 frame: Vite on 127.0.0.1, or the `wbpreview` bridge when the app
 * origin is `tauri://` (mixed content would otherwise blank the frame).
 * A3 item 2: sandboxed with the two tokens a Vite dev page needs — scripts, and its own origin (ES modules,
 * the HMR socket and our `e.origin` check). The origin is still the bridge / 127.0.0.1, never the app's,
 * so Tauri IPC stays unreachable; no forms, popups, top navigation, downloads or modals.
 */
export const VITE_FRAME_SANDBOX = "allow-scripts allow-same-origin";

export function ViteFrame({
  url,
  port,
  title,
  style,
  className,
  frameRef,
  onHeight,
  onRoute,
  onExternal,
  onSelect,
  onBoxes,
  onEdit,
}: ViteFrameProps) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const origin = viteFrameOrigin(url, port);
  const latest = useRef({ onHeight, onRoute, onExternal, onSelect, onBoxes, onEdit });
  latest.current = { onHeight, onRoute, onExternal, onSelect, onBoxes, onEdit };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = frameMessage(e, ref.current, origin);
      if (!m) return;
      switch (m.type) {
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
        case "wb:edit":
          latest.current.onEdit?.(m.id);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  return (
    <iframe
      ref={(el) => {
        ref.current = el;
        frameRef?.(el);
      }}
      title={title}
      src={url}
      sandbox={VITE_FRAME_SANDBOX}
      referrerPolicy="no-referrer"
      style={style}
      className={className}
    />
  );
}
