import {
  cloneElement,
  createElement,
  isValidElement,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Node, NodeStateName, PageDocument, StyleProps } from "@/schema";
import { useProjectsStore } from "@/stores/projects-store";
import {
  DEFAULT_CONTAINER_PROPS,
  DEFAULT_IMAGE_OBJECT_FIT,
  getChildren,
  isContainerType,
  isVisible,
  resolvedStyle,
} from "@/schema";
import { cn } from "@/lib/utils";
import { setDragPayload } from "@/lib/drag-session";
import { isContentLocked, nodeText, textPropKey } from "@/lib/document-ops";
import {
  mergeForceState,
  shouldForceDisplayState,
} from "@/lib/force-state";
import { Phase6bView } from "@/components/editor/phase6b-view";
import { A2LeafView } from "@/components/editor/a2-view";
import { CheckboxView, SwitchView } from "@/components/editor/a3-view";
import { IconView, ListView, TableView } from "@/components/editor/a4-view";
import { CalendarView, CarouselView, ChartView } from "@/components/editor/a5-view";
import { FILL_SLOT, a2Layout, groupSlots, mergeOver, ratioCss, redirectFocusToCanvasScopeDeferred, scrollAreaName, canvasScrollOverflow, slotStyle } from "@/lib/a2-looks";
import { fieldLayout } from "@/lib/a3-looks";
import { nameAttr } from "@/lib/kind-looks";
import { styleToCss } from "@/lib/style-css";

export { styleToCss };

/**
 * PageDocument → DOM render for the Design canvas. Preview no longer uses it:
 * since Phase 3a, Preview is the Rust compiler's HTML (src-tauri/src/compiler.rs,
 * which mirrors this CSS mapping) in a sandboxed iframe. `editable: false`
 * still renders without selection/drag chrome.
 */

export type NodeViewContext = {
  document: PageDocument;
  editable: boolean;
  selectedNodeId?: string | null;
  /** Resolved drop slot: parent gets outlined, insert line drawn at index. */
  dropIndicator?: { parentId: string; index: number } | null;
  /** Hide the root's empty-drop hint (Design shows its own seed overlay). */
  suppressRootEmptyHint?: boolean;
  /**
   * B7.3: force-display this state on the selected node only (Style panel switcher).
   * `null` / omitted = ปกติ. Canvas never reacts to real hover.
   */
  forceDisplayState?: NodeStateName | null;
  onSelect?: (nodeId: string) => void;
  onDragStart?: (nodeId: string, e: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOverNode?: (nodeId: string, e: DragEvent) => void;
  onDropOnNode?: (nodeId: string, e: DragEvent) => void;
  /** Inline plain-text editing (Design only). */
  editingNodeId?: string | null;
  onStartEdit?: (nodeId: string) => void;
  /** `refocus`: Esc/Enter commit → return focus to the canvas. */
  onCommitEdit?: (nodeId: string, text: string, refocus: boolean) => void;
};

/** styleToCss + B7.3 `transition:none` when this node is force-displaying a state. */
function canvasStyleToCss(
  ctx: NodeViewContext,
  node: Node,
  style: StyleProps,
  extra?: CSSProperties,
): CSSProperties {
  if (shouldForceDisplayState(ctx.selectedNodeId, node.id, ctx.forceDisplayState)) {
    return styleToCss(style, { transition: "none", ...extra });
  }
  return styleToCss(style, extra);
}

const DRAG_MIME = "application/x-webapp-node-id";

export function getDraggedNodeId(e: DragEvent): string | null {
  return (
    e.dataTransfer.getData(DRAG_MIME) ||
    e.dataTransfer.getData("text/plain") ||
    null
  );
}

function chromeClass(
  ctx: NodeViewContext,
  node: Node,
): string | undefined {
  if (!ctx.editable) return undefined;
  const selected = ctx.selectedNodeId === node.id;
  const drop = ctx.dropIndicator?.parentId === node.id;
  return cn(
    "outline-offset-[-1px]",
    selected && "outline outline-2 outline-sky-500",
    drop && !selected && "outline outline-2 outline-dashed outline-sky-400",
    drop && selected && "outline outline-2 outline-dashed outline-sky-600",
  );
}

function bindInteractive(
  ctx: NodeViewContext,
  node: Node,
): {
  className?: string;
  draggable?: boolean;
  onClick?: (e: MouseEvent) => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  onDoubleClick?: (e: MouseEvent) => void;
  "data-node-id"?: string;
} {
  if (!ctx.editable) {
    return { "data-node-id": node.id };
  }

  // No dragging while any inline edit is open (lets text selection work).
  const contentLocked = isContentLocked(ctx.document, node);
  const canDrag =
    node.id !== ctx.document.root && !contentLocked && !ctx.editingNodeId;
  const canEdit = !!textPropKey(node) && !contentLocked;

  return {
    "data-node-id": node.id,
    className: cn(
      chromeClass(ctx, node),
      node.style.borderEffect === "led" && "wb-led",
      node.style.backdropFilter?.blur ? "wb-glass" : undefined,
    ),
    draggable: canDrag,
    onClick: (e) => {
      e.stopPropagation();
      ctx.onSelect?.(node.id);
    },
    onDoubleClick: canEdit
      ? (e) => {
          e.stopPropagation();
          ctx.onSelect?.(node.id);
          ctx.onStartEdit?.(node.id);
        }
      : undefined,
    onDragStart: canDrag
      ? (e) => {
          e.stopPropagation();
          e.dataTransfer.setData(DRAG_MIME, node.id);
          e.dataTransfer.setData("text/plain", node.id);
          e.dataTransfer.effectAllowed = "move";
          setDragPayload({ kind: "move", nodeId: node.id });
          ctx.onDragStart?.(node.id, e);
        }
      : undefined,
    onDragEnd: () => {
      setDragPayload(null);
      ctx.onDragEnd?.();
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.onDragOverNode?.(node.id, e);
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.onDropOnNode?.(node.id, e);
    },
  };
}

function InsertLine({ vertical }: { vertical: boolean }) {
  // Zero-size in flow; the visible bar is absolutely positioned.
  return (
    <div
      aria-hidden
      data-insert-line
      className={cn(
        "pointer-events-none relative shrink-0",
        vertical ? "w-0 self-stretch" : "h-0",
      )}
    >
      <div
        className={cn(
          "absolute bg-sky-500",
          vertical ? "inset-y-0 -left-px w-0.5" : "inset-x-0 -top-px h-0.5",
        )}
      />
    </div>
  );
}

function renderChildren(
  ctx: NodeViewContext,
  node: Node,
  vertical = false,
  slots?: (id: string) => string | undefined,
): ReactNode {
  const kids = getChildren(node);
  const ind =
    ctx.editable && ctx.dropIndicator?.parentId === node.id
      ? ctx.dropIndicator.index
      : -1;
  const out: ReactNode[] = [];
  kids.forEach((id, i) => {
    if (i === ind) out.push(<InsertLine key="__insert" vertical={vertical} />);
    out.push(<NodeView key={id} ctx={ctx} nodeId={id} slot={slots?.(id)} inRow={vertical} />);
  });
  if (ind === kids.length && kids.length > 0) {
    out.push(<InsertLine key="__insert" vertical={vertical} />);
  }
  return out;
}

function showEmptyHint(ctx: NodeViewContext, node: Node): boolean {
  if (!ctx.editable || getChildren(node).length > 0) return false;
  if (node.id === ctx.document.root && ctx.suppressRootEmptyHint) return false;
  return true;
}

type NodeViewProps = {
  ctx: NodeViewContext;
  nodeId: string;
  /** Phase 11 A2.3: how the parent shapes this child ("fill" in an aspectRatio, "g:<dir>:<pos>" in a buttonGroup). */
  slot?: string;
  /** Parent lays children out in a row. A kind-default width of 100% would crush siblings. */
  inRow?: boolean;
};

/** A slot's inline override goes last on the child's root (its own look stays, like the export's cascade). */
/** A2.5.1 (fix 2): the buttonGroup corner longhands of a slot override (a bare input draws its own border / radius). */
function cornersOnly(over: CSSProperties | undefined): CSSProperties | undefined {
  if (!over) return undefined;
  const o = Object.fromEntries(Object.entries(over).filter(([k]) => /^border((Top|Bottom)(Left|Right))?Radius$/.test(k)));
  return Object.keys(o).length ? (o as CSSProperties) : undefined;
}

function withOver(el: ReactNode, over: CSSProperties | undefined): ReactNode {
  if (!over || !isValidElement(el)) return el;
  const props = el.props as { style?: CSSProperties };
  if (typeof el.type === "string") {
    return cloneElement(el as React.ReactElement<{ style?: CSSProperties }>, { style: mergeOver(props.style ?? {}, over) });
  }
  return cloneElement(el as React.ReactElement<{ over?: CSSProperties }>, { over });
}

/** Recursive node renderer — Design (editable) and Preview (read-only). */
export const NodeView = memo(function NodeView({ ctx, nodeId, slot, inRow }: NodeViewProps) {
  const node = ctx.document.nodes[nodeId];
  if (!node || !isVisible(node)) return null;

  let style = resolvedStyle(node);
  // Kind default `width: 100%` on a row sibling takes the whole row, so the
  // other child (for example a copyright line) wraps and paints over the links.
  // An explicit width stays.
  if (inRow && node.type === "container" && node.style.width === undefined && style.width !== undefined) {
    style = { ...style, width: "auto" };
  }
  // A spacer's height is `props.size`, not a style key, so it counts as an own height: inside an aspectRatio it keeps its
  // size like the export does (A2.5 F3); its width still fills.
  const ownH = node.style.height !== undefined || node.props.type === "spacer";
  let over = slotStyle(slot, style.borderRadius ?? 0, node.style.width !== undefined, ownH);
  // B7.3: selected node only — merge `states.<name>` paint keys; `transition:none` via over (covers leaf views too).
  if (shouldForceDisplayState(ctx.selectedNodeId, node.id, ctx.forceDisplayState)) {
    style = mergeForceState(style, node.states, ctx.forceDisplayState);
    over = mergeOver(over ?? {}, { transition: "none" });
  }
  return withOver(renderNode(ctx, node, style, over), over);
});

function renderNode(ctx: NodeViewContext, node: Node, style: StyleProps, over: CSSProperties | undefined): ReactNode {

  if (ctx.editable && ctx.editingNodeId === node.id && textPropKey(node)) {
    return (
      <InlineEditor
        node={node}
        style={canvasStyleToCss(ctx, node, style, {
          cursor: "text",
          whiteSpace: "pre-wrap",
          minWidth: "1ch",
          ...(node.type === "link" ? { textDecoration: "underline" } : {}),
        })}
        onDone={(text, refocus) => ctx.onCommitEdit?.(node.id, text, refocus)}
      />
    );
  }

  const interactive = bindInteractive(ctx, node);
  const { className: chrome, ...handlers } = interactive;

  switch (node.props.type) {
    case "page":
    case "section": {
      const Tag = node.props.type === "page" ? "div" : "section";
      return (
        <Tag
          {...handlers}
          data-node-type={node.type}
          className={cn(chrome, "relative min-h-[1rem]")}
          style={canvasStyleToCss(ctx, node, style)}
        >
          {renderChildren(ctx, node)}
          {isContainerType(node.type) && showEmptyHint(ctx, node) ? (
            <EmptyDropHint />
          ) : null}
        </Tag>
      );
    }
    case "container": {
      const p = node.props;
      const direction = p.direction ?? DEFAULT_CONTAINER_PROPS.direction;
      const gap = p.gap ?? DEFAULT_CONTAINER_PROPS.gap;
      const align = p.align ?? DEFAULT_CONTAINER_PROPS.align;
      const justify = p.justify ?? DEFAULT_CONTAINER_PROPS.justify;
      const justifyMap = {
        start: "flex-start",
        center: "center",
        end: "flex-end",
        between: "space-between",
      } as const;
      const alignMap = {
        start: "flex-start",
        center: "center",
        end: "flex-end",
        stretch: "stretch",
      } as const;
      return (
        <div
          {...handlers}
          data-node-type="container"
          className={cn(chrome, "relative min-h-[1rem]")}
          style={canvasStyleToCss(ctx, node, style, {
            display: "flex",
            flexDirection: direction === "row" ? "row" : "column",
            gap: `${gap}px`,
            alignItems: alignMap[align],
            justifyContent: justifyMap[justify],
          })}
        >
          {renderChildren(ctx, node, direction === "row")}
          {showEmptyHint(ctx, node) ? <EmptyDropHint /> : null}
        </div>
      );
    }
    case "heading": {
      const level = node.props.level;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag
          {...handlers}
          data-node-type="heading"
          className={chrome}
          style={canvasStyleToCss(ctx, node, style)}
        >
          {node.props.content}
        </Tag>
      );
    }
    case "text":
      return (
        <p
          {...handlers}
          data-node-type="text"
          className={chrome}
          style={canvasStyleToCss(ctx, node, style)}
        >
          {node.props.content}
        </p>
      );
    case "image":
      return (
        <CanvasImage
          node={node}
          handlers={handlers}
          chrome={chrome}
          style={style}
          over={over}
        />
      );
    case "button":
      return (
        <span
          {...handlers}
          data-node-type="button"
          className={chrome}
          style={canvasStyleToCss(ctx, node, style, {
            cursor: ctx.editable ? "grab" : "default",
          })}
        >
          {node.props.label}
        </span>
      );
    case "link":
      return (
        <span
          {...handlers}
          data-node-type="link"
          className={chrome}
          style={canvasStyleToCss(ctx, node, style, {
            textDecoration: "underline",
            cursor: ctx.editable ? "grab" : "default",
          })}
        >
          {node.props.label}
        </span>
      );
    case "spacer":
      return (
        <div
          {...handlers}
          data-node-type="spacer"
          className={cn(chrome, ctx.editable && "bg-muted/50")}
          style={canvasStyleToCss(ctx, node, style, {
            height: `${node.props.size}px`,
            width: "100%",
          })}
          aria-hidden
        />
      );
    case "input": {
      // A2.5 (F5). Without a label the export has a BARE `<input>` (it is the flex item of a buttonGroup row, 100 % wide
      // before it shrinks); with a label the `<label>` is the item and shrinks to fit. The canvas wraps both in a div, so
      // a label-less wrapper must take the input's own width and the input then fills it, or a group row differs.
      const css = canvasStyleToCss(ctx, node, style);
      const bare = !node.props.label;
      return (
        <div {...handlers} data-node-type="input" className={chrome} style={bare ? { width: css.width } : undefined}>
          {node.props.label ? <span style={{ display: "block" }}>{node.props.label}</span> : null}
          <input
            type="text"
            readOnly
            tabIndex={-1}
            placeholder={node.props.placeholder}
            value=""
            onChange={() => {}}
            style={bare ? mergeOver({ ...css, width: "100%", pointerEvents: "none" }, cornersOnly(over)) : { ...css, pointerEvents: "none" }}
          />
        </div>
      );
    }
    case "switch":
      // PHASE-11 A3.2: track + thumb from the shared a3 look (a3-view.tsx)
      return <SwitchView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
    case "field": {
      // PHASE-11 A3.3: labelled form row. Canvas never uses a real <label for> (inert);
      // unpaired look uses span.t-field-label; shared a3 CSS styles label / desc / error.
      const p = node.props;
      if (p.type !== "field") return null;
      const kids = getChildren(node);
      const layout = fieldLayout(p);
      const vertical = layout.flexDirection === "row";
      return (
        <div
          {...handlers}
          data-node-type="field"
          className={cn("t-field", chrome, "relative", kids.length === 0 && "min-h-[1rem]")}
          style={canvasStyleToCss(ctx, node, style, layout)}
        >
          {p.label.trim() ? <span className="t-field-label">{p.label}</span> : null}
          {renderChildren(ctx, node, vertical)}
          {p.description?.trim() ? <p className="t-field-d">{p.description}</p> : null}
          {p.error?.trim() ? <p className="t-field-e">{p.error}</p> : null}
          {showEmptyHint(ctx, node) ? <EmptyDropHint /> : null}
        </div>
      );
    }
    case "card":
    case "alert":
    case "aspectRatio":
    case "buttonGroup":
    case "scrollArea": {
      const p = node.props;
      const t = p.type;
      const layout = a2Layout(t, p);
      const vertical = layout.flexDirection === "row";
      const extra: CSSProperties =
        p.type === "aspectRatio"
          ? { ...layout, aspectRatio: ratioCss(p.ratio) }
          : p.type === "scrollArea"
            ? layout
            : layout;
      // scrollArea: two longhands, never the shorthand (fix 1: React drops longhands that conflict with `overflow`).
      const containerCss: CSSProperties = canvasStyleToCss(ctx, node, style, extra);
      if (p.type === "scrollArea") {
        delete containerCss.overflow;
        Object.assign(containerCss, canvasScrollOverflow(p.orientation, style.overflow));
      }
      const kids = getChildren(node);
      const slots =
        t === "aspectRatio"
          ? () => FILL_SLOT
          : t === "buttonGroup"
            ? (() => {
                const m = groupSlots(ctx.document.nodes, kids, vertical ? "row" : "column");
                return (id: string) => m[id];
              })()
            : undefined;
      // scrollArea: the export has tabindex=0. The canvas element is tabindex=-1 (Chromium makes a scroller with no
      // tabindex a Tab stop; -1 is never one) and hands a click's focus back to the canvas scope (N1).
      const regionName = p.type === "scrollArea" ? scrollAreaName(p.label, node.name) : undefined;
      const aria =
        t === "alert"
          ? { role: "note" }
          : t === "buttonGroup"
            ? { role: "group", ...nameAttr(node.name) }
            : regionName !== undefined
              ? { role: "region", "aria-label": regionName }
              : {};
      return (
        <div
          {...handlers}
          {...aria}
          data-node-type={t}
          {...(t === "scrollArea" ? { tabIndex: -1, onFocus: redirectFocusToCanvasScopeDeferred } : {})}
          // Only an EMPTY container keeps the 1rem editor minimum; with children it must keep the
          // automatic flex minimum like the export, or a fixed-height scrollArea shrinks its children
          // on the canvas but scrolls them in the export.
          className={cn(chrome, "relative", kids.length === 0 && "min-h-[1rem]")}
          style={containerCss}
        >
          {renderChildren(ctx, node, vertical, slots)}
          {showEmptyHint(ctx, node) ? <EmptyDropHint /> : null}
        </div>
      );
    }
    case "carousel":
      return (
        <CarouselView
          node={node}
          handlers={handlers}
          chrome={chrome}
          style={style}
          over={over}
          renderChild={(childId) => <NodeView ctx={ctx} nodeId={childId} />}
          emptyHint={showEmptyHint(ctx, node) ? <EmptyDropHint /> : null}
        />
      );
    case "chart":
      return <ChartView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
    case "calendar":
      return <CalendarView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
    case "separator":
    case "skeleton":
    case "spinner":
    case "badge":
      return <A2LeafView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
    case "checkbox":
      return <CheckboxView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
    case "list":
      return <ListView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
    case "table":
      return <TableView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
    case "icon":
      return <IconView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
    case "command":
    case "contextMenu": {
      const items = node.props.items.length > 0 ? node.props.items : ["รายการ"];
      const note = node.props.type === "command" ? "แบบจัดวาง ไม่กรองขณะพิมพ์" : "แบบจัดวาง ไม่ผูกกับคลิกขวา";
      return (
        <div
          {...handlers}
          data-node-type={node.type}
          className={chrome}
          style={canvasStyleToCss(ctx, node, style)}
        >
          {node.props.type === "command" ? <p>{node.props.placeholder}</p> : null}
          <ul>
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p>{note}</p>
        </div>
      );
    }
    case "toast":
      return (
        <div
          {...handlers}
          data-node-type="toast"
          className={chrome}
          style={canvasStyleToCss(ctx, node, style)}
        >
          <strong>{node.props.title}</strong>
          <p>{node.props.message}</p>
          <p>แบบจัดวาง ไม่เด้งเอง</p>
        </div>
      );
    case "resizable":
      return (
        <div
          {...handlers}
          data-node-type="resizable"
          aria-label="แบ่งขนาด แบบจัดวาง"
          className={cn(chrome, "relative")}
          style={canvasStyleToCss(ctx, node, style, { display: "flex", flexDirection: "row" })}
        >
          {getChildren(node).length === 0 ? (
            <>
              <div style={{ flex: `0 0 ${Math.min(80, Math.max(20, node.props.split))}%`, minHeight: 80, background: "#f1f5f9" }} />
              <div style={{ flex: "1 1 auto", minHeight: 80, background: "#e2e8f0" }} />
            </>
          ) : (
            renderChildren(ctx, node, true)
          )}
        </div>
      );
    default:
      return <Phase6bView node={node} handlers={handlers} chrome={chrome} style={style} over={over} />;
  }
}

function editorTag(node: Node): string {
  const p = node.props;
  if (p.type === "heading") return `h${p.level}`;
  if (p.type === "text") return "p";
  return "span";
}

/**
 * Plain-text inline editor (no rich text). Rendered as a *different*
 * component from the normal node so React remounts cleanly on enter/exit and
 * never reconciles text the browser edited. Esc / Enter / blur commit once.
 */
function InlineEditor({
  node,
  style,
  onDone,
}: {
  node: Node;
  style: CSSProperties;
  onDone: (text: string, refocus: boolean) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = nodeText(node);
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // Mount-only: text is seeded once; the browser owns it while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (refocus: boolean) => {
    if (done.current) return;
    done.current = true;
    // Plain text only; collapse newlines (Enter commits instead).
    const text = (ref.current?.textContent ?? "").replace(/\r?\n/g, " ");
    onDone(text, refocus);
  };

  return createElement(editorTag(node), {
    ref,
    contentEditable: "plaintext-only",
    suppressContentEditableWarning: true,
    spellCheck: false,
    "data-node-id": node.id,
    "data-node-type": node.type,
    "data-editing": "",
    "aria-label": "แก้ไขข้อความ",
    className: "outline outline-2 outline-offset-[-1px] outline-sky-600",
    style,
    onBlur: () => finish(false),
    onKeyDown: (e: React.KeyboardEvent) => {
      // Keep Delete/Backspace/arrows/undo inside the text (native editing).
      e.stopPropagation();
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        finish(true);
      }
    },
    onClick: (e: MouseEvent) => e.stopPropagation(),
    onDoubleClick: (e: MouseEvent) => e.stopPropagation(),
    onDragStart: (e: DragEvent) => e.preventDefault(),
  });
}


function CanvasImage({
  node,
  handlers,
  chrome,
  style,
  over,
}: {
  node: Node;
  handlers: Omit<ReturnType<typeof bindInteractive>, "className">;
  chrome?: string;
  style: StyleProps;
  over?: CSSProperties;
}) {
  const projectId = useProjectsStore((s) => s.openId);
  const fit = node.props.type === "image" ? (node.props.objectFit ?? DEFAULT_IMAGE_OBJECT_FIT) : DEFAULT_IMAGE_OBJECT_FIT;
  const alt = node.props.type === "image" ? (node.props.src.alt ?? "") : "";
  const id = node.props.type === "image" ? node.props.src.id.trim() : "";
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id || !projectId) {
      setSrc(null);
      setMissing(false);
      return;
    }
    let dead = false;
    setSrc(null);
    setMissing(false);
    invoke<string | null>("asset_file_path", { projectId, id })
      .then((path) => {
        if (dead) return;
        if (!path) {
          setMissing(true);
          return;
        }
        try {
          setSrc(convertFileSrc(path));
        } catch {
          setMissing(true);
        }
      })
      .catch(() => {
        if (!dead) setMissing(true);
      });
    return () => {
      dead = true;
    };
  }, [projectId, id]);

  const box = mergeOver(
    styleToCss(style, {
      backgroundColor: "#e2e8f0",
      minHeight: 120,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#64748b",
      fontSize: 14,
      overflow: "hidden",
    }),
    over,
  );
  const label = !id ? alt || "รูปภาพ" : missing ? "ไม่พบรูป" : alt || "รูปภาพ";
  return (
    <div
      {...handlers}
      data-node-type="image"
      role={src ? undefined : "img"}
      aria-label={src ? undefined : label}
      className={chrome}
      style={box}
    >
      {src && !missing ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onError={() => {
            setSrc(null);
            setMissing(true);
          }}
          style={{ width: "100%", height: "100%", objectFit: fit, minHeight: 120, display: "block" }}
        />
      ) : (
        label
      )}
    </div>
  );
}

function EmptyDropHint() {
  return (
    <div className="pointer-events-none flex min-h-16 items-center justify-center border border-dashed border-border/80 px-3 py-4 text-xs text-muted-foreground">
      วางองค์ประกอบที่นี่
    </div>
  );
}

/** True when page root has no visible content children. */
export function isDocumentEmpty(doc: PageDocument): boolean {
  const root = doc.nodes[doc.root];
  if (!root) return true;
  const kids = getChildren(root);
  if (kids.length === 0) return true;
  return kids.every((id) => {
    const n = doc.nodes[id];
    return !n || !isVisible(n);
  });
}
