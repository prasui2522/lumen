/**
 * Phase 11 C2: applyPreset merge semantics.
 */
import { describe, expect, test } from "bun:test";
import type { Node, PageDocument } from "@/schema";
import { applyPreset } from "@/lib/document-ops";
import {
  findPreset,
  loadBuiltInPresets,
  resetBuiltInPresetCache,
  type StylePreset,
} from "@/lib/presets-registry";

function docWith(node: Node): PageDocument {
  return {
    version: 2,
    meta: { title: "c2" },
    root: "page",
    nodes: {
      page: {
        id: "page",
        type: "page",
        props: { type: "page", children: [node.id] },
        style: {},
      },
      [node.id]: node,
    },
  };
}

describe("C2 applyPreset", () => {
  test("merges style + states; keeps other keys and breakpoints", async () => {
    resetBuiltInPresetCache();
    const preset = findPreset(await loadBuiltInPresets(), "button-3d")!;
    const before: Node = {
      id: "b",
      type: "button",
      props: { type: "button", label: "Go", href: "https://x.test", action: "link" },
      style: { width: 200, padding: 8, fontSize: 14 },
      styleBreakpoints: { phone: { fontSize: 12 } },
      states: { hover: { opacity: 0.9 } },
    };
    const next = applyPreset(docWith(before), "b", preset)!;
    const n = next.nodes.b!;
    expect(n.style.width).toBe(200);
    expect(n.style.padding).toBe(8);
    expect(n.style.fontSize).toBe(14);
    expect(n.style.backgroundColor).toBe("#0369a1");
    expect(n.style.color).toBe("#ffffff");
    expect(n.style.borderRadius).toBe(12);
    expect(n.styleBreakpoints?.phone?.fontSize).toBe(12);
    // Preset hover overwrites/merges paint; prior opacity kept if preset didn't set it.
    expect(n.states?.hover?.opacity).toBe(0.9);
    expect(n.states?.hover?.transform?.translateY).toBe(-1);
    expect(n.states?.active?.transform?.translateY).toBe(5);
  });

  test("locked → null; wrong kind → null", async () => {
    const preset = findPreset(await loadBuiltInPresets(), "button-3d")!;
    const locked = applyPreset(
      docWith({
        id: "b",
        type: "button",
        locked: true,
        props: { type: "button", label: "x", action: "none" },
        style: {},
      }),
      "b",
      preset,
    );
    expect(locked).toBeNull();

    const wrong = applyPreset(
      docWith({
        id: "t",
        type: "text",
        props: { type: "text", content: "hi" },
        style: {},
      }),
      "t",
      preset,
    );
    expect(wrong).toBeNull();
  });

  test("card-glass applies to card", async () => {
    const preset = findPreset(await loadBuiltInPresets(), "card-glass")!;
    const next = applyPreset(
      docWith({
        id: "c",
        type: "card",
        props: { type: "card", children: [] },
        style: {},
      }),
      "c",
      preset,
    );
    expect(next!.nodes.c!.style.backdropFilter?.blur).toBe(16);
    expect(next!.nodes.c!.style.backgroundColor).toBe("#ffffff2e");
  });

  test("idempotent second apply may no-op when already equal", async () => {
    const preset = findPreset(await loadBuiltInPresets(), "card-soft")!;
    const d0 = docWith({
      id: "c",
      type: "card",
      props: { type: "card", children: [] },
      style: {},
    });
    const d1 = applyPreset(d0, "c", preset)!;
    const d2 = applyPreset(d1, "c", preset);
    // Second apply with identical merge → null (no dirty).
    expect(d2).toBeNull();
  });
});

describe("C2 hostile preset refused by validator path", () => {
  test("apply still requires appliesTo even if forged", () => {
    const forged: StylePreset = {
      formatVersion: 1,
      id: "x",
      name: "x",
      nameEn: "x",
      category: "button",
      appliesTo: ["link"],
      style: { backgroundColor: "#000", color: "#fff" },
      source: { kind: "original" },
    };
    const out = applyPreset(
      docWith({
        id: "b",
        type: "button",
        props: { type: "button", label: "x", action: "none" },
        style: {},
      }),
      "b",
      forged,
    );
    expect(out).toBeNull();
  });
});
