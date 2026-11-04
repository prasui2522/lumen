// PHASE-11 A3.5: input.suggestions (sparse) → panel T23 + export datalist.
import { describe, expect, test } from "bun:test";
import { createNode, setInputSuggestions } from "@/lib/document-ops";
import type { Node, PageDocument } from "@/schema";
import { formatSelectOptions, MAX_SELECT_OPTIONS, parseSelectOptions } from "@/lib/select-options";

function bareDoc(n: Node): PageDocument {
  return {
    version: 1,
    meta: { title: "a35", lang: "th" },
    root: "root",
    nodes: {
      root: { id: "root", type: "page", props: { type: "page", children: [n.id] }, style: {} },
      [n.id]: n,
    },
  };
}

describe("A3.5 input.suggestions", () => {
  test("createNode omits suggestions (sparse)", () => {
    const n = createNode("input");
    expect(n.props).toEqual({ type: "input", label: "", placeholder: "พิมพ์ที่นี่" });
    expect((n.props as { suggestions?: string[] }).suggestions).toBeUndefined();
  });

  test("setInputSuggestions writes, caps at 100, clears to absent", () => {
    const n = { ...createNode("input"), id: "in" };
    let d = bareDoc(n);
    d = setInputSuggestions(d, "in", ["ก", "A & B"])!;
    expect((d.nodes.in.props as { suggestions?: string[] }).suggestions).toEqual(["ก", "A & B"]);
    expect(setInputSuggestions(d, "in", ["ก", "A & B"])).toBeNull();
    const over = Array.from({ length: 105 }, (_, i) => `s${i}`);
    d = setInputSuggestions(d, "in", over)!;
    expect((d.nodes.in.props as { suggestions: string[] }).suggestions).toHaveLength(MAX_SELECT_OPTIONS);
    d = setInputSuggestions(d, "in", [])!;
    expect((d.nodes.in.props as { suggestions?: string[] }).suggestions).toBeUndefined();
    expect(JSON.stringify(d.nodes.in.props)).not.toContain("suggestions");
  });

  test("T23 lines reuse the select parser (one per line)", () => {
    expect(parseSelectOptions("a\nb\n")).toEqual(["a", "b"]);
    expect(formatSelectOptions(["a", "b"])).toBe("a\nb");
  });

  test("non-input refuses", () => {
    const n = { ...createNode("button"), id: "b" };
    expect(setInputSuggestions(bareDoc(n), "b", ["x"])).toBeNull();
  });
});
