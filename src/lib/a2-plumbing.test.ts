import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { documentForSave, wireDocumentForSave } from "@/lib/breakpoints";
import { NODE_TYPE_LABEL } from "@/lib/document-ops";
import {
  A2_TYPES,
  DEFAULT_STYLES,
  PHASE6B_TYPES,
  isA2Type,
  isPhase6bType,
  isVersion4Kind,
  type Node,
  type NodeType,
  type PageDocument,
} from "@/schema";

/**
 * Phase 11 A2.1: key parity between schema.ts and the Rust side (defaults.rs +
 * compiler.rs), the A2 round-trip fixture, and the version marker. The Rust side
 * is read as text: bun has no Rust, and a TS-only change must fail here.
 */
const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SCHEMA = read("src/schema.ts");
const DEFAULTS_RS = read("src-tauri/src/defaults.rs");
const COMPILER_RS = read("src-tauri/src/compiler.rs");
const SEED = JSON.parse(read("src-tauri/src/fixtures/a2/seed-a2.json")) as PageDocument;
const GOLDEN = JSON.parse(read("src-tauri/src/fixtures/a2/default-styles.json")) as Record<string, unknown>;

const A2_NAMES = ["card", "alert", "badge", "separator", "skeleton", "spinner", "aspectRatio", "scrollArea", "buttonGroup"];

function between(src: string, start: string, end: RegExp): string {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`missing ${start}`);
  const rest = src.slice(i + start.length);
  const m = end.exec(rest);
  return m ? rest.slice(0, m.index) : rest;
}

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** Rust `NodeType` variants → wire names (snake_case unless an explicit rename). */
function rustWire(): Map<string, string> {
  const body = between(DEFAULTS_RS, "pub enum NodeType {", /\n}/);
  const map = new Map<string, string>();
  let rename: string | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const r = /^#\[serde\(rename = "([^"]+)"\)\]$/.exec(line);
    if (r) {
      rename = r[1]!;
      continue;
    }
    const v = /^([A-Z][A-Za-z0-9]*),$/.exec(line);
    if (v) {
      map.set(v[1]!, rename ?? snake(v[1]!));
      rename = null;
    }
  }
  return map;
}

function tsNodeTypes(): string[] {
  return [...between(SCHEMA, "export type NodeType =", /;\n/).matchAll(/\|\s*"(\w+)"/g)].map((m) => m[1]!);
}

const variantsIn = (body: string) => [...body.matchAll(/NodeType::([A-Za-z0-9]+)/g)].map((m) => m[1]!);
const lowerFirst = (s: string) => s[0]!.toLowerCase() + s.slice(1);

describe("A2.1 key parity: schema.ts vs defaults.rs / compiler.rs", () => {
  const wire = rustWire();
  const ts = tsNodeTypes();

  test("TS NodeType has 59 kinds (A5.5 adds calendar), the Rust enum has the same wire names", () => {
    expect(ts.length).toBe(59); // A5.5 calendar
    expect(new Set(ts).size).toBe(59);
    expect([...wire.values()].sort()).toEqual([...ts].sort());
    for (const n of A2_NAMES) expect(ts).toContain(n);
  });

  test("camelCase kinds carry an explicit Rust rename (no snake_case on the wire)", () => {
    for (const n of ["aspectRatio", "scrollArea", "buttonGroup", "toggleGroup", "hoverCard"]) {
      expect([...wire.values()]).toContain(n);
    }
    expect([...wire.values()].some((v) => v.includes("_"))).toBe(false);
  });

  test("Rust NodeProps variants = TS props tags = NodeType", () => {
    const body = between(DEFAULTS_RS, "pub enum NodeProps {", /\n}/);
    const rustTags = [...body.matchAll(/^    ([A-Z][A-Za-z0-9]*)\s*[{,]/gm)].map((m) => lowerFirst(m[1]!));
    const tsTags = [...SCHEMA.matchAll(/export type \w+Props = \{\s*type: "(\w+)"/g)].map((m) => m[1]!);
    expect([...rustTags].sort()).toEqual([...ts].sort());
    expect([...tsTags].sort()).toEqual([...ts].sort());
  });

  test("ALL_TYPES (compiler.rs) lists every kind once, in NodeType order", () => {
    const list = between(COMPILER_RS, "const ALL_TYPES: [NodeType; 59] = [", /\];/);
    const names = variantsIn(list).map((v) => wire.get(v)!);
    expect(names).toEqual(ts);
  });

  test("type_name (compiler.rs) returns the wire name for every kind", () => {
    const body = between(COMPILER_RS, "fn type_name(t: NodeType) -> &'static str {", /\n}/);
    const pairs = [...body.matchAll(/NodeType::([A-Za-z0-9]+) => "(\w+)"/g)];
    expect(pairs.length).toBe(59);
    for (const m of pairs) expect(wire.get(m[1]!)).toBe(m[2]!);
  });

  test("default_styles has an arm for every kind; TS DEFAULT_STYLES and labels list the same 59", () => {
    const body = between(DEFAULTS_RS, "pub fn default_styles(node_type: NodeType) -> StyleProps {", /\npub fn resolved_style|\n\/\/\/ Merge type defaults/);
    const arms = [...body.matchAll(/^        NodeType::([A-Za-z0-9]+) =>/gm)].map((m) => wire.get(m[1]!)!);
    expect([...arms].sort()).toEqual([...ts].sort());
    expect(Object.keys(DEFAULT_STYLES).sort()).toEqual([...ts].sort());
    expect(Object.keys(NODE_TYPE_LABEL).sort()).toEqual([...ts].sort());
  });

  test("version-4 marker: Rust is_phase6b / is_a2_kind = TS PHASE6B_TYPES / A2_TYPES", () => {
    const six = between(DEFAULTS_RS, "fn is_phase6b(t: NodeType) -> bool {", /\n}/);
    const a2 = between(DEFAULTS_RS, "pub fn is_a2_kind(t: NodeType) -> bool {", /\n}/);
    expect(variantsIn(six).map((v) => wire.get(v)!).sort()).toEqual([...PHASE6B_TYPES].sort());
    expect(variantsIn(a2).map((v) => wire.get(v)!).sort()).toEqual([...A2_TYPES].sort());
    expect(DEFAULTS_RS).toContain("is_phase6b(t) || is_a2_kind(t) || is_a3_kind(t) || is_a4_kind(t)");
  });

  test("the nine A2 kinds default styles are the shared golden (same file the Rust test reads)", () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...A2_NAMES].sort());
    for (const n of A2_NAMES) expect(DEFAULT_STYLES[n as NodeType]).toEqual(GOLDEN[n]);
  });

  test("schema.ts StyleProps key count (B6.1: 29 with filter/backdropFilter)", () => {
    const body = between(SCHEMA, "export type StyleProps = {", /\n};/);
    const keys = [...body.matchAll(/^  (\w+)\??:/gm)].map((m) => m[1]!);
    expect(keys.length).toBe(29);
    expect(keys).toContain("boxShadow");
    expect(keys).toContain("backgroundGradient");
    expect(keys).toContain("textGradient");
    expect(keys).toContain("borderSides");
    expect(keys).toContain("borderRadiusCorners");
    expect(keys).toContain("transform");
    expect(keys).toContain("transition");
    expect(keys).toContain("filter");
    expect(keys).toContain("backdropFilter");
  });
});

describe("A2.1 predicates", () => {
  test("A2 kinds are version-4 kinds but not phase 6b (UI routing unchanged)", () => {
    for (const n of A2_NAMES) {
      expect(isA2Type(n)).toBe(true);
      expect(isVersion4Kind(n)).toBe(true);
      expect(isPhase6bType(n)).toBe(false);
    }
    for (const n of PHASE6B_TYPES) expect(isVersion4Kind(n)).toBe(true);
    for (const n of ["page", "section", "container", "heading", "text", "image", "button", "link", "spacer", "input", "switch"]) {
      expect(isVersion4Kind(n)).toBe(false);
    }
    expect(PHASE6B_TYPES.length).toBe(31);
    expect(A2_TYPES.length).toBe(9);
  });
});

describe("A2.1 fixture seed-a2 and the version marker", () => {
  const nodes = Object.values(SEED.nodes);
  const kinds = nodes.map((n) => n.type);

  test("fixture holds one of each of the 9 kinds, two separators, and the nested cases", () => {
    for (const n of A2_NAMES) expect(kinds).toContain(n);
    expect(kinds.filter((k) => k === "separator").length).toBe(2);
    expect(SEED.nodes["card1"]!.props).toMatchObject({ children: ["card-h", "card-p"] });
    expect(SEED.nodes["bg-b"]!.style).toEqual({ borderRadius: 20 });
    for (const n of nodes) expect(n.props.type).toBe(n.type);
  });

  test("TS save writes the fixture back key for key (no key dropped or added)", () => {
    const wire = wireDocumentForSave(SEED);
    expect(wire).toEqual(SEED as unknown as Record<string, unknown>);
    expect("pages" in wire).toBe(false);
  });

  test("version: v1 stays 1; any one new kind → 4; removing it → 1; two pages → 5", () => {
    const base = (children: string[], extra: Record<string, Node> = {}): PageDocument => ({
      version: 1,
      meta: { title: "t" },
      root: "r",
      nodes: { r: { id: "r", type: "page", props: { type: "page", children }, style: {} }, ...extra },
    });
    expect(documentForSave(base([])).version).toBe(1);
    const samples: Record<string, Node["props"]> = {
      card: { type: "card", children: [] },
      alert: { type: "alert", children: [] },
      badge: { type: "badge", label: "b" },
      separator: { type: "separator", orientation: "horizontal" },
      skeleton: { type: "skeleton" },
      spinner: { type: "spinner", size: 24 },
      aspectRatio: { type: "aspectRatio", children: [], ratio: "16/9" },
      scrollArea: { type: "scrollArea", children: [], orientation: "vertical" },
      buttonGroup: { type: "buttonGroup", children: [] },
    };
    for (const n of A2_NAMES) {
      const node = { id: "k", type: n as NodeType, props: samples[n]!, style: {} } as Node;
      expect(documentForSave(base(["k"], { k: node })).version).toBe(4);
      expect(documentForSave(base([])).version).toBe(1);
    }
    expect(documentForSave(SEED).version).toBe(4);
    // Older markers are unchanged.
    const kbd = { id: "k", type: "kbd", props: { type: "kbd", text: "k" }, style: {} } as Node;
    const input = { id: "k", type: "input", props: { type: "input", label: "", placeholder: "" }, style: {} } as Node;
    expect(documentForSave(base(["k"], { k: kbd })).version).toBe(4);
    expect(documentForSave(base(["k"], { k: input })).version).toBe(3);
    // Two pages stay 5 and keep the nodes.
    const two: PageDocument = {
      version: 5,
      meta: { title: "t" },
      root: "root",
      nodes: SEED.nodes,
      pages: [
        { id: "home", name: "หน้าแรก", path: "/", root: "root", nodes: SEED.nodes },
        { id: "p2", name: "สอง", path: "/two", root: "r2", nodes: { r2: { id: "r2", type: "page", props: { type: "page", children: [] }, style: {} } } },
      ],
    };
    const saved = documentForSave(two);
    expect(saved.version).toBe(5);
    expect(saved.pages!.length).toBe(2);
    expect(saved.pages![0]!.nodes["ratio1"]).toBeDefined();
  });
});
