/**
 * Phase 11 C7: capture paint-only preset from a node; layout keys stripped.
 */
import { describe, expect, test } from "bun:test";
import type { Node } from "@/schema";
import { capturePresetFromNode, capturePresetStyle } from "@/lib/preset-capture";
import { validatePreset } from "@/lib/presets-registry";
import { applyPreset } from "@/lib/document-ops";
import type { PageDocument } from "@/schema";

describe("C7 capturePresetFromNode", () => {
  test("keeps paint/effects; drops width/padding/fontSize", () => {
    const node: Node = {
      id: "b",
      type: "button",
      props: { type: "button", label: "x", action: "none" },
      style: {
        width: 200,
        padding: 12,
        fontSize: 16,
        backgroundColor: "#0369a1",
        color: "#ffffff",
        borderRadius: 12,
        transition: { durationMs: 120, delayMs: 0, easing: "ease-out", property: "paint" },
      },
      states: { hover: { opacity: 0.9 } },
    };
    const preset = capturePresetFromNode(node, "ของฉัน", "u-test")!;
    expect(preset.style.width).toBeUndefined();
    expect(preset.style.padding).toBeUndefined();
    expect(preset.style.fontSize).toBeUndefined();
    expect(preset.style.backgroundColor).toBe("#0369a1");
    expect(preset.style.borderRadius).toBe(12);
    expect(preset.states?.hover?.opacity).toBe(0.9);
    expect(preset.source).toEqual({ kind: "user" });
    expect(validatePreset(preset).errors).toEqual([]);
  });

  test("locked-irrelevant: capture still paint-only from style object", () => {
    const style = capturePresetStyle({
      margin: 8,
      height: 40,
      boxShadow: [{ x: 0, y: 2, blur: 4, spread: 0, color: "#00000033" }],
      color: "#111",
      backgroundColor: "#eee",
    });
    expect(style.margin).toBeUndefined();
    expect(style.height).toBeUndefined();
    expect(style.boxShadow).toBeTruthy();
  });

  test("saved preset applies to another node", () => {
    const src: Node = {
      id: "a",
      type: "card",
      props: { type: "card", children: [] },
      style: { backgroundColor: "#ffffff", color: "#0f172a", borderRadius: 16 },
    };
    const preset = capturePresetFromNode(src, "การ์ดขาว", "u-card")!;
    const doc: PageDocument = {
      version: 2,
      meta: { title: "c7" },
      root: "page",
      nodes: {
        page: {
          id: "page",
          type: "page",
          props: { type: "page", children: ["b"] },
          style: {},
        },
        b: {
          id: "b",
          type: "container",
          props: { type: "container", children: [] },
          style: { width: 300 },
        },
      },
    };
    const next = applyPreset(doc, "b", preset)!;
    expect(next.nodes.b!.style.backgroundColor).toBe("#ffffff");
    expect(next.nodes.b!.style.width).toBe(300);
  });
});
