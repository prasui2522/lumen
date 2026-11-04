import type { CSSProperties } from "react";
import { A3_LAYOUT_DEFAULTS } from "@/schema";
import looks from "./kind-looks.json";
import { expandTokens, kebabToCamel, type KindLook } from "./kind-looks";

/**
 * Canvas side of the PHASE-11 A3 shared constants (A3.1 checkbox, A3.2 switch, A3.3 field).
 * `kind-looks.json` `a3` is the ONE source: the Rust compiler reads the same section for the
 * Preview / export. The 16px checkbox box / switch track / field label styles are never style
 * keys and never user input. Pure: no React runtime, no DOM.
 */
type RawKind = { extras: string[][]; css: string[] };
type RawA3 = { kinds: Record<string, RawKind> };

/** A missing / malformed `a3` section is a hard error. Mirrors `parse_kind_looks_checked`. */
export function a3Section(file: unknown): RawA3 {
  const a3 = (file as { a3?: unknown } | null | undefined)?.a3 as Partial<RawA3> | undefined;
  if (a3 === null || typeof a3 !== "object") throw new Error("kind-looks.json: missing section `a3`");
  if (a3.kinds === null || typeof a3.kinds !== "object") throw new Error("kind-looks.json: missing section `a3.kinds`");
  for (const [name, k] of Object.entries(a3.kinds)) {
    if (!Array.isArray(k?.extras) || !Array.isArray(k?.css)) throw new Error(`kind-looks.json: malformed \`a3.kinds\` entry \`${name}\``);
  }
  return a3 as RawA3;
}
const RAW = a3Section(looks);

export const A3_LOOKS: Record<string, KindLook> = Object.fromEntries(
  Object.entries(RAW.kinds).map(([name, k]) => [
    name,
    {
      extras: k.extras.map(([p, v]) => [p, expandTokens(v)] as [string, string]),
      css: k.css.map((r) => expandTokens(r)).join(""),
    },
  ]),
);

/** The A3 rules (checkbox box + checkmark). Injected once into the editor. */
export const A3_STYLESHEET: string = Object.values(A3_LOOKS)
  .map((k) => k.css)
  .filter((c) => c !== "")
  .join("\n");

type Css = Record<string, string | number | undefined>;

/** A kind-look extra is applied only when the node did not set that property (G1). */
export function a3ExtrasStyle(kind: string, base: CSSProperties, explicit: CSSProperties): CSSProperties {
  const out: Css = { ...(base as Css) };
  const ex = explicit as Css;
  for (const [prop, v] of A3_LOOKS[kind]?.extras ?? []) {
    const key = kebabToCamel(prop);
    if (ex[key] === undefined) out[key] = v;
  }
  return out as CSSProperties;
}

type FieldLayoutLike = {
  direction?: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
};

const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;
const ALIGN = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;

/** Phase 11 A3.3: same four declarations as the compiler's field layout (column / gap 6). */
export function fieldLayout(p: FieldLayoutLike): CSSProperties {
  const d = A3_LAYOUT_DEFAULTS.field;
  return {
    display: "flex",
    flexDirection: (p.direction ?? d.direction) === "row" ? "row" : "column",
    gap: `${p.gap ?? d.gap}px`,
    alignItems: ALIGN[p.align ?? d.align],
    justifyContent: JUSTIFY[p.justify ?? d.justify],
  };
}
