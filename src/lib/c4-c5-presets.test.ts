/**
 * Phase 11 C4–C5: built-in apply coverage + contrast + B9.1 structure for button-3d.
 */
import { describe, expect, test } from "bun:test";
import type { Node, NodeType, PageDocument } from "@/schema";
import { applyPreset } from "@/lib/document-ops";
import { meetsTextContrast } from "@/lib/color-contrast";
import {
  findPreset,
  loadBuiltInPresets,
  resetBuiltInPresetCache,
} from "@/lib/presets-registry";
import { boxShadowToCss, styleToCss, transformToCss } from "@/lib/style-css";

function stubNode(type: NodeType, id = "n"): Node {
  const base = { id, type, style: {} as Node["style"] };
  switch (type) {
    case "button":
      return {
        ...base,
        type: "button",
        props: { type: "button", label: "กด", href: "https://x.test", action: "link" },
      };
    case "link":
      return {
        ...base,
        type: "link",
        props: { type: "link", label: "ไป", href: "https://x.test" },
      };
    case "container":
      return { ...base, type: "container", props: { type: "container", children: [] } };
    case "card":
      return { ...base, type: "card", props: { type: "card", children: [] } };
    case "section":
      return { ...base, type: "section", props: { type: "section", children: [] } };
    default:
      throw new Error(`stub not defined for ${type}`);
  }
}

function docWith(node: Node): PageDocument {
  return {
    version: 2,
    meta: { title: "c4" },
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

describe("C4 button-3d / card-glass", () => {
  test("button-3d CSS shape matches B9.1 structure with preset values", async () => {
    resetBuiltInPresetCache();
    const preset = findPreset(await loadBuiltInPresets(), "button-3d")!;
    const next = applyPreset(docWith(stubNode("button")), "n", preset)!;
    const n = next.nodes.n!;
    const base = styleToCss(n.style);
    expect(base.backgroundColor).toBe("#0369a1");
    expect(base.color).toBe("#ffffff");
    expect(String(base.borderRadius)).toMatch(/12/);
    expect(boxShadowToCss(n.style.boxShadow)).toBe(
      "0px 6px 0px 0px #0c4a6e, 0px 10px 12px 0px #00000033",
    );
    expect(String(base.transitionDuration)).toMatch(/120/);
    expect(base.transitionTimingFunction).toBe("ease-out");
    expect(transformToCss(n.states!.hover!.transform)).toBe("translate(0px, -1px)");
    expect(n.states!.hover!.filter?.brightness).toBe(108);
    expect(transformToCss(n.states!.active!.transform)).toBe("translate(0px, 5px)");
    expect(boxShadowToCss(n.states!.active!.boxShadow)).toBe(
      "0px 1px 0px 0px #0c4a6e, 0px 2px 4px 0px #00000033",
    );
  });

  test("card-glass applies + keeps T133 note on preset", async () => {
    const preset = findPreset(await loadBuiltInPresets(), "card-glass")!;
    expect(preset.note).toContain("พื้นหลัง");
    for (const type of preset.appliesTo) {
      const next = applyPreset(docWith(stubNode(type)), "n", preset)!;
      expect(next.nodes.n!.style.backdropFilter?.blur).toBe(16);
      expect(next.nodes.n!.style.backdropFilter?.saturate).toBe(140);
    }
  });
});

describe("C5 card-soft / button-gradient / outline-glow", () => {
  test("each built-in applies to every kind in appliesTo", async () => {
    const list = await loadBuiltInPresets();
    for (const preset of list) {
      for (const type of preset.appliesTo) {
        const next = applyPreset(docWith(stubNode(type)), "n", preset);
        expect(next, `${preset.id} → ${type}`).not.toBeNull();
      }
    }
  });

  test("opaque text contrast ≥ 4.5:1 (base + state colour overrides)", async () => {
    const list = await loadBuiltInPresets();
    for (const p of list) {
      if (p.id === "card-glass") continue;
      if (p.id === "button-gradient") {
        expect(meetsTextContrast("#ffffff", "#0369a1")).toBe(true);
        expect(meetsTextContrast("#ffffff", "#4338ca")).toBe(true);
        continue;
      }
      if (p.id === "outline-glow") {
        // Transparent bg — text colour must still be a solid paint for UI chrome.
        expect(p.style.color).toBe("#0369a1");
        continue;
      }
      const bg = p.style.backgroundColor!;
      const fg = p.style.color!;
      expect(meetsTextContrast(fg, bg), p.id).toBe(true);
      if (p.states) {
        for (const st of Object.values(p.states)) {
          if (!st) continue;
          const sBg = st.backgroundColor ?? bg;
          const sFg = st.color ?? fg;
          if (sBg === "transparent") continue;
          expect(meetsTextContrast(sFg, sBg), `${p.id} state`).toBe(true);
        }
      }
    }
  });

  test("card-soft / button-gradient / outline-glow key values", async () => {
    const soft = findPreset(await loadBuiltInPresets(), "card-soft")!;
    const softNode = applyPreset(docWith(stubNode("card")), "n", soft)!.nodes.n!;
    expect(softNode.style.backgroundColor).toBe("#ffffff");
    expect(softNode.style.borderRadius).toBe(16);

    const grad = findPreset(await loadBuiltInPresets(), "button-gradient")!;
    const gNode = applyPreset(docWith(stubNode("link")), "n", grad)!.nodes.n!;
    expect(gNode.style.backgroundGradient).toBeTruthy();
    expect(gNode.style.color).toBe("#ffffff");
    expect(gNode.states?.hover?.filter?.brightness).toBe(108);

    const glow = findPreset(await loadBuiltInPresets(), "outline-glow")!;
    const oNode = applyPreset(docWith(stubNode("container")), "n", glow)!.nodes.n!;
    expect(oNode.style.backgroundColor).toBe("transparent");
    expect(oNode.style.borderWidth).toBe(2);
    expect(oNode.style.borderColor).toBe("#0369a1");
    expect(oNode.states?.hover?.boxShadow).toBeTruthy();
    expect(oNode.states?.focusVisible).toBeTruthy();
  });
});
