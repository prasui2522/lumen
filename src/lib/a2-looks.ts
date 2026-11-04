import type { CSSProperties } from "react";
import type { Node, NodeId } from "@/schema";
import { A2_LAYOUT_DEFAULTS, ASPECT_RATIOS, isVisible } from "@/schema";
import looks from "./kind-looks.json";
import { expandTokens, kebabToCamel, type KindLook } from "./kind-looks";

/**
 * Canvas side of the PHASE-11 A2.3 (part 1) shared constants: card, alert, separator,
 * skeleton, spinner, aspectRatio, buttonGroup (part 1), badge and scrollArea (part 2).
 * `kind-looks.json` `a2` is the ONE source: the Rust compiler reads the same section for the
 * Preview / export. Pure: no React runtime, no DOM.
 */

type AspectRatio = (typeof ASPECT_RATIOS)[number];
type RawKind = { extras: string[][]; css: string[] };
type RawA2 = { texts: Record<string, string>; kinds: Record<string, RawKind> };

/** F9: a missing / malformed `a2` section is a hard error (never silently-empty looks). Mirrors `parse_kind_looks_checked`. */
export function a2Section(file: unknown): RawA2 {
  const a2 = (file as { a2?: unknown } | null | undefined)?.a2 as Partial<RawA2> | undefined;
  if (a2 === null || typeof a2 !== "object") throw new Error("kind-looks.json: missing section `a2`");
  if (a2.kinds === null || typeof a2.kinds !== "object") throw new Error("kind-looks.json: missing section `a2.kinds`");
  if (a2.texts === null || typeof a2.texts !== "object") throw new Error("kind-looks.json: missing section `a2.texts`");
  for (const [name, k] of Object.entries(a2.kinds)) {
    if (!Array.isArray(k?.extras) || !Array.isArray(k?.css)) throw new Error(`kind-looks.json: malformed \`a2.kinds\` entry \`${name}\``);
  }
  return a2 as RawA2;
}
const RAW = a2Section(looks);

export const A2_LOOKS: Record<string, KindLook> = Object.fromEntries(
  Object.entries(RAW.kinds).map(([name, k]) => [
    name,
    {
      extras: k.extras.map(([p, v]) => [p, expandTokens(v)] as [string, string]),
      css: k.css.map((r) => expandTokens(r)).join(""),
    },
  ]),
);
export const A2_TEXTS: Record<string, string> = RAW.texts;

/** Descendant rules of the A2 kinds (spinner animation). Injected once into the editor. */
export const A2_STYLESHEET: string = Object.values(A2_LOOKS)
  .map((k) => k.css)
  .filter((c) => c !== "")
  .join("\n");

type Css = Record<string, string | number | undefined>;

/** A kind-look extra is applied only when the node did not set that property (G1). */
export function a2ExtrasStyle(kind: string, base: CSSProperties, explicit: CSSProperties): CSSProperties {
  const out: Css = { ...(base as Css) };
  const ex = explicit as Css;
  for (const [prop, v] of A2_LOOKS[kind]?.extras ?? []) {
    const key = kebabToCamel(prop);
    if (ex[key] === undefined) out[key] = v;
  }
  return out as CSSProperties;
}

export type A2ContainerType = "card" | "alert" | "aspectRatio" | "buttonGroup" | "scrollArea";
export type LayoutLike = {
  direction?: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
};

const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;
const ALIGN = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;

/** Same four declarations as the compiler's `container_layout`, per-kind defaults from `A2_LAYOUT_DEFAULTS`. */
export function a2Layout(type: A2ContainerType, p: LayoutLike): CSSProperties {
  const d = A2_LAYOUT_DEFAULTS[type];
  return {
    display: "flex",
    flexDirection: (p.direction ?? d.direction) === "row" ? "row" : "column",
    gap: `${p.gap ?? d.gap}px`,
    alignItems: ALIGN[p.align ?? d.align],
    justifyContent: JUSTIFY[p.justify ?? d.justify],
  };
}

const RATIO: Record<AspectRatio, string> = { "16/9": "16 / 9", "4/3": "4 / 3", "1/1": "1 / 1", "3/2": "3 / 2", "21/9": "21 / 9" };
/** Exactly the five ratios of `ASPECT_RATIOS` (spec §9 A2), like the Rust `AspectRatioValue`. */
export function isAspectRatio(r: unknown): r is AspectRatio {
  return typeof r === "string" && (ASPECT_RATIOS as readonly string[]).includes(r);
}
/** Mirrors `ratio_css` in compiler.rs. An unknown ratio is REFUSED (F7), as Rust refuses the document; never shown as 16/9. */
export function ratioCss(r: string): string {
  if (!isAspectRatio(r)) throw new RangeError(`unknown aspectRatio ${JSON.stringify(r)}: expected one of ${ASPECT_RATIOS.join(", ")}`);
  return RATIO[r];
}

export type ScrollOrientation = "vertical" | "horizontal" | "both";

/**
 * scrollArea axis rule from `orientation` (mirrors `scroll_axis_decls`): only while the resolved
 * `overflow` is auto / scroll; `vertical` clips the horizontal axis, `horizontal` the vertical one.
 */
export function scrollAxes(o: ScrollOrientation, overflow: string | undefined): CSSProperties {
  if (overflow !== "auto" && overflow !== "scroll") return {};
  if (o === "vertical") return { overflowX: "hidden" };
  if (o === "horizontal") return { overflowY: "hidden" };
  return {};
}

/**
 * A2.5.1 (Designer fix 1): the CANVAS scrollArea's overflow as two longhands, never the shorthand. React cannot
 * mix `overflow` with `overflowX` / `overflowY` across re-renders (it removes the longhands as "conflicting" and the
 * box ends up visible / visible). Same result as the export's shorthand + `scrollAxes` rule.
 */
export function canvasScrollOverflow(o: ScrollOrientation, overflow: string | undefined): { overflowX: string | undefined; overflowY: string | undefined } {
  const axes = scrollAxes(o, overflow) as { overflowX?: string; overflowY?: string };
  return { overflowX: axes.overflowX ?? overflow, overflowY: axes.overflowY ?? overflow };
}

/** Accessible name of a scrollArea: `label`, else the layer name (mirrors the compiler). */
export function scrollAreaName(label: string | undefined, name: string | undefined): string | undefined {
  const l = label?.trim();
  if (l) return l;
  const n = name?.trim();
  return n ? n : undefined;
}

/** Spinner size is 12-64 px; a hand-edited value is clamped (mirrors `spinner_px`). */
export function spinnerPx(size: number): number {
  const n = Number.isFinite(size) ? Math.round(size) : 24;
  return Math.min(64, Math.max(12, n));
}

/** Spinner `aria-label`: the layer name, else the generated Thai text (mirrors the compiler). */
export function spinnerLabel(name: string | undefined): string {
  const n = name?.trim();
  return n ? n : (A2_TEXTS.spinnerLabel ?? "");
}

export type GroupPos = "first" | "middle" | "last";
export type Dir = "row" | "column";

/**
 * Corner declarations of one buttonGroup child (mirrors `group_corner_decls`). First / last
 * keep `radius` on the two outer corners of the group's axis and get 0 on the inner two; a
 * middle child gets 0 everywhere; a child with no radius needs nothing.
 */
export function cornerDecls(dir: Dir, pos: GroupPos, radius: number): [string, string][] {
  if (!(radius > 0)) return [];
  if (pos === "middle") return [["border-radius", "0px"]];
  const first = pos === "first";
  const keep: [boolean, boolean, boolean, boolean] =
    dir === "row"
      ? first
        ? [true, false, false, true]
        : [false, true, true, false]
      : first
        ? [true, true, false, false]
        : [false, false, true, true];
  const v = (k: boolean) => (k ? `${radius}px` : "0px");
  return [
    ["border-top-left-radius", v(keep[0])],
    ["border-top-right-radius", v(keep[1])],
    ["border-bottom-right-radius", v(keep[2])],
    ["border-bottom-left-radius", v(keep[3])],
  ];
}

/** A node's breakpoint overrides, as far as the corner rule needs them. */
export type BpRadii = { tablet?: { borderRadius?: number }; phone?: { borderRadius?: number }; foldOpen?: { borderRadius?: number } };
export type BpView = "tablet" | "phone" | "foldOpen";

/**
 * F1 (mirrors `node_class` in compiler.rs): the declarations one media block of a buttonGroup child
 * carries for `borderRadius`. The override exports the `border-radius` shorthand, which would give every
 * corner the radius again, so the corner table is re-applied with THAT breakpoint's radius right after it
 * (a middle child's `border-radius:0px` replaces the shorthand). No override radius → `undefined`: the block has
 * no radius rule at all. `slot` is the child's `g:<dir>:<pos>` slot (undefined: not in a group → shorthand only).
 */
export function breakpointRadiusDecls(slot: string | undefined, bpRadius: number | undefined): [string, string][] | undefined {
  if (bpRadius === undefined) return undefined;
  const out: [string, string][] = [["border-radius", `${bpRadius}px`]];
  const m = slot ? /^g:(row|column):(first|middle|last)$/.exec(slot) : null;
  if (!m) return out;
  for (const [k, v] of cornerDecls(m[1] as Dir, m[2] as GroupPos, bpRadius)) {
    const at = out.findIndex(([ek]) => ek === k);
    if (at >= 0) out[at] = [k, v];
    else out.push([k, v]);
  }
  return out;
}

/**
 * Effective `borderRadius` of a node at a breakpoint view as the CSS cascade resolves it
 * (`phone` and `foldOpen` inherit nothing from each other; phone sits inside the tablet query).
 */
export function effectiveBpRadius(base: number | undefined, bp: BpRadii | undefined, view: BpView): number | undefined {
  if (view === "foldOpen") return bp?.foldOpen?.borderRadius ?? base;
  if (view === "phone") return bp?.phone?.borderRadius ?? bp?.tablet?.borderRadius ?? base;
  return bp?.tablet?.borderRadius ?? base;
}

/** Mirrors `emits_element` in compiler.rs: which children a buttonGroup actually draws in the export. */
export function emitsElement(n: Node | undefined): boolean {
  if (!n || !isVisible(n)) return false;
  const p = n.props;
  if ((p.type === "dialog" || p.type === "sheet" || p.type === "drawer") && !p.open) return false;
  return true;
}

/**
 * Slot of each direct child of a buttonGroup: "g:<dir>:<pos>" (only when the group draws two or
 * more children). A primitive string so the memoised `NodeView` keeps its shallow compare.
 */
export function groupSlots(nodes: Record<string, Node>, ids: NodeId[], dir: Dir): Record<string, string> {
  const drawn = ids.filter((id) => emitsElement(nodes[id]));
  const out: Record<string, string> = {};
  if (drawn.length < 2) return out;
  drawn.forEach((id, i) => {
    const pos: GroupPos = i === 0 ? "first" : i === drawn.length - 1 ? "last" : "middle";
    out[id] = `g:${dir}:${pos}`;
  });
  return out;
}

/** Slot of a child of an aspectRatio: it fills the box (`.t-aspectRatio>*{width:100%;height:100%}`). */
export const FILL_SLOT = "fill";

/**
 * Phase 11 A2.5 (F2): CANVAS-ONLY hit area of the 1px separator. The line is 1 px thick, so it cannot be clicked or
 * dragged; a 4 px pseudo-element on each side (the pseudo-element is part of the separator, its events target the
 * separator) makes it a 9 px target. It lives here and NOT in kind-looks.json, which the exporter also reads, so
 * nothing of it reaches an export. `[data-cv-hit]` is set only on an interactive (editable) canvas node. `overflow` is
 * reset because the browser's `hr` rule clips children. The pseudo-element overlaps its neighbours by up to 4 px.
 */
export const A2_CANVAS_ONLY_CSS =
  '.t-separator[data-cv-hit]{position:relative;overflow:visible}' +
  '.t-separator[data-cv-hit]::before{content:"";position:absolute;left:0;right:0;top:-4px;bottom:-4px}' +
  '.t-separator[data-cv-hit][aria-orientation="vertical"]::before{left:-4px;right:-4px;top:0;bottom:0}';

/**
 * Inline overrides a slot puts on a child, applied after the child's own look (the export's
 * `.t-aspectRatio>*` / per-node corner class beat the child's type rule the same way).
 * `radius` is the child's resolved borderRadius; `ownW` / `ownH`: the node set width / height itself.
 */
export function slotStyle(
  slot: string | undefined,
  radius: number,
  ownW: boolean,
  ownH: boolean,
): CSSProperties | undefined {
  if (!slot) return undefined;
  if (slot === FILL_SLOT) {
    const o: Css = {};
    if (!ownW) o.width = "100%";
    if (!ownH) o.height = "100%";
    return o as CSSProperties;
  }
  const m = /^g:(row|column):(first|middle|last)$/.exec(slot);
  if (!m) return undefined;
  const o: Css = {};
  for (const [k, v] of cornerDecls(m[1] as Dir, m[2] as GroupPos, radius)) o[kebabToCamel(k)] = v;
  return o as CSSProperties;
}

/** `base` with the slot override on top; per-corner longhands replace the `borderRadius` shorthand. */
export function mergeOver(base: CSSProperties, over: CSSProperties | undefined): CSSProperties {
  if (!over) return base;
  const out = { ...(base as Css) };
  if (Object.keys(over).some((k) => k.startsWith("borderTop") || k.startsWith("borderBottom"))) delete out.borderRadius;
  return { ...out, ...(over as Css) } as CSSProperties;
}

/** `display:flex;...` text of a layout style (tests compare it with the Rust type rules). */
export function kebabLayout(c: CSSProperties): string {
  return Object.entries(c as Css)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(";");
}

/** Minimal shape of a React focus event / DOM nodes that `redirectFocusToCanvasScopeDeferred` needs (testable without a DOM). */
export type FocusRedirectEvent = {
  target: unknown;
  currentTarget: { closest(selector: string): { focus(o?: { preventScroll?: boolean }): void } | null };
};
export const CANVAS_SCOPE_SELECTOR = '[data-kbd-scope="canvas"]';
/** The hand-back runs on the very next macrotask. A longer delay leaves the scrollArea focused for a visible moment (Designer B9). */
export const FOCUS_REDIRECT_DELAY_MS = 0;

/**
 * N1 (F-A24-1): the canvas scrollArea carries `tabindex=-1` (never a Tab stop; the export has `tabindex=0`). A mouse
 * click on it or on one of its children would focus it, so the canvas scope takes the focus back: after a click
 * `document.activeElement` is the canvas scope, like for every other kind.
 *
 * The hand-back is DEFERRED (`setTimeout 0`) and GUARDED, and both parts are load-bearing:
 *  - deferred: calling `scope.focus()` inside the focus event of the mousedown makes Chromium (WebView2) cancel the
 *    pending HTML5 drag, so neither the scrollArea nor any node in it could be dragged. A microtask is not enough.
 *  - guarded (`activeElement === el`): an unguarded deferral steals the focus from the inline editor that a double
 *    click has just opened, which ends the edit.
 * Only a focus event on the scrollArea itself counts (a child's bubbling event does not). Returns whether a hand-back
 * was scheduled. `env` is for tests without a DOM.
 */
export function redirectFocusToCanvasScopeDeferred(
  e: FocusRedirectEvent,
  env: { defer?: (f: () => void, delayMs: number) => void; active?: () => unknown } = {},
): boolean {
  if (e.target !== e.currentTarget) return false;
  const el = e.currentTarget;
  const defer = env.defer ?? ((f: () => void, delayMs: number) => void setTimeout(f, delayMs));
  const active = env.active ?? (() => document.activeElement);
  defer(() => {
    if (active() !== el) return;
    el.closest(CANVAS_SCOPE_SELECTOR)?.focus({ preventScroll: true });
  }, FOCUS_REDIRECT_DELAY_MS);
  return true;
}
