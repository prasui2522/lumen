import type { CSSProperties } from "react";
import looks from "./kind-looks.json";

/**
 * Canvas side of the shared look constants (PHASE-11 A1.4).
 * `kind-looks.json` is the ONE source: the Rust compiler `include_str!`s it for the
 * Preview / export, and this module turns the same data into the Design canvas look.
 *  - `css`    descendant / pseudo rules  -> one global stylesheet (`KIND_LOOKS_CSS`)
 *  - `extras` per-type declarations      -> inline on the node root (`rootStyleFor`),
 *             unless the node set that property itself (G1: an explicit style wins).
 * Pure: no React, no DOM, no app imports, so it is unit-testable in bun.
 */

type RawKind = { extras: string[][]; css: string[] };
type RawLooks = {
  palette: Record<string, string>;
  facingBorder: string;
  facing: Record<string, string>;
  kinds: Record<string, RawKind>;
};

const RAW = looks as unknown as RawLooks;

/** Same rule as the compiler: `{{name}}` -> palette[name]; an unknown token stays visible. */
export function expandTokens(s: string, palette: Record<string, string> = RAW.palette): string {
  return s.replace(/\{\{([^{}]*)\}\}/g, (m, name: string) => (name in palette ? palette[name] : m));
}

export type KindLook = { extras: [string, string][]; css: string };

export const KIND_LOOKS: Record<string, KindLook> = Object.fromEntries(
  Object.entries(RAW.kinds).map(([name, k]) => [
    name,
    {
      extras: k.extras.map(([p, v]) => [p, expandTokens(v)] as [string, string]),
      css: k.css.map((r) => expandTokens(r)).join(""),
    },
  ]),
);

export const FACING_BORDER = expandTokens(RAW.facingBorder);
export const FACING: Record<string, string> = RAW.facing;

/** Every kind's descendant rules, in file order. Injected once into the editor. */
export const KIND_LOOKS_CSS: string = Object.values(KIND_LOOKS)
  .map((k) => k.css)
  .join("\n");

/**
 * Canvas-only: everything inside a Phase 6b node is inert, so a click anywhere selects
 * the node. (The compiled page has no such rule.)
 */
export const CANVAS_INERT_CSS =
  "[data-node-type][data-cv] *{pointer-events:none}" +
  // A drag that starts on a summary row (accordion, collapsible, dropdownMenu, popover, menubar)
  // also starts a text selection in WebKitGTK and leaves the row highlighted after the drop.
  "[data-node-type][data-cv] summary{-webkit-user-select:none;user-select:none}";

export function kebabToCamel(k: string): string {
  const lead = k.startsWith("-");
  const c = (lead ? k.slice(1) : k).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
  return lead ? c.charAt(0).toUpperCase() + c.slice(1) : c;
}

type Css = Record<string, string | number | undefined>;

/** The properties the node set itself. `borderColor: currentColor` is always present in
 *  `styleToCss`, so it only counts when the node really has a border colour. */
export function explicitOf(nodeCss: CSSProperties, hasBorderColor: boolean): CSSProperties {
  const out: Css = {};
  for (const [k, v] of Object.entries(nodeCss as Css)) {
    if (v === undefined) continue;
    if (k === "borderColor" && !hasBorderColor) continue;
    out[k] = v;
  }
  return out as CSSProperties;
}

function leftAuto(margin: string | number | undefined): string {
  if (margin === undefined) return "0px 0px 0px auto";
  const parts = String(margin).trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0]} ${parts[0]} ${parts[0]} auto`;
  return `${parts[0]} ${parts[1]} ${parts[2] ?? parts[0]} auto`;
}

const SIDE_CAP: Record<string, string> = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" };

function splitBorder(b: string): [string, string, string] {
  const [w = "1px", s = "solid", ...c] = b.trim().split(/\s+/);
  return [w, s, c.join(" ") || "currentColor"];
}

export type RootOpts = {
  /** bubble / message with align end */
  alignEnd?: boolean;
  /** sheet / drawer edge (shadcn sides) */
  side?: "top" | "right" | "bottom" | "left";
};

/**
 * Inline style of a node root.
 *  `base`     styleToCss(resolved style) : defaults merged with the node's own style
 *  `explicit` explicitOf(styleToCss(node.style), node.style.borderColor !== undefined)
 * An extra is applied only when the node did not set that property (G1), exactly the
 * order the export's CSS resolves in (type rule first, then the node's own class).
 */
export function rootStyleFor(
  kind: string,
  base: CSSProperties,
  explicit: CSSProperties,
  opts: RootOpts = {},
): CSSProperties {
  const out: Css = { ...(base as Css) };
  const ex = explicit as Css;
  const set = (key: string, v: string) => {
    if (ex[key] === undefined) out[key] = v;
  };
  for (const [prop, v] of KIND_LOOKS[kind]?.extras ?? []) {
    if (prop === "border") {
      const [w, s, c] = splitBorder(v);
      set("borderWidth", w);
      set("borderStyle", s);
      set("borderColor", c);
    } else {
      set(kebabToCamel(prop), v);
    }
  }
  // Bubble / message end alignment is `margin-left:auto` only, and only when the node
  // has no margin of its own (an explicit margin, even 0, wins).
  if (opts.alignEnd && ex.margin === undefined) out.margin = leftAuto(out.margin);
  // Sheet / drawer: only the facing side has a border. Inline styles would beat the
  // type rules, so the per-side longhands are written here instead of border-width etc.
  const facing =
    kind === "sheet"
      ? FACING[`sheet:${opts.side ?? "right"}`]
      : kind === "drawer"
        ? FACING[`drawer:${opts.side ?? "bottom"}`] ?? FACING.drawer
        : FACING[kind];
  if (facing && SIDE_CAP[facing]) {
    delete out.borderWidth;
    delete out.borderStyle;
    delete out.borderColor;
    const [fw, fs, fc] = splitBorder(FACING_BORDER);
    for (const side of ["top", "right", "bottom", "left"]) {
      const cap = SIDE_CAP[side];
      if (side === facing) {
        out[`border${cap}Width`] = ex.borderWidth ?? fw;
        out[`border${cap}Style`] = ex.borderStyle ?? fs;
        out[`border${cap}Color`] = ex.borderColor ?? fc;
      } else {
        out[`border${cap}Width`] = 0;
        out[`border${cap}Style`] = "none";
        out[`border${cap}Color`] = ex.borderColor ?? fc;
      }
    }
  }
  return out as CSSProperties;
}

/**
 * Canvas-only wrapper for the leaf native controls (select, slider, unlabelled textarea).
 * A native control cannot be the draggable root: it would have to swallow `mousedown` to
 * stay inert, and a cancelled `mousedown` starts no drag. So the canvas renders
 * `<div wrapper><control inert/></div>` and the wrapper takes mousedown, click and drag.
 * This splits the control's resolved root style so the layout is the one the bare control
 * has in the export / Preview:
 *  - wrapper: the properties that size and place the box (display, width, min-height,
 *    max-width, margin, opacity). It has NO height of its own (see below).
 *  - control: everything else (padding, border, background, font ...), plus `display:block;
 *    width:100%`, its height (kind-looks extra such as progress' 8px, or the node's own),
 *    and the same min-height (so a min-height still grows the control itself).
 * The height lives on the control only, so the wrapper is exactly the control's box. A fixed
 * height on the wrapper would clip the layout whenever the control grows past it (border-box
 * padding+border larger than the height: progress is 8px by kind-looks, 20/30/10/5 padding
 * makes the control 30px, and the wrapper stayed 8px, 22px short, A1.4c). The one exception
 * is a percentage height: it only resolves against a parent with a definite height, so it
 * stays on the wrapper and the control fills it (`height:100%`).
 * A control with no `display` of its own is block-level (every kind's default), so the
 * wrapper is block-level too; inline kinds become `inline-flex` (baseline = the control's).
 */
const WRAPPER_KEYS = ["width", "maxWidth", "margin", "opacity"] as const;

export function splitControlStyle(full: CSSProperties): { wrapper: CSSProperties; control: CSSProperties } {
  const src = full as Css;
  const wrapper: Css = {};
  const control: Css = { ...src };
  for (const k of WRAPPER_KEYS) {
    if (src[k] !== undefined) wrapper[k] = src[k];
    delete control[k];
  }
  if (src.minHeight !== undefined) wrapper.minHeight = src.minHeight;
  const d = src.display;
  wrapper.display = d === undefined || d === "block" || d === "flex" ? "block" : d === "none" ? "none" : "inline-flex";
  control.display = "block";
  control.width = "100%";
  const h = src.height;
  if (h !== undefined) {
    if (typeof h === "string" && h.trim().endsWith("%")) {
      wrapper.height = h;
      control.height = "100%";
    } else {
      control.height = h;
    }
  }
  return { wrapper: wrapper as CSSProperties, control: control as CSSProperties };
}

/** `aria-label` from the layer name (G4), same rule as the compiler. */
export function nameAttr(name: string | undefined): { "aria-label"?: string } {
  return name !== undefined && name.trim() !== "" ? { "aria-label": name } : {};
}

/** Dropdown / popover label falls back to the layer name (mirrors `summary_label`). */
export function summaryLabel(label: string, name: string | undefined): string {
  if (label.trim() === "") {
    const n = name?.trim();
    return n ? n : label;
  }
  return label;
}

/** The stylesheet text the editor injects. */
export const CANVAS_STYLESHEET = `${KIND_LOOKS_CSS}\n${CANVAS_INERT_CSS}`;
