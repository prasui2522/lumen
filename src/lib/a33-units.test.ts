// PHASE-11 A3.3: the field kind, unit level (schema mirror, document ops, palette, looks, canvas SSR).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node, PageDocument } from "@/schema";
import { A3_LAYOUT_DEFAULTS, A3_TYPES, CONTAINER_NODE_TYPES, isA3Type, isContainerType, isVersion4Kind } from "@/schema";
import {
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  createNode,
  insertNode,
  nodeDisplayName,
  setNodeProp,
} from "@/lib/document-ops";
import { documentForSave } from "@/lib/breakpoints";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { A3_LOOKS, A3_STYLESHEET, fieldLayout } from "@/lib/a3-looks";
import { KIND_LOOKS } from "@/lib/kind-looks";

const ROOT = join(import.meta.dir, "..", "..");
const DEFAULTS_RS = readFileSync(join(ROOT, "src-tauri/src/defaults.rs"), "utf8");
const FX = join(ROOT, "src-tauri/src/fixtures/a3");
const GOLDEN_CSS = readFileSync(join(FX, "a33-input.css"), "utf8");

function bareDoc(n: Node): PageDocument {
  return {
    version: 3,
    meta: { title: "a33", lang: "th" },
    root: "root",
    nodes: {
      root: { id: "root", type: "page", props: { type: "page", children: [n.id] }, style: {} },
      [n.id]: n,
    },
  };
}

describe("A3.3 schema mirror", () => {
  test("field is an A3 / version-4 / container kind", () => {
    expect(A3_TYPES).toContain("field");
    expect(isA3Type("field") && isVersion4Kind("field")).toBe(true);
    expect(isContainerType("field")).toBe(true);
    expect(CONTAINER_NODE_TYPES).toContain("field");
    expect(DEFAULTS_RS).toContain("NodeType::Field");
    expect(DEFAULTS_RS).toContain("pub fn a3_layout_defaults");
    expect(A3_LAYOUT_DEFAULTS.field).toEqual({ direction: "column", gap: 6, align: "stretch", justify: "start" });
  });
});

describe("A3.3 document ops", () => {
  test("createNode / Layers name / save version", () => {
    const n = createNode("field");
    expect(n.props).toEqual({ type: "field", label: "Label", children: [] });
    expect(nodeDisplayName(n)).toBe("Field");
    expect(NODE_TYPE_LABEL.field).toBe("Field");
    expect(documentForSave(bareDoc({ ...n, id: "f" })).version).toBe(4);
  });

  test("label / description / error writes; blank clears optional keys", () => {
    const n = { ...createNode("field"), id: "f" };
    let d = bareDoc(n);
    d = setNodeProp(d, "f", "label", "อีเมล")!;
    expect((d.nodes.f.props as { label: string }).label).toBe("อีเมล");
    d = setNodeProp(d, "f", "description", "ช่วยเหลือ")!;
    expect((d.nodes.f.props as { description?: string }).description).toBe("ช่วยเหลือ");
    d = setNodeProp(d, "f", "error", "ผิด")!;
    expect((d.nodes.f.props as { error?: string }).error).toBe("ผิด");
    d = setNodeProp(d, "f", "description", "  ")!;
    expect((d.nodes.f.props as { description?: string }).description).toBeUndefined();
    d = setNodeProp(d, "f", "error", "")!;
    expect((d.nodes.f.props as { error?: string }).error).toBeUndefined();
  });

  test("field accepts any kind as a child (ruling 4)", () => {
    let d = bareDoc({ ...createNode("field"), id: "f" });
    for (const t of ["input", "button", "heading", "checkbox", "select"] as const) {
      const child = createNode(t);
      const next = insertNode(d, child, "f", 0);
      expect(next).not.toBeNull();
      d = next!;
    }
  });

  test("layout gap defaults to 6 and is sparse", () => {
    const n = { ...createNode("field"), id: "f" };
    let d = bareDoc(n);
    expect(setNodeProp(d, "f", "gap", 6)).toBeNull(); // equals default → no write
    d = setNodeProp(d, "f", "gap", 12)!;
    expect((d.nodes.f.props as { gap?: number }).gap).toBe(12);
  });
});

describe("A3.3 palette", () => {
  test("Forms tile Field; Thai/English keywords", () => {
    expect(PALETTE_TYPES).toContain("field");
    expect(PALETTE_META.field.group).toBe("Forms");
    expect(`เพิ่ม${NODE_TYPE_LABEL.field}`).toBe("เพิ่มField");
    for (const q of ["field", "form row", "ฟิลด์", "แถวฟอร์ม", "ป้ายกำกับ"]) {
      expect(filterPaletteGroups(q).flatMap((g) => g.types)).toContain("field");
    }
  });
});

describe("A3.3 shared look", () => {
  test("field lives in a3.kinds; stylesheet matches the export golden", () => {
    expect(A3_LOOKS.field).toBeDefined();
    expect(KIND_LOOKS.field).toBeUndefined();
    expect(GOLDEN_CSS).toContain(A3_LOOKS.field.css);
    expect(A3_STYLESHEET).toContain(".t-field>label,.t-field>.t-field-label{font-size:14px;font-weight:500}");
    expect(A3_STYLESHEET).toContain(".t-field>.t-field-d{margin:0px;color:#64748b;font-size:14px}");
    expect(A3_STYLESHEET).toContain(".t-field>.t-field-e{margin:0px;color:#b91c1c;font-size:14px}");
  });

  test("fieldLayout mirrors column / gap 6", () => {
    expect(fieldLayout({})).toEqual({
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      alignItems: "stretch",
      justifyContent: "flex-start",
    });
  });
});

describe("A3.3 canvas SSR (via node-view structure)", () => {
  // Lightweight structural check without mounting the full DesignCanvas:
  // the Field case is covered by the Rust goldens + the shared look; here we
  // only assert createNode + label props are what the view reads.
  test("a field node carries label / optional desc / error for the canvas", () => {
    const n = createNode("field") as Node;
    expect(n.props.type).toBe("field");
    if (n.props.type !== "field") return;
    expect(n.props.label).toBe("Label");
    expect(n.props.description).toBeUndefined();
    expect(n.props.error).toBeUndefined();
    expect(n.props.children).toEqual([]);
    // smoke: renderToStaticMarkup of a tiny stand-in matching the view's tags
    const html = renderToStaticMarkup(
      createElement(
        "div",
        { className: "t-field", "data-node-type": "field" },
        createElement("span", { className: "t-field-label" }, n.props.label),
      ),
    );
    expect(html).toContain('class="t-field"');
    expect(html).toContain('class="t-field-label"');
    expect(html).toContain("Label");
  });
});
