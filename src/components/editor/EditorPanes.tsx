import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useEditorStore } from "@/stores/editor-store";

/**
 * Design-mode pane layout (UI-REFRESH S3): layers | canvas | style with
 * draggable 1 px handles. App-level preference in localStorage (never in the
 * document, never marks it dirty). Lives in the lazy editor chunk.
 *
 * Widths are written only on pointerup, keyup and double-click, from the
 * panel's DOM width. Window reflow, a collapsed layers pane, and the
 * programmatic expand back to the saved width must not touch storage —
 * `getSize().inPixels` lies during those (it reported 313/403 while the
 * screen still showed 224/288, and an expand after drag-collapse stored the
 * 200 px minimum over the real 304).
 */
const STORAGE_KEY = "wb.editor.layout.v1";
const LAYERS = { def: 224, min: 200, max: 360 };
const STYLE = { def: 288, min: 256, max: 420 };
const CANVAS_MIN = 360;

type SavedLayout = { layers: number; style: number };

const clamp = (n: unknown, r: { def: number; min: number; max: number }) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, Math.round(n))) : r.def;

/** Pixel widths (not percentages), so side panes keep their size across window sizes. */
function loadLayout(): SavedLayout {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SavedLayout> | null;
    return { layers: clamp(v?.layers, LAYERS), style: clamp(v?.style, STYLE) };
  } catch {
    return { layers: LAYERS.def, style: STYLE.def };
  }
}

function saveLayout(l: SavedLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
  } catch {
    /* storage unavailable: layout just isn't remembered */
  }
}

const HANDLE =
  "transition-colors hover:bg-ring/60 focus-visible:bg-ring data-[separator=active]:bg-ring";

type Props = {
  /** Rendered only while the layers pane is open (no hidden Tab stops when collapsed). */
  layers: ReactNode;
  canvas: ReactNode;
  style: ReactNode;
};

function domPx(el: HTMLDivElement | null): number | null {
  if (!el) return null;
  const w = el.getBoundingClientRect().width;
  return Number.isFinite(w) ? Math.round(w) : null;
}

export function EditorPanes({ layers, canvas, style }: Props) {
  const isSidebarOpen = useEditorStore((s) => s.isSidebarOpen);
  // Read once per Design mount (entering the editor or returning from Preview).
  const saved = useRef<SavedLayout | null>(null);
  saved.current ??= loadLayout();
  const initialOpen = useRef(isSidebarOpen);
  const layersRef = usePanelRef();
  const styleRef = usePanelRef();
  const groupEl = useRef<HTMLDivElement | null>(null);
  const layersEl = useRef<HTMLDivElement | null>(null);
  const styleEl = useRef<HTMLDivElement | null>(null);
  /** True while a toggle is restoring the saved width (that resize must not be stored). */
  const expanding = useRef(false);

  const persist = useCallback(() => {
    if (expanding.current) return;
    const prev = saved.current ?? loadLayout();
    const l = layersRef.current;
    const collapsed = !l || l.isCollapsed();
    const layersW = collapsed ? null : domPx(layersEl.current);
    const styleW = domPx(styleEl.current);
    const next: SavedLayout = {
      layers: layersW != null && layersW >= LAYERS.min ? clamp(layersW, LAYERS) : prev.layers,
      style: styleW != null && styleW >= STYLE.min ? clamp(styleW, STYLE) : prev.style,
    };
    if (next.layers === prev.layers && next.style === prev.style) return;
    saved.current = next;
    saveLayout(next);
  }, [layersRef]);

  // Top-bar toggle (store) → panel. Expanding restores the remembered width.
  useEffect(() => {
    const p = layersRef.current;
    if (!p) return;
    if (isSidebarOpen && p.isCollapsed()) {
      expanding.current = true;
      p.resize(`${saved.current?.layers ?? LAYERS.def}px`);
      requestAnimationFrame(() => {
        expanding.current = false;
      });
    } else if (!isSidebarOpen && !p.isCollapsed()) {
      p.collapse();
    }
  }, [isSidebarOpen, layersRef]);

  // Panel → store: dragging below the minimum collapses (and back out expands).
  const onLayersResize = useCallback((size: { inPixels: number }) => {
    const collapsed = size.inPixels < 1;
    const st = useEditorStore.getState();
    if (st.isSidebarOpen === collapsed) st.toggleSidebar();
  }, []);

  // pointerup / keyup only. Not onLayoutChanged: that also fires for window
  // reflow and for programmatic expand, and on a resize key it reports the
  // width from before the key.
  useEffect(() => {
    const root = groupEl.current;
    if (!root) return;
    const onPointerUp = () => persist();
    const onKeyUp = (e: KeyboardEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest("[data-slot='resizable-handle']")) return;
      // Keydown has already resized; read the DOM after layout.
      requestAnimationFrame(() => persist());
    };
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("keyup", onKeyUp);
    return () => {
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("keyup", onKeyUp);
    };
  }, [persist]);

  // Double-click a handle → that pane back to its default width. Imperative
  // resize doesn't go through pointerup, so persist the DOM width next frame.
  const resetPane = (panel: PanelImperativeHandle | null, px: number) => {
    if (!panel) return;
    panel.resize(`${px}px`);
    requestAnimationFrame(() => persist());
  };

  return (
    <ResizablePanelGroup id="editor-panes" orientation="horizontal" elementRef={groupEl}>
      <ResizablePanel
        id="layers"
        panelRef={layersRef}
        elementRef={layersEl}
        defaultSize={initialOpen.current ? `${saved.current.layers}px` : 0}
        minSize={`${LAYERS.min}px`}
        maxSize={`${LAYERS.max}px`}
        collapsible
        collapsedSize={0}
        groupResizeBehavior="preserve-pixel-size"
        onResize={onLayersResize}
      >
        {isSidebarOpen ? layers : null}
      </ResizablePanel>
      <ResizableHandle
        aria-label="ปรับขนาดแผง"
        className={HANDLE}
        disableDoubleClick
        onDoubleClick={() => resetPane(layersRef.current, LAYERS.def)}
      />
      <ResizablePanel id="canvas" minSize={`${CANVAS_MIN}px`}>
        {canvas}
      </ResizablePanel>
      <ResizableHandle
        aria-label="ปรับขนาดแผง"
        className={HANDLE}
        disableDoubleClick
        onDoubleClick={() => resetPane(styleRef.current, STYLE.def)}
      />
      <ResizablePanel
        id="style"
        panelRef={styleRef}
        elementRef={styleEl}
        defaultSize={`${saved.current.style}px`}
        minSize={`${STYLE.min}px`}
        maxSize={`${STYLE.max}px`}
        groupResizeBehavior="preserve-pixel-size"
      >
        {style}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
