import type { CSSProperties } from "react";
import looks from "./kind-looks.json";
import { expandTokens, kebabToCamel, type KindLook } from "./kind-looks";

/**
 * Canvas side of PHASE-11 A4 shared constants (A4.1 list markers).
 * `kind-looks.json` `a4` is the ONE source: the Rust compiler reads the same section.
 */
type RawKind = { extras: string[][]; css: string[] };
type RawA4 = { kinds: Record<string, RawKind> };

/** A missing / malformed `a4` section is a hard error. Mirrors `parse_kind_looks_checked`. */
export function a4Section(file: unknown): RawA4 {
  const a4 = (file as { a4?: unknown } | null | undefined)?.a4 as Partial<RawA4> | undefined;
  if (a4 === null || typeof a4 !== "object") throw new Error("kind-looks.json: missing section `a4`");
  if (a4.kinds === null || typeof a4.kinds !== "object") throw new Error("kind-looks.json: missing section `a4.kinds`");
  for (const [name, k] of Object.entries(a4.kinds)) {
    if (!Array.isArray(k?.extras) || !Array.isArray(k?.css)) {
      throw new Error(`kind-looks.json: malformed \`a4.kinds\` entry \`${name}\``);
    }
  }
  return a4 as RawA4;
}
const RAW = a4Section(looks);

export const A4_LOOKS: Record<string, KindLook> = Object.fromEntries(
  Object.entries(RAW.kinds).map(([name, k]) => [
    name,
    {
      extras: k.extras.map(([p, v]) => [p, expandTokens(v)] as [string, string]),
      css: k.css.map((r) => expandTokens(r)).join(""),
    },
  ]),
);

/** The A4 rules (list markers). Injected once into the editor. */
export const A4_STYLESHEET: string = Object.values(A4_LOOKS)
  .map((k) => k.css)
  .filter((c) => c !== "")
  .join("\n");

type Css = Record<string, string | number | undefined>;

/** A kind-look extra is applied only when the node did not set that property (G1). */
export function a4ExtrasStyle(kind: string, base: CSSProperties, explicit: CSSProperties): CSSProperties {
  const out: Css = { ...(base as Css) };
  const ex = explicit as Css;
  for (const [prop, v] of A4_LOOKS[kind]?.extras ?? []) {
    const key = kebabToCamel(prop);
    if (ex[key] === undefined) out[key] = v;
  }
  return out as CSSProperties;
}
