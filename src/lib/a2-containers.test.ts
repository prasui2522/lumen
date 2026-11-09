import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canDropNode,
  canInsertInto,
  createNode,
  findParent,
  flattenLayers,
  insertNode,
  isDescendant,
  moveNodeInDocument,
  PALETTE_TYPES,
  removeNode,
  resolveInsertTarget,
  setNodeProp,
  toggleNodeLocked,
} from "@/lib/document-ops";
import { documentForSave } from "@/lib/breakpoints";
import {
  A2_LAYOUT_DEFAULTS,
  A2_TYPES,
  CONTAINER_NODE_TYPES,
  getChildren,
  isContainerType,
  type Node,
  type NodeType,
  type PageDocument,
} from "@/schema";

/**
 * Phase 11 A2.2: the five A2 kinds with `children` behave like `container` in every
 * document-ops path, the four A2 leaves refuse children, and the Rust side lists the
 * same container kinds (read as text: a TS-only change must fail here).
 */
const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const NEST = JSON.parse(read("src-tauri/src/fixtures/a2/seed-a2-nest.json")) as PageDocument;
const SEED = JSON.parse(read("src-tauri/src/fixtures/a2/seed-a2.json")) as PageDocument;
const DEFAULTS_RS = read("src-tauri/src/defaults.rs");

const A2_CONTAINERS = ["card", "alert", "aspectRatio", "scrollArea", "buttonGroup"] as const;
const A2_LEAVES = ["badge", "separator", "skeleton", "spinner"] as const;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const kids = (d: PageDocument, id: string) => getChildren(d.nodes[id]);

/** A fresh doc: page → [card, badge, heading]. */
function mini(): PageDocument {
  const d = clone(NEST);
  return d;
}

/** A node of every NodeType that exists in the fixtures or can be created. */
function oneOfEach(): Map<NodeType, Node> {
  const m = new Map<NodeType, Node>();
  for (const n of [...Object.values(SEED.nodes), ...Object.values(NEST.nodes)]) m.set(n.type, n);
  for (const t of PALETTE_TYPES) if (!m.has(t)) m.set(t, createNode(t));
  return m;
}

describe("A2.2 container set and getChildren", () => {
  test("CONTAINER_NODE_TYPES = page, section, container + the five A2 containers + field + carousel", () => {
    expect([...CONTAINER_NODE_TYPES].sort()).toEqual(
      ["page", "section", "container", ...A2_CONTAINERS, "field", "carousel", "resizable"].sort(),
    );
    for (const t of A2_LEAVES) expect(isContainerType(t)).toBe(false);
    expect(A2_TYPES.filter((t) => isContainerType(t)).sort()).toEqual([...A2_CONTAINERS].sort());
  });

  test("getChildren returns the children of every container kind and [] for every leaf", () => {
    for (const [type, node] of oneOfEach()) {
      const want = isContainerType(type);
      const p = node.props as { children?: string[] };
      expect(Array.isArray(p.children)).toBe(want);
      expect(getChildren(node)).toEqual(want ? p.children! : []);
    }
    expect(kids(NEST, "card1")).toEqual(["alert1", "txt1"]);
    expect(kids(NEST, "btns")).toEqual(["b1", "b2"]);
  });

  test("Rust Node::children() names the same five kinds", () => {
    const m = DEFAULTS_RS.match(/pub fn children\(&self\)[\s\S]*?_ => &\[\]/);
    expect(m).not.toBeNull();
    const body = m![0];
    const rust = [...body.matchAll(/NodeProps::(\w+) \{ children/g)].map((x) => x[1]);
    const camel = (s: string) => s[0].toLowerCase() + s.slice(1);
    expect(rust.map(camel).sort()).toEqual([...CONTAINER_NODE_TYPES].sort());
  });
});

describe("A2.2 canInsertInto matrix", () => {
  test("every container kind accepts 0..len and refuses outside", () => {
    for (const t of [...A2_CONTAINERS, "container", "section", "page"] as const) {
      const d = clone(NEST);
      const id = Object.values(d.nodes).find((n) => n.type === t)!.id;
      const len = kids(d, id).length;
      for (let i = 0; i <= len; i++) expect(canInsertInto(d, id, i)).toBe(true);
      expect(canInsertInto(d, id, -1)).toBe(false);
      expect(canInsertInto(d, id, len + 1)).toBe(false);
    }
  });

  test("every non-container kind refuses children at index 0", () => {
    let checked = 0;
    for (const [type, node] of oneOfEach()) {
      if (isContainerType(type)) continue;
      const d = clone(NEST);
      d.nodes[node.id] = node;
      expect(canInsertInto(d, node.id, 0)).toBe(false);
      checked++;
    }
    expect(oneOfEach().size).toBe(63);
    expect(checked).toBe(52); // 63 kinds - 11 container kinds (resizable is a container)
  });

  test("locked card, locked page and missing parent refuse", () => {
    const d = clone(NEST);
    expect(canInsertInto(toggleNodeLocked(d, "card1")!, "card1", 0)).toBe(false);
    expect(canInsertInto(toggleNodeLocked(d, "root")!, "card1", 0)).toBe(false);
    expect(canInsertInto(d, "nope", 0)).toBe(false);
  });

  test("insertNode: heading into card / buttonGroup / scrollArea works; into badge is null", () => {
    for (const id of ["card1", "btns", "scroll1", "ratio1", "alert1"]) {
      const d = mini();
      const h = createNode("heading");
      const next = insertNode(d, h, id, 0)!;
      expect(next).not.toBeNull();
      expect(kids(next, id)[0]).toBe(h.id);
      expect(findParent(next, h.id)).toEqual({ parentId: id, index: 0 });
      expect(d.nodes[h.id]).toBeUndefined(); // original untouched (undo = previous doc)
    }
    const d = mini();
    expect(insertNode(d, createNode("heading"), "badge1", 0)).toBeNull();
  });
});

describe("A2.2 drop rules (canDropNode / moveNodeInDocument)", () => {
  test("drag a heading into a card: ok, one parent, undo = the previous document object", () => {
    const d = mini();
    expect(canDropNode(d, "hd", "card1", 0)).toBe(true);
    const next = moveNodeInDocument(d, "hd", "card1", 0)!;
    expect(kids(next, "card1")).toEqual(["hd", "alert1", "txt1"]);
    expect(kids(next, "grp")).toEqual(["badge1"]);
    expect(kids(d, "grp")).toEqual(["badge1", "hd"]);
  });

  test("drop into a leaf kind is refused for every leaf, any index", () => {
    const d = mini();
    for (const t of A2_LEAVES) {
      const leaf = Object.values(SEED.nodes).find((n) => n.type === t)!;
      const doc = clone(d);
      doc.nodes[leaf.id] = leaf;
      expect(canDropNode(doc, "hd", leaf.id, 0)).toBe(false);
      expect(moveNodeInDocument(doc, "hd", leaf.id, 0)).toBeNull();
    }
    expect(canDropNode(d, "hd", "badge1", 0)).toBe(false);
    expect(canDropNode(d, "hd", "b1", 0)).toBe(false);
  });

  test("a container cannot go into itself or any descendant, at any depth", () => {
    const d = mini();
    expect(canDropNode(d, "card1", "card1", 0)).toBe(false);
    for (const inner of ["alert1", "ratio1", "scroll1", "btns"]) {
      expect(isDescendant(d, "card1", inner)).toBe(true);
      expect(canDropNode(d, "card1", inner, 0)).toBe(false);
      expect(moveNodeInDocument(d, "card1", inner, 0)).toBeNull();
    }
    // but a descendant can move out to an ancestor or sibling container
    expect(canDropNode(d, "btns", "card1", 0)).toBe(true);
    expect(canDropNode(d, "card1", "grp", 0)).toBe(true);
  });

  test("move out of a card back to the page and reorder inside a card", () => {
    const d = mini();
    const out = moveNodeInDocument(d, "txt1", "root", 0)!;
    expect(kids(out, "root")[0]).toBe("txt1");
    expect(kids(out, "card1")).toEqual(["alert1"]);
    const re = moveNodeInDocument(d, "alert1", "card1", 2)!;
    expect(kids(re, "card1")).toEqual(["txt1", "alert1"]);
    // same slot is a no-op (refused, like container)
    expect(canDropNode(d, "alert1", "card1", 0)).toBe(false);
    expect(canDropNode(d, "alert1", "card1", 1)).toBe(false);
  });

  test("locked card / locked child / locked page refuse drops", () => {
    const d = mini();
    expect(canDropNode(toggleNodeLocked(d, "card1")!, "hd", "card1", 0)).toBe(false);
    expect(canDropNode(toggleNodeLocked(d, "hd")!, "hd", "card1", 0)).toBe(false);
    expect(canDropNode(toggleNodeLocked(d, "root")!, "hd", "card1", 0)).toBe(false);
  });

  test("the page root cannot move into a card", () => {
    expect(canDropNode(mini(), "root", "card1", 0)).toBe(false);
  });
});

describe("A2.2 palette-click target, delete, Layers tree", () => {
  test("a selected container (A2 kinds too) takes the new node inside; a leaf puts it after itself", () => {
    const d = mini();
    expect(resolveInsertTarget(d, "card1")).toEqual({ parentId: "card1", index: 2 });
    expect(resolveInsertTarget(d, "btns")).toEqual({ parentId: "btns", index: 2 });
    expect(resolveInsertTarget(d, "b1")).toEqual({ parentId: "btns", index: 1 });
    expect(resolveInsertTarget(d, "badge1")).toEqual({ parentId: "grp", index: 1 });
    expect(resolveInsertTarget(d, null)).toEqual({ parentId: "root", index: 3 });
  });

  test("removeNode on a card removes its whole subtree and selects the next sibling", () => {
    const d = mini();
    const res = removeNode(d, "card1")!;
    for (const id of ["card1", "alert1", "ratio1", "scroll1", "btns", "b1", "b2", "txt1"]) {
      expect(res.document.nodes[id]).toBeUndefined();
    }
    expect(kids(res.document, "sec")).toEqual([]);
    expect(res.nextSelectedId).toBe("sec");
    // a child of a card: next sibling, then previous, then the card
    expect(removeNode(d, "alert1")!.nextSelectedId).toBe("txt1");
    expect(removeNode(d, "txt1")!.nextSelectedId).toBe("alert1");
    const only = removeNode(removeNode(d, "txt1")!.document, "alert1")!;
    expect(only.nextSelectedId).toBe("card1");
  });

  test("flattenLayers nests the five containers by depth and skips a dangling id", () => {
    const d = mini();
    const rows = flattenLayers(d);
    const depth = Object.fromEntries(rows.map((r) => [r.id, r.depth]));
    expect(depth).toMatchObject({
      root: 0, sec: 1, card1: 2, alert1: 3, ratio1: 4, scroll1: 5, btns: 6, b1: 7, b2: 7, txt1: 3,
      grp: 1, badge1: 2, hd: 2, "dangle-card": 1,
    });
    expect(rows.some((r) => r.id === "ghost")).toBe(false);
    expect(rows.length).toBe(Object.keys(d.nodes).length);
    // order is depth-first in children order
    expect(rows.map((r) => r.id).slice(0, 6)).toEqual(["root", "sec", "card1", "alert1", "ratio1", "scroll1"]);
  });

  test("findParent works for children of every container kind; a dangling id has none", () => {
    const d = mini();
    expect(findParent(d, "alert1")).toEqual({ parentId: "card1", index: 0 });
    expect(findParent(d, "b2")).toEqual({ parentId: "btns", index: 1 });
    expect(findParent(d, "ghost")?.parentId).toBe("dangle-card"); // listed, though the node is absent
    expect(d.nodes["ghost"]).toBeUndefined();
    expect(removeNode(d, "dangle-card")!.document.nodes["dangle-card"]).toBeUndefined();
  });
});

describe("A2.2 layout props", () => {
  test("TS defaults equal the spec table", () => {
    expect(A2_LAYOUT_DEFAULTS.card).toEqual({ direction: "column", gap: 16, align: "stretch", justify: "start" });
    expect(A2_LAYOUT_DEFAULTS.alert).toEqual({ direction: "column", gap: 8, align: "stretch", justify: "start" });
    expect(A2_LAYOUT_DEFAULTS.buttonGroup).toEqual({ direction: "row", gap: 0, align: "stretch", justify: "start" });
    expect(A2_LAYOUT_DEFAULTS.aspectRatio.gap).toBe(0);
    expect(A2_LAYOUT_DEFAULTS.scrollArea.direction).toBe("column");
  });

  test("Rust a2_layout_defaults has the same values (text parity)", () => {
    const rs = DEFAULTS_RS.slice(DEFAULTS_RS.indexOf("pub fn a2_layout_defaults"));
    const body = rs.slice(0, rs.indexOf("\n}\n"));
    const row = (n: string) => body.match(new RegExp(`NodeType::${n}[^\\n]*Some\\(\\(Direction::(\\w+), (\\d+), Align::(\\w+), Justify::(\\w+)\\)\\)`))!;
    for (const [rustName, key] of [["Card", "card"], ["Alert", "alert"], ["ButtonGroup", "buttonGroup"]] as const) {
      const m = row(rustName);
      const d = A2_LAYOUT_DEFAULTS[key];
      expect([m[1].toLowerCase(), Number(m[2]), m[3].toLowerCase(), m[4].toLowerCase()]).toEqual([d.direction, d.gap, d.align, d.justify]);
    }
    const ar = body.match(/NodeType::AspectRatio \| NodeType::ScrollArea => Some\(\(Direction::(\w+), (\d+), Align::(\w+), Justify::(\w+)\)\)/)!;
    for (const key of ["aspectRatio", "scrollArea"] as const) {
      const d = A2_LAYOUT_DEFAULTS[key];
      expect([ar[1].toLowerCase(), Number(ar[2]), ar[3].toLowerCase(), ar[4].toLowerCase()]).toEqual([d.direction, d.gap, d.align, d.justify]);
    }
  });

  test("setNodeProp stores only values that differ from the kind's own default (card gap 16, alert 8, buttonGroup row)", () => {
    const d = mini();
    const set = (doc: PageDocument, id: string, k: "gap" | "direction" | "align" | "justify", v: string | number | undefined) =>
      setNodeProp(doc, id, k, v);
    const a = set(d, "card1", "gap", 16)!; // fixture has gap 4 → default clears the key
    expect("gap" in (a.nodes.card1.props as object)).toBe(false);
    expect(set(a, "card1", "gap", 16)).toBeNull(); // already default and absent
    const b = set(a, "card1", "gap", 24.4)!;
    expect((b.nodes.card1.props as { gap?: number }).gap).toBe(24);
    expect(set(b, "card1", "gap", undefined)).not.toBeNull();
    // buttonGroup default direction is row: "row" is not stored, "column" is
    const g = set(d, "btns", "direction", "row")!; // fixture has direction row → cleared
    expect("direction" in (g.nodes.btns.props as object)).toBe(false);
    const g2 = set(g, "btns", "direction", "column")!;
    expect((g2.nodes.btns.props as { direction?: string }).direction).toBe("column");
    // alert gap 8 is its default
    expect(set(d, "alert1", "gap", 8)).toBeNull();
    expect((set(d, "alert1", "gap", 0)!.nodes.alert1.props as { gap?: number }).gap).toBe(0);
    // negative gap clamps to 0; the container keeps its own default (gap 0)
    expect((set(d, "alert1", "gap", -5)!.nodes.alert1.props as { gap?: number }).gap).toBe(0);
    expect(set(d, "grp", "gap", 0)).toBeNull();
    // leaves ignore layout props
    expect(set(d, "badge1", "gap", 4)).toBeNull();
  });

  test("locked card refuses layout edits", () => {
    const d = toggleNodeLocked(mini(), "card1")!;
    expect(setNodeProp(d, "card1", "gap", 40)).toBeNull();
  });

  test("a nested document saves with its children and layout props intact", () => {
    const d = mini();
    const edited = setNodeProp(d, "ratio1", "gap", 12)!;
    const saved = documentForSave(edited) as PageDocument;
    expect(saved.version).toBe(4);
    expect(kids(saved, "card1")).toEqual(["alert1", "txt1"]);
    expect((saved.nodes.ratio1.props as { gap?: number; ratio: string }).gap).toBe(12);
    expect((saved.nodes.ratio1.props as { ratio: string }).ratio).toBe("16/9");
    expect(JSON.stringify(saved)).not.toContain("undefined");
  });
});
