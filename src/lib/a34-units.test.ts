// PHASE-11 A3.4: select is the native select (relabel + T22 options editor); no new kind.
import { describe, expect, test } from "bun:test";
import { createNode, NODE_TYPE_LABEL, setPhase6bProp } from "@/lib/document-ops";
import type { Node, PageDocument } from "@/schema";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { formatSelectOptions, MAX_SELECT_OPTIONS, parseSelectOptions } from "@/lib/select-options";

function bareDoc(n: Node): PageDocument {
  return {
    version: 1,
    meta: { title: "a34", lang: "th" },
    root: "root",
    nodes: {
      root: { id: "root", type: "page", props: { type: "page", children: [n.id] }, style: {} },
      [n.id]: n,
    },
  };
}

describe("A3.4 select relabel + palette", () => {
  test("tile is Native Select; Native Select / select / Thai synonyms find it", () => {
    expect(NODE_TYPE_LABEL.select).toBe("Native Select");
    expect(`เพิ่ม${NODE_TYPE_LABEL.select}`).toBe("เพิ่มNative Select");
    expect(PALETTE_META.select.group).toBe("Forms");
    expect(PALETTE_META.select.keywords).toContain("native select");
    for (const q of ["Native Select", "native select", "select", "dropdown", "เลือก", "เนทีฟ"]) {
      expect(filterPaletteGroups(q).flatMap((g) => g.types)).toContain("select");
    }
  });

  test("no nativeSelect kind exists on the wire", () => {
    expect(NODE_TYPE_LABEL).not.toHaveProperty("nativeSelect");
    const n = createNode("select");
    expect(n.props).toEqual({ type: "select", value: "One", options: ["One", "Two"] });
  });
});

describe("A3.4 T22 options lines", () => {
  test("parse / format round-trip; trailing blank dropped; cap 100", () => {
    expect(parseSelectOptions("One\nTwo\n")).toEqual(["One", "Two"]);
    expect(parseSelectOptions("A\n\nB")).toEqual(["A", "", "B"]);
    expect(formatSelectOptions(["One", "Two"])).toBe("One\nTwo");
    const many = Array.from({ length: 120 }, (_, i) => `o${i + 1}`);
    expect(parseSelectOptions(many.join("\n"))).toHaveLength(MAX_SELECT_OPTIONS);
    expect(MAX_SELECT_OPTIONS).toBe(100);
  });

  test("setPhase6bProp options replaces the list and caps at 100 (select and radio)", () => {
    const sel = { ...createNode("select"), id: "s" };
    let d = bareDoc(sel);
    d = setPhase6bProp(d, "s", { kind: "options", value: ["แดง", "เขียว", "A & B"] })!;
    expect((d.nodes.s.props as { options: string[] }).options).toEqual(["แดง", "เขียว", "A & B"]);
    const over = Array.from({ length: 105 }, (_, i) => `x${i}`);
    d = setPhase6bProp(d, "s", { kind: "options", value: over })!;
    expect((d.nodes.s.props as { options: string[] }).options).toHaveLength(100);
    expect((d.nodes.s.props as { options: string[] }).options[99]).toBe("x99");

    const radio = { ...createNode("radio"), id: "r" };
    let rd = bareDoc(radio);
    rd = setPhase6bProp(rd, "r", { kind: "options", value: ["a", "b", "c"] })!;
    expect((rd.nodes.r.props as { options: string[] }).options).toEqual(["a", "b", "c"]);
  });

  test("same options is a no-op", () => {
    const sel = { ...createNode("select"), id: "s" };
    const d = bareDoc(sel);
    expect(setPhase6bProp(d, "s", { kind: "options", value: ["One", "Two"] })).toBeNull();
  });
});
