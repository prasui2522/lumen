/**
 * B7.1 (§4.3 / §9.B): Node.states data model — allowlist, clean, version tier 2.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import type { Node, PageDocument } from "@/schema";
import { STATE_PAINT_KEYS } from "@/schema";
import { cleanStates, documentForSave } from "@/lib/breakpoints";
import { setNodeStateStyle, setNodeStates } from "@/lib/document-ops";

const DEFAULTS_RS = readFileSync(
  join(import.meta.dir, "../../src-tauri/src/defaults.rs"),
  "utf8",
);

function baseDoc(overrides?: Partial<Node>): PageDocument {
  const n: Node = {
    id: "n1",
    type: "button",
    props: { type: "button", label: "Go", action: "none" },
    style: {},
    ...overrides,
  };
  return {
    version: 1,
    meta: { title: "t" },
    root: "page",
    nodes: {
      page: {
        id: "page",
        type: "page",
        props: { type: "page", children: ["n1"] },
        style: {},
      },
      n1: n,
    },
  };
}

describe("B7.1 STATE_PAINT_KEYS + Rust parity", () => {
  test("10 paint keys; Rust has NodeStates + StateStyle", () => {
    expect(STATE_PAINT_KEYS).toEqual([
      "backgroundColor",
      "color",
      "borderColor",
      "opacity",
      "boxShadow",
      "backgroundGradient",
      "textGradient",
      "filter",
      "backdropFilter",
      "transform",
    ]);
    expect(DEFAULTS_RS).toContain("pub struct NodeStates");
    expect(DEFAULTS_RS).toContain("pub struct StateStyle");
    expect(DEFAULTS_RS).toContain("pub states: Option<NodeStates>");
    expect(DEFAULTS_RS).toContain("focus_visible");
  });
});

describe("B7.1 setNodeStates / setNodeStateStyle", () => {
  test("allowlist only; width refused; locked → null", () => {
    const doc = baseDoc();
    const ok = setNodeStateStyle(doc, "n1", "hover", "backgroundColor", "#38bdf8");
    expect(ok!.nodes["n1"]!.states?.hover?.backgroundColor).toBe("#38bdf8");

    // Non-paint key is not a StatePaintKey at the type level; cast to probe runtime.
    const bad = setNodeStateStyle(
      doc,
      "n1",
      "hover",
      "width" as unknown as "color",
      10 as never,
    );
    expect(bad).toBeNull();

    const locked = setNodeStates(baseDoc({ locked: true }), "n1", {
      hover: { color: "#fff" },
    });
    expect(locked).toBeNull();
  });

  test("clearing last key removes state object and states", () => {
    let doc = setNodeStateStyle(baseDoc(), "n1", "hover", "opacity", 0.8)!;
    expect(doc.nodes["n1"]!.states?.hover).toEqual({ opacity: 0.8 });
    doc = setNodeStateStyle(doc, "n1", "hover", "opacity", undefined)!;
    expect(doc.nodes["n1"]!.states).toBeUndefined();
  });

  test("cleanStates drops empty / non-paint residue", () => {
    expect(
      cleanStates({
        hover: { backgroundColor: "#111", width: 10 } as never,
        active: {},
      }),
    ).toEqual({ hover: { backgroundColor: "#111" } });
    expect(cleanStates({ hover: { backgroundGradient: { stops: [] } } })).toBeUndefined();
  });
});

describe("B7.1 version tier 2", () => {
  test("save of a doc with only states → version 2", () => {
    const withStates = setNodeStateStyle(baseDoc(), "n1", "active", "color", "#000")!;
    const saved = documentForSave(withStates);
    expect(saved.version).toBe(2);
    expect(saved.nodes["n1"]!.states?.active?.color).toBe("#000");
  });

  test("empty states stripped on save; version stays 1", () => {
    const empty = {
      ...baseDoc(),
      nodes: {
        ...baseDoc().nodes,
        n1: { ...baseDoc().nodes["n1"]!, states: { hover: {} } },
      },
    };
    const saved = documentForSave(empty);
    expect(saved.nodes["n1"]!.states).toBeUndefined();
    expect(saved.version).toBe(1);
  });
});
