import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { isContentLocked, setNodeStyle } from "@/lib/document-ops";
import { RESIZE_HANDLES, resizedSize, type ResizeHandle } from "@/lib/preview-chrome";
import { usePhrase } from "@/lib/phrases";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";

export type NodeBox = { id: string; x: number; y: number; w: number; h: number };

const HANDLE_LABEL: Record<ResizeHandle, string> = {
  n: "ปรับความสูงด้านบน",
  s: "ปรับความสูงด้านล่าง",
  e: "ปรับความกว้างด้านขวา",
  w: "ปรับความกว้างด้านซ้าย",
  ne: "ปรับขนาดมุมขวาบน",
  nw: "ปรับขนาดมุมซ้ายบน",
  se: "ปรับขนาดมุมขวาล่าง",
  sw: "ปรับขนาดมุมซ้ายล่าง",
};

/** Position a 8px handle on the box edge. Values are px in the iframe. */
function handleStyle(handle: ResizeHandle): CSSProperties {
  const edge = -4;
  const pos: React.CSSProperties = { width: 8, height: 8 };
  if (handle.includes("n")) pos.top = edge;
  if (handle.includes("s")) pos.bottom = edge;
  if (handle.includes("e")) pos.right = edge;
  if (handle.includes("w")) pos.left = edge;
  if (handle === "n" || handle === "s") {
    pos.left = "50%";
    pos.marginLeft = -4;
  }
  if (handle === "e" || handle === "w") {
    pos.top = "50%";
    pos.marginTop = -4;
  }
  const cursor =
    handle === "n" || handle === "s"
      ? "ns-resize"
      : handle === "e" || handle === "w"
        ? "ew-resize"
        : handle === "ne" || handle === "sw"
          ? "nesw-resize"
          : "nwse-resize";
  return { ...pos, cursor };
}

/**
 * Sky frame over the selected node, plus drag handles that write width and height
 * in one undo step. Clicks on the page still reach the iframe (the frame itself
 * does not take pointer events).
 */
export function PreviewSelection({ boxes, scale }: { boxes: NodeBox[]; scale: number }) {
  const p = usePhrase();
  const selectedId = useEditorStore((s) => s.selectedNodeId);
  const doc = useProjectsStore((s) => s.openDocument);
  const [draft, setDraft] = useState<{ w: number; h: number } | null>(null);
  const box = boxes.find((b) => b.id === selectedId);
  const node = selectedId && doc ? doc.nodes[selectedId] : undefined;
  if (!box || !node || !doc || !selectedId) return null;
  const locked = isContentLocked(doc, node);
  const w = draft?.w ?? box.w;
  const h = draft?.h ?? box.h;

  const startDrag = (handle: ResizeHandle, e: ReactPointerEvent) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    const origin = { w: box.w, h: box.h, x: e.clientX, y: e.clientY };
    const factor = scale > 0 ? scale : 1;
    const apply = (ev: PointerEvent) =>
      resizedSize(origin, handle, (ev.clientX - origin.x) / factor, (ev.clientY - origin.y) / factor);
    const move = (ev: PointerEvent) => setDraft(apply(ev));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const next = apply(ev);
      setDraft(null);
      const current = useProjectsStore.getState().openDocument;
      if (!current) return;
      const withW = setNodeStyle(current, selectedId, "width", next.w);
      const withH = setNodeStyle(withW ?? current, selectedId, "height", next.h);
      const written = withH ?? withW;
      if (written) useProjectsStore.getState().updateOpenDocument(written);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden={locked}>
      <div
        data-preview-selection=""
        className="absolute border-2 border-sky-500"
        style={{ left: box.x, top: box.y, width: w, height: h }}
      >
        {locked
          ? null
          : RESIZE_HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                aria-label={p(HANDLE_LABEL[handle])}
                className="pointer-events-auto absolute border border-sky-500 bg-white"
                style={handleStyle(handle)}
                onPointerDown={(e) => startDrag(handle, e)}
              />
            ))}
      </div>
    </div>
  );
}
