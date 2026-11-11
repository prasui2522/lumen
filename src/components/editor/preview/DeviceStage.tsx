import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { cn } from "@/lib/utils";
import { parsePageMarker, resolvePageMarker } from "@/lib/preview-links";
import { ensurePages, openPageIdOf, switchToPage } from "@/lib/project-pages";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectsStore } from "@/stores/projects-store";
import {
  deviceById,
  effectiveSize,
  type DeviceId,
  type DevicePreset,
  type Size,
} from "@/lib/devices";
import { usePreviewDeviceStore, usePreviewScale } from "@/stores/preview-device-store";
import { PreviewSelection, type NodeBox } from "@/components/editor/preview/PreviewSelection";
import { Tier1Frame } from "@/components/editor/preview/Tier1Frame";
import { ViteFrame } from "@/components/editor/preview/ViteFrame";
import { nextFillHeight, type RuntimePayload } from "@/lib/preview-runtime";
import { findPageForHref } from "@/lib/link-target";

/**
 * What a frame shows: last-good static HTML (`srcdoc`, snapshots only after S10),
 * the S2 Tier 1 runtime payload, or the S6 Vite sidecar.
 */
export type FrameSource =
  | { kind: "srcdoc"; html: string }
  | {
      kind: "runtime";
      payload: RuntimePayload;
      /** Route of the editor's open page. */
      path: string;
      pageName: string;
      onTimeout: () => void;
    }
  | {
      kind: "vite";
      url: string;
      port: number;
      path: string;
      pageName: string;
    };

/** Same minimum as the Design canvas card (min-h-[480px]); `fill` only. */
const MIN_FRAME_PX = 480;
/** Stage padding (p-6) on both sides. */
const STAGE_PAD = 48;
/** Label line (16 px) + gap-2 under each device frame. */
const LABEL_H = 24;
/** gap-6 between frames in multi-view. */
const MULTI_GAP = 24;
/** Handheld bezel padding (p-2) on each side. */
const BEZEL = 8;
/** Extra px under the measured page in `fill` (the frame used to end 16 px short). */
const FILL_SLACK = 8;
/** Measuring style injected into the fill frame's document (never into srcDoc/export). */
const FILL_STYLE_ID = "wb-fill-measure";
/**
 * Safety net after a Preview page switch: if no new srcDoc has replaced the
 * blank marker page by then (compile failed or was dropped), put the current
 * HTML back so the frame is never left blank.
 */
const MARKER_RESTORE_MS = 1500;

/** The frame's URL, or "" when it cannot be read. */
function frameHref(f: HTMLIFrameElement): string {
  try {
    return f.contentWindow?.location.href ?? "";
  } catch {
    return "";
  }
}

/**
 * Open the page a Preview marker URL points to (PHASE-9-SPEC §6). Same path
 * as PagesPanel.switchPage: switchToPage + setOpenPageId + clear selection
 * and inline edit + restoreDocument → no undo step, no dirty change. Mode,
 * device, zoom and orientation are untouched. Returns the page name, or null
 * (not a page, missing, or already open).
 */
function openPageFromMarker(href: string): string | null {
  const doc = useProjectsStore.getState().openDocument;
  if (!doc) return null;
  const withPages = ensurePages(doc);
  const ed = useEditorStore.getState();
  const current = ed.openPageId ?? openPageIdOf(withPages);
  const page = resolvePageMarker(href, withPages.pages!, current);
  if (!page) return null;
  const next = switchToPage(withPages, page.id);
  if (!next) return null;
  ed.setOpenPageId(page.id);
  ed.setSelectedNodeId(null);
  ed.setEditingNodeId(null);
  useProjectsStore.getState().restoreDocument(next);
  return page.name;
}

/**
 * S2: the Tier 1 frame's router moved to `path` (a page link inside the page).
 * Same page-switch path as the marker flow; the frame already shows the page,
 * so no recompile is needed — the editor just follows. Returns the page name
 * or null (unknown path / already open).
 */
function openPageFromRoute(path: string): string | null {
  const doc = useProjectsStore.getState().openDocument;
  if (!doc) return null;
  const withPages = ensurePages(doc);
  const ed = useEditorStore.getState();
  const current = ed.openPageId ?? openPageIdOf(withPages);
  const page = findPageForHref(path, withPages.pages!);
  if (!page || page.id === current) return null;
  const next = switchToPage(withPages, page.id);
  if (!next) return null;
  ed.setOpenPageId(page.id);
  ed.setSelectedNodeId(null);
  ed.setEditingNodeId(null);
  useProjectsStore.getState().restoreDocument(next);
  return page.name;
}

type Frame = {
  /** React key: "single" in single view (never the device id, so a device switch keeps the iframe). */
  key: string;
  dev: DevicePreset;
  size: Size | null;
  /** Layout box of the bezel wrapper at scale 1. */
  outer: Size;
};

function outerOf(dev: DevicePreset, size: Size | null): Size {
  if (!size) return { w: 0, h: 0 };
  const pad = dev.handheld ? BEZEL * 2 : 0;
  return { w: size.w + pad, h: size.h + pad };
}

/**
 * Device stage (DEVICE-PREVIEW-SPEC §4/§6). Only resizes/scales frames: it
 * never recompiles and never changes `srcDoc` or the iframe's key, so a
 * device, rotate, zoom or custom-size change does not reparse the page.
 */
export function DeviceStage({ source }: { source: FrameSource }) {
  const html = source.kind === "srcdoc" ? source.html : "";
  const preset = usePreviewDeviceStore((s) => s.preset);
  const landscape = usePreviewDeviceStore((s) => s.landscape);
  const customW = usePreviewDeviceStore((s) => s.custom.w);
  const customH = usePreviewDeviceStore((s) => s.custom.h);
  const zoom = usePreviewDeviceStore((s) => s.zoom);
  const hinge = usePreviewDeviceStore((s) => s.hinge);
  const multi = usePreviewDeviceStore((s) => s.multi);
  const multiSet = usePreviewDeviceStore((s) => s.multiSet);

  const fill = !multi && preset === "fill";

  const frames: Frame[] = useMemo(() => {
    const custom = { w: customW, h: customH };
    const ids: DeviceId[] = multi ? multiSet : [preset];
    return ids.map((id) => {
      const dev = deviceById(id);
      const size = effectiveSize(id, landscape, custom);
      return { key: multi ? id : "single", dev, size, outer: outerOf(dev, size) };
    });
  }, [multi, multiSet, preset, landscape, customW, customH]);

  /* ---- Scale-to-fit (§4.3): one ResizeObserver on the stage, rAF-coalesced ---- */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const framesRef = useRef(frames);
  framesRef.current = frames;

  /** Latest fill measure (defined below; read by the stage ResizeObserver). */
  const measureRef = useRef<() => void>(() => {});
  const computeScale = useCallback(() => {
    const el = stageRef.current;
    const fs = framesRef.current;
    let s = 1;
    const isFill = fs.length === 1 && fs[0].size === null;
    if (el && !isFill && zoom === "fit") {
      const availW = el.clientWidth - STAGE_PAD;
      const availH = el.clientHeight - STAGE_PAD - LABEL_H;
      const sumW = fs.reduce((a, f) => a + f.outer.w, 0) + MULTI_GAP * (fs.length - 1);
      const maxH = Math.max(...fs.map((f) => f.outer.h));
      const raw = Math.min(1, availW / sumW, availH / maxH);
      s = Math.max(fs.length > 1 ? 0.2 : 0.25, raw);
    }
    if (Math.abs(s - scaleRef.current) > 0.005 || (s === 1 && scaleRef.current !== 1)) {
      scaleRef.current = s;
      setScale(s);
    }
    usePreviewScale.setState({ scale: scaleRef.current });
  }, [zoom]);

  useLayoutEffect(() => {
    computeScale();
  }, [computeScale, frames]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        computeScale();
        // fill: width reflows text and height is the vh reference → re-measure.
        if (fillRef.current) measureRef.current();
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [computeScale]);

  /* ---- `fill` auto-height (D1: no cap, no vh feedback loop, no double scroll) ---- */
  const fillFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [fillH, setFillH] = useState(MIN_FRAME_PX);
  const fillRef = useRef(fill);
  fillRef.current = fill;

  /**
   * Measure the page for `fill` in one task (nothing paints between):
   * 1. Hold the frame at the stage's content height, so `vh` resolves to a
   *    stable reference (collapsing to 0 made 100vh heroes feed back).
   * 2. With `html{height:auto}` injected (DOM only — srcDoc is untouched, so
   *    nothing reparses), read the document's real height; + a few px slack.
   * 3. Apply it and check once: if the page grew with the frame (viewport-
   *    height content), keep the frame at the stage height instead, so the
   *    page scrolls inside the frame only (no double scroll).
   * Never runs for device presets (their height is the device height, §4.2).
   */
  const measure = useCallback(() => {
    if (!fillRef.current) return;
    const f = fillFrameRef.current;
    const stage = stageRef.current;
    const d = f?.contentDocument;
    const root = d?.documentElement;
    if (!f || !stage || !d || !root) return;
    if (!d.getElementById(FILL_STYLE_ID)) {
      const st = d.createElement("style");
      st.id = FILL_STYLE_ID;
      st.textContent = "html{height:auto!important}";
      (d.head ?? root).appendChild(st);
    }
    const base = Math.max(MIN_FRAME_PX, stage.clientHeight - STAGE_PAD);
    f.style.height = `${base}px`;
    const overflow = root.scrollHeight;
    const content = Math.ceil(
      overflow > base + 1 ? overflow : root.getBoundingClientRect().height,
    );
    let h = content <= base ? Math.max(MIN_FRAME_PX, Math.min(base, content + FILL_SLACK)) : content + FILL_SLACK;
    f.style.height = `${h}px`;
    if (h > base && root.scrollHeight > h + FILL_SLACK) {
      // Content scales with the viewport (e.g. min-height:100vh hero).
      h = base;
      f.style.height = `${h}px`;
    }
    setFillH(h);
  }, []);
  measureRef.current = measure;

  /* ---- Preview page links (PHASE-9-SPEC §6, marker approach) ---- */
  const htmlRef = useRef(html);
  htmlRef.current = html;
  /** Frame that opened a page and waits for its next srcdoc load (focus target). */
  const switching = useRef<HTMLIFrameElement | null>(null);
  const restoreTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(restoreTimer.current), []);

  /**
   * Every frame load (single and multi-view). A page link in the sandboxed,
   * script-free frame is `about:blank#wb-page=…`; following it (click, Enter,
   * modified or middle click alike) loads that blank page in the same frame.
   * Marker load → open the page; the recompile then swaps in the new srcDoc.
   * Any other load (initial srcdoc, recompile, restore) is the page itself:
   * measure `fill`, and focus the frame that just switched. Re-setting
   * `srcdoc` loads `about:srcdoc`, which is not a marker, so nothing loops.
   */
  const onFrameLoad = useCallback(
    (e: SyntheticEvent<HTMLIFrameElement>, isFill: boolean) => {
      const f = e.currentTarget;
      const href = frameHref(f);
      if (parsePageMarker(href) === null) {
        if (isFill) measure();
        if (switching.current === f) {
          switching.current = null;
          window.clearTimeout(restoreTimer.current);
          // Next Tab reaches the first focusable item of the new page.
          f.focus();
        }
        return;
      }
      const restore = () => f.setAttribute("srcdoc", htmlRef.current);
      const name = openPageFromMarker(href);
      if (name === null) {
        // Current or missing page (stale HTML): back to the page as it was.
        restore();
        return;
      }
      useEditorStore.getState().announce(`เปิดหน้า ${name}`);
      switching.current = f;
      window.clearTimeout(restoreTimer.current);
      restoreTimer.current = window.setTimeout(() => {
        if (f.isConnected && parsePageMarker(frameHref(f)) !== null) restore();
      }, MARKER_RESTORE_MS);
    },
    [measure],
  );

  // Entering fill → measure; leaving fill → drop the measuring style so device
  // frames render the page exactly as compiled.
  useLayoutEffect(() => {
    if (source.kind !== "srcdoc") return;
    if (fill) {
      measure();
      return;
    }
    fillFrameRef.current?.contentDocument?.getElementById(FILL_STYLE_ID)?.remove();
  }, [fill, measure, source.kind]);

  /* ---- S2 Tier 1 frame callbacks (opaque origin: height + route arrive by message) ---- */
  const fillHRef = useRef(fillH);
  fillHRef.current = fillH;
  const onRuntimeHeight = useCallback((reported: number) => {
    if (!fillRef.current) return;
    const stage = stageRef.current;
    const base = Math.max(MIN_FRAME_PX, (stage?.clientHeight ?? 0) - STAGE_PAD);
    const h = nextFillHeight(reported, fillHRef.current, base, MIN_FRAME_PX, FILL_SLACK);
    if (h !== fillHRef.current) setFillH(h);
  }, []);
  const onRuntimeRoute = useCallback((path: string) => {
    const name = openPageFromRoute(path);
    if (name !== null) useEditorStore.getState().announce(`เปิดหน้า ${name}`);
  }, []);
  const onRuntimeExternal = useCallback((href: string) => {
    useEditorStore.getState().announce(`ลิงก์ภายนอก ${href} ไม่เปิดในตัวอย่าง`);
  }, []);

  const onRuntimeSelect = useCallback((id: string | null) => {
    useEditorStore.getState().setSelectedNodeId(id);
  }, []);

  /* ---- Multi-view: unmount frames scrolled out of view (§6) ---- */
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const sizerEls = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (!multi || typeof IntersectionObserver === "undefined") {
      setHidden((h) => (Object.keys(h).length ? {} : h));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        setHidden((prev) => {
          let next = prev;
          for (const e of entries) {
            const k = (e.target as HTMLElement).dataset.frameKey ?? "";
            const off = !e.isIntersecting;
            if (!!prev[k] !== off) {
              if (next === prev) next = { ...prev };
              next[k] = off;
            }
          }
          return next;
        });
      },
      { root: stageRef.current, rootMargin: "200px" },
    );
    sizerEls.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [multi, frames]);

  const pct = Math.round(scale * 100);
  const [boxesByFrame, setBoxesByFrame] = useState<Record<string, NodeBox[]>>({});
  const rememberBoxes = (key: string, boxes: NodeBox[]) => {
    setBoxesByFrame((prev) => (prev[key] === boxes ? prev : { ...prev, [key]: boxes }));
  };

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 overflow-auto scrollbar-thin bg-muted/40 p-6"
    >
      <div className={fill ? "w-full" : "mx-auto flex w-max items-start gap-6"}>
        {frames.map((f) => {
          const size = f.size;
          const { w: ow, h: oh } = f.outer;
          const showHinge = !!size && f.dev.foldable && hinge;
          const visible = !multi || !hidden[f.key];
          return (
            <div key={f.key} className={fill ? "w-full" : "flex shrink-0 flex-col items-center gap-2"}>
              <div
                data-frame-key={f.key}
                ref={(el) => {
                  if (el) sizerEls.current.set(f.key, el);
                  else sizerEls.current.delete(f.key);
                }}
                className="relative"
                style={size ? { width: ow * scale, height: oh * scale } : undefined}
              >
                <div
                  className={cn(
                    !size
                      ? "w-full overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                      : f.dev.handheld
                        ? "rounded-[20px] bg-background p-2 shadow-sm ring-1 ring-border"
                        : "overflow-hidden rounded-md bg-background ring-1 ring-border",
                    size && "motion-safe:transition-transform motion-safe:duration-100",
                  )}
                  style={
                    size
                      ? {
                          position: "absolute",
                          left: 0,
                          top: 0,
                          width: ow,
                          height: oh,
                          transform: `scale(${scale})`,
                          transformOrigin: "top left",
                        }
                      : undefined
                  }
                >
                  <div className={cn("relative", size && f.dev.handheld && "overflow-hidden rounded-[12px]")}>
                    {visible && source.kind === "runtime" ? (
                      <Tier1Frame
                        payload={source.payload}
                        path={source.path}
                        title={`ตัวอย่างหน้า ${source.pageName}`}
                        frameRef={f.key === "single" ? (el) => (fillFrameRef.current = el) : undefined}
                        onHeight={f.key === "single" ? onRuntimeHeight : undefined}
                        onRoute={onRuntimeRoute}
                        onExternal={onRuntimeExternal}
                        onSelect={onRuntimeSelect}
                        onBoxes={(boxes) => rememberBoxes(f.key, boxes)}
                        onTimeout={source.onTimeout}
                        style={size ? { width: size.w, height: size.h } : { width: "100%", height: fillH }}
                        className="block border-0 bg-white"
                      />
                    ) : visible && source.kind === "vite" ? (
                      <ViteFrame
                        url={source.url}
                        port={source.port}
                        title={`ตัวอย่างหน้า ${source.pageName}`}
                        frameRef={f.key === "single" ? (el) => (fillFrameRef.current = el) : undefined}
                        onHeight={f.key === "single" ? onRuntimeHeight : undefined}
                        onRoute={onRuntimeRoute}
                        onExternal={onRuntimeExternal}
                        onSelect={onRuntimeSelect}
                        onBoxes={(boxes) => rememberBoxes(f.key, boxes)}
                        style={size ? { width: size.w, height: size.h } : { width: "100%", height: fillH }}
                        className="block border-0 bg-white"
                      />
                    ) : visible ? (
                      <iframe
                        ref={f.key === "single" ? fillFrameRef : undefined}
                        title="ตัวอย่างหน้าเว็บ"
                        // No allow-scripts: same-origin only lets the parent measure height.
                        sandbox="allow-same-origin"
                        srcDoc={html}
                        referrerPolicy="no-referrer"
                        onLoad={(e) => onFrameLoad(e, f.key === "single")}
                        style={size ? { width: size.w, height: size.h } : { width: "100%", height: fillH }}
                        className="block border-0 bg-white"
                      />
                    ) : (
                      <div
                        style={size ? { width: size.w, height: size.h } : undefined}
                        className="flex items-center justify-center bg-muted text-sm text-muted-foreground"
                      >
                        {f.dev.label}
                      </div>
                    )}
                    {visible && (source.kind === "runtime" || source.kind === "vite") ? (
                      <PreviewSelection boxes={boxesByFrame[f.key] ?? []} scale={scale} />
                    ) : null}
                    {showHinge && size ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute bg-foreground/15 outline outline-1 outline-foreground/30"
                        style={
                          landscape && f.dev.rotatable
                            ? { left: 0, right: 0, top: size.h / 2 - 1, height: 2 }
                            : { top: 0, bottom: 0, left: size.w / 2 - 1, width: 2 }
                        }
                      />
                    ) : null}
                  </div>
                </div>
              </div>
              {size ? (
                <p className="text-[11px] leading-4 text-muted-foreground tabular-nums">
                  {f.dev.label} · {size.w} × {size.h}
                  {multi ? "" : ` · ${pct}%`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
