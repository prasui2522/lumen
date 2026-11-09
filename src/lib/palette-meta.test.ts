import { describe, expect, test } from "bun:test";
import { NODE_TYPE_LABEL, PALETTE_TYPES, createNode } from "@/lib/document-ops";
import {
  PALETTE_GROUPS,
  PALETTE_META,
  countPaletteMatches,
  filterPaletteGroups,
  paletteGroups,
  paletteMatches,
} from "@/lib/palette-meta";

describe("palette meta (A1.1)", () => {
  test("every palette type has exactly one group and appears exactly once (62 tiles, none lost)", () => {
    expect(PALETTE_TYPES.length).toBe(62);
    const flat = paletteGroups().flatMap((g) => g.types);
    expect([...flat].sort()).toEqual([...PALETTE_TYPES].sort());
    expect(new Set(flat).size).toBe(62);
    for (const t of PALETTE_TYPES) expect(PALETTE_GROUPS).toContain(PALETTE_META[t].group);
    expect(Object.keys(PALETTE_META).length).toBe(62);
  });

  test("group headings are the spec's eight, in order, none empty", () => {
    expect(paletteGroups().map((g) => g.heading)).toEqual([...PALETTE_GROUPS]);
  });

  test("keywords: btn / ปุ่ม / modal", () => {
    expect(filterPaletteGroups("btn").flatMap((g) => g.types)).toContain("button");
    expect(filterPaletteGroups("ปุ่ม").flatMap((g) => g.types)).toContain("button");
    const modal = filterPaletteGroups("modal").flatMap((g) => g.types);
    expect(modal).toContain("dialog");
    expect(modal).toContain("alertDialog");
  });

  test("label, schema id and case/whitespace", () => {
    expect(paletteMatches("hoverCard", "HOVER")).toBe(true);
    expect(paletteMatches("hoverCard", "  hover   card ")).toBe(true);
    expect(paletteMatches("hoverCard", "hoverCard")).toBe(true);
    expect(paletteMatches("button", "dialog")).toBe(false);
    expect(paletteMatches("button", NODE_TYPE_LABEL.button)).toBe(true);
  });

  test("blank query matches all; nonsense matches none", () => {
    expect(countPaletteMatches("")).toBe(62);
    expect(countPaletteMatches("   ")).toBe(62);
    expect(countPaletteMatches("zzzzqq")).toBe(0);
  });

  test("every tile is findable by its own label", () => {
    for (const t of PALETTE_TYPES) expect(paletteMatches(t, NODE_TYPE_LABEL[t])).toBe(true);
  });
  test("marker is not found by pin / map / location (misleading); PIN still finds the OTP input", () => {
    for (const q of ["pin", "map", "location", "หมุด", "แผนที่", "ตำแหน่ง"]) {
      expect(paletteMatches("marker", q)).toBe(false);
    }
    expect(paletteMatches("inputOtp", "pin")).toBe(true);
    expect(paletteMatches("marker", "marker")).toBe(true);
  });

  test("A1.5: switch tile is labelled Switch; 'checkbox', 'check', 'switch', 'สวิตช์' all find it", () => {
    expect(NODE_TYPE_LABEL.switch).toBe("Switch");
    expect(NODE_TYPE_LABEL.switch).not.toBe("Checkbox");
    for (const q of ["checkbox", "Checkbox", "check", "switch", "สวิตช์"]) {
      expect(filterPaletteGroups(q).flatMap((g) => g.types)).toContain("switch");
    }
    expect(PALETTE_META.switch.keywords).toContain("checkbox");
  });

  test("A1.5: exactly one of the 41 original tile labels changed (A2.5 adds nine more) (switch: Checkbox -> Switch); new switch default label is 'Switch' (A3.2)", () => {
    const labels = PALETTE_TYPES.map((t) => NODE_TYPE_LABEL[t]);
    expect(labels.length).toBe(62);
    // A3.1: "Checkbox" is now the real checkbox kind's tile, never the switch's
    expect(labels.filter((l) => l === "Checkbox").length).toBe(1);
    expect(NODE_TYPE_LABEL.checkbox).toBe("Checkbox");
    expect(labels.filter((l) => l === "Switch").length).toBe(1);
    const n = createNode("switch");
    expect(n.props).toEqual({ type: "switch", label: "Switch", checked: false }); // A3.2: new nodes only
  });
});
