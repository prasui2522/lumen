import type { CSSProperties } from "react";
import looks from "./kind-looks.json";
import { expandTokens, kebabToCamel, type KindLook } from "./kind-looks";

/**
 * Canvas side of PHASE-11 A5 shared constants (A5.1 carousel).
 * `kind-looks.json` `a5` is the ONE source: the Rust compiler reads the same section.
 */
type RawKind = { extras: string[][]; css: string[] };
type RawA5 = { kinds: Record<string, RawKind> };

/** A missing / malformed `a5` section is a hard error. Mirrors `parse_kind_looks_checked`. */
export function a5Section(file: unknown): RawA5 {
  const a5 = (file as { a5?: unknown } | null | undefined)?.a5 as Partial<RawA5> | undefined;
  if (a5 === null || typeof a5 !== "object") throw new Error("kind-looks.json: missing section `a5`");
  if (a5.kinds === null || typeof a5.kinds !== "object") throw new Error("kind-looks.json: missing section `a5.kinds`");
  for (const [name, k] of Object.entries(a5.kinds)) {
    if (!Array.isArray(k?.extras) || !Array.isArray(k?.css)) {
      throw new Error(`kind-looks.json: malformed \`a5.kinds\` entry \`${name}\``);
    }
  }
  return a5 as RawA5;
}
const RAW = a5Section(looks);

export const A5_LOOKS: Record<string, KindLook> = Object.fromEntries(
  Object.entries(RAW.kinds).map(([name, k]) => [
    name,
    {
      extras: k.extras.map(([p, v]) => [p, expandTokens(v)] as [string, string]),
      css: k.css.map((r) => expandTokens(r)).join(""),
    },
  ]),
);

/** The A5 rules (carousel). Injected once into the editor. */
export const A5_STYLESHEET: string = Object.values(A5_LOOKS)
  .map((k) => k.css)
  .filter((c) => c !== "")
  .join("\n");

type Css = Record<string, string | number | undefined>;

/** A kind-look extra is applied only when the node did not set that property (G1). */
export function a5ExtrasStyle(kind: string, base: CSSProperties, explicit: CSSProperties): CSSProperties {
  const out: Css = { ...(base as Css) };
  const ex = explicit as Css;
  for (const [prop, v] of A5_LOOKS[kind]?.extras ?? []) {
    const key = kebabToCamel(prop);
    if (ex[key] === undefined) out[key] = v;
  }
  return out as CSSProperties;
}

/** Compute flex-basis for a carousel slide. */
export function slideBasis(slidesPerView: number, gapPx: number): string {
  const n = Math.max(1, Math.min(4, Math.round(slidesPerView)));
  return `calc((100% - ${gapPx * (n - 1)}px) / ${n})`;
}
