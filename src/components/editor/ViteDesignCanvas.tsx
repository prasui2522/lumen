/**
 * R7: design on the Vite iframe. Selection, reorder, and inline text stay in the
 * app document (same undo as the canvas). If Vite is down, the in-app canvas shows.
 * A3 item 13 (PREVIEW spec): Design never starts the sidecar. The in-app canvas is the default; the Vite
 * frame appears here only after the user starts Vite with รันด้วย Vite (one tree, 60 s idle stop unchanged).
 */
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { findParent, moveNodeInDocument, setNodeProp } from "@/lib/document-ops";
import { useSidecarStatus, viteFrameUrl } from "@/lib/preview-sidecar";
import { useProjectsStore } from "@/stores/projects-store";
import { useEditorStore } from "@/stores/editor-store";
import { ViteFrame } from "@/components/editor/preview/ViteFrame";

type Box = { id: string; x: number; y: number; w: number; h: number };

export function ViteDesignCanvas({ fallback }: { fallback: ReactNode }) {
  const doc = useProjectsStore((s) => s.openDocument);
  const updateOpenDocument = useProjectsStore((s) => s.updateOpenDocument);
  const selected = useEditorStore((s) => s.selectedNodeId);
  const setSelected = useEditorStore((s) => s.setSelectedNodeId);
  const status = useSidecarStatus();
  const [forceCanvas, setForceCanvas] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  if (forceCanvas || status.state !== "running" || status.port == null) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-2 text-[11px] text-muted-foreground">
          {status.state === "starting" ? "กำลังเปิดตัวอย่าง Vite…" : "ผืนผ้าในแอป"}
          {forceCanvas && status.state === "running" ? (
            <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setForceCanvas(false)}>
              ใช้เฟรม Vite
            </Button>
          ) : null}
        </div>
        {fallback}
      </div>
    );
  }

  const url = viteFrameUrl(status.port, "/");
  const editBox = boxes.find((b) => b.id === editId);

  const pointIn = (clientX: number, clientY: number) => {
    const iframe = wrapRef.current?.querySelector("iframe");
    if (!iframe) return null;
    const ir = iframe.getBoundingClientRect();
    const x = clientX - ir.left;
    const y = clientY - ir.top;
    let best: { id: string; area: number } | null = null;
    for (const b of boxes) {
      if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) continue;
      const area = Math.max(1, b.w * b.h);
      if (!best || area < best.area) best = { id: b.id, area };
    }
    return best?.id ?? null;
  };

  return (
    <div data-kbd-pane="canvas" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col outline-none">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-2 text-[11px] text-muted-foreground">
        ออกแบบบน Vite
        <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setForceCanvas(true)}>
          ใช้ผืนผ้าในแอป
        </Button>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <ViteFrame
          url={url}
          port={status.port}
          title="ออกแบบบน Vite"
          className="pointer-events-none h-full w-full border-0 bg-background"
          onBoxes={setBoxes}
          onSelect={setSelected}
          onEdit={(id) => {
            if (!id || !doc) return;
            const node = doc.nodes[id];
            const content = node && "content" in node.props ? node.props.content : null;
            if (typeof content !== "string") return;
            setSelected(id);
            setEditId(id);
            setDraft(content);
          }}
        />
        <div
          className="absolute inset-0"
          onPointerDown={(ev) => {
            const id = pointIn(ev.clientX, ev.clientY);
            if (!id) {
              setSelected(null);
              return;
            }
            setSelected(id);
            drag.current = { id, x: ev.clientX, y: ev.clientY, moved: false };
            (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
          }}
          onPointerMove={(ev) => {
            const d = drag.current;
            if (!d) return;
            if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4) d.moved = true;
          }}
          onPointerUp={(ev) => {
            const d = drag.current;
            drag.current = null;
            if (!d?.moved || !doc) return;
            const target = pointIn(ev.clientX, ev.clientY);
            if (!target || target === d.id) return;
            const parent = findParent(doc, target);
            if (!parent) return;
            const parentNode = doc.nodes[parent.parentId];
            const kids =
              parentNode && "children" in parentNode.props && Array.isArray(parentNode.props.children)
                ? parentNode.props.children
                : [];
            const iframe = wrapRef.current?.querySelector("iframe");
            const top = iframe ? ev.clientY - iframe.getBoundingClientRect().top : ev.clientY;
            let index = kids.length;
            for (let i = 0; i < kids.length; i++) {
              const b = boxes.find((x) => x.id === kids[i]);
              if (b && top < b.y + b.h / 2) {
                index = i;
                break;
              }
            }
            const next = moveNodeInDocument(doc, d.id, parent.parentId, index);
            if (next) updateOpenDocument(next);
          }}
        />
        {editBox && editId ? (
          <input
            aria-label="ข้อความในโหนด"
            className="absolute z-10 rounded-sm border border-ring bg-background px-1 text-sm"
            style={{ left: editBox.x, top: editBox.y, width: Math.max(80, editBox.w) }}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (doc) {
                const next = setNodeProp(doc, editId, "content", draft);
                if (next) updateOpenDocument(next);
              }
              setEditId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditId(null);
            }}
          />
        ) : null}
        {selected ? (
          <span className="sr-only">เลือก {selected}</span>
        ) : null}
      </div>
    </div>
  );
}
