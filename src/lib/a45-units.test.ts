// PHASE-11 A4.5: icon kind — schema mirror, createNode, props, palette, canvas SSR.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node, PageDocument } from "@/schema";
import { A4_TYPES, DEFAULT_STYLES, isA4Type, isVersion4Kind } from "@/schema";
import {
  ICON_DEFAULT_NAME,
  ICON_DEFAULT_SIZE,
  ICON_DEFAULT_STROKE,
  ICON_MAX_SIZE,
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  createNode,
  insertNode,
  setNodeProp,
} from "@/lib/document-ops";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { documentForSave } from "@/lib/breakpoints";
import { ICON_NAMES, iconSvgMarkup } from "@/lib/icon-paths";
import { IconGlyph } from "@/components/editor/icon-paths";

const RS = join(import.meta.dir, "..", "..", "src-tauri", "src");
const DEFAULTS_RS = readFileSync(join(RS, "defaults.rs"), "utf8");

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a45", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};
const icn = (): Node => ({ ...createNode("icon"), id: "i" });

describe("A4.5 schema mirror", () => {
  test("A4_TYPES includes icon; version-4 marker", () => {
    const body = DEFAULTS_RS.slice(DEFAULTS_RS.indexOf("pub fn is_a4_kind(t: NodeType) -> bool {"));
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::Icon");
    expect([...A4_TYPES]).toEqual(["list", "table", "icon"]);
    expect(isA4Type("icon") && isVersion4Kind("icon")).toBe(true);
    expect(documentForSave(doc1(icn())).version).toBe(4);
  });
  test("Rust NodeProps::Icon + DEFAULT_STYLES.icon", () => {
    expect(DEFAULTS_RS).toContain("NodeType::Icon => StyleProps {");
    expect(DEFAULTS_RS).toContain("stroke_width: f64");
    expect(DEFAULT_STYLES.icon).toEqual({
      display: "inline-block",
      margin: 0,
      padding: 0,
      color: "#0f172a",
    });
  });
});

describe("A4.5 document ops + palette", () => {
  test("createNode defaults; Layers English name", () => {
    const n = icn();
    expect(n.props).toEqual({
      type: "icon",
      name: ICON_DEFAULT_NAME,
      size: ICON_DEFAULT_SIZE,
      strokeWidth: ICON_DEFAULT_STROKE,
    });
    expect(NODE_TYPE_LABEL.icon).toBe("Icon");
    expect(PALETTE_TYPES.includes("icon")).toBe(true);
    expect(PALETTE_META.icon.group).toBe("Text & media");
    expect(filterPaletteGroups("ดาว").some((g) => g.types.includes("icon"))).toBe(true);
  });

  test("setNodeProp name/label/size/stroke; clamps", () => {
    let d = doc1(icn());
    d = setNodeProp(d, "i", "name", "heart")!;
    expect((d.nodes.i!.props as { name: string }).name).toBe("heart");
    d = setNodeProp(d, "i", "label", "หัวใจ")!;
    expect((d.nodes.i!.props as { label?: string }).label).toBe("หัวใจ");
    d = setNodeProp(d, "i", "label", "  ")!;
    expect((d.nodes.i!.props as { label?: string }).label).toBeUndefined();
    d = setNodeProp(d, "i", "size", 999)!;
    expect((d.nodes.i!.props as { size: number }).size).toBe(ICON_MAX_SIZE);
    d = setNodeProp(d, "i", "strokeWidth", 0.25)!;
    expect((d.nodes.i!.props as { strokeWidth: number }).strokeWidth).toBe(1);
  });
});

describe("A4.5 glyph SSR", () => {
  test("decorative vs labelled; colour via currentColor", () => {
    const deco = renderToStaticMarkup(
      createElement(IconGlyph, { name: "star", size: 24, strokeWidth: 2 }),
    );
    expect(deco).toContain('aria-hidden="true"');
    expect(deco).not.toContain("role=");
    expect(deco).toContain("stroke=\"currentColor\"");
    expect(deco).toContain("<path ");

    const lab = renderToStaticMarkup(
      createElement(IconGlyph, {
        name: "check",
        size: 32,
        strokeWidth: 1.5,
        label: "ok",
      }),
    );
    expect(lab).toContain('role="img"');
    expect(lab).toContain('aria-label="ok"');
    expect(lab).not.toContain("aria-hidden");

    const markup = iconSvgMarkup("star", { label: "" });
    expect(markup).toContain('aria-hidden="true"');
    expect(ICON_NAMES).toContain("star");
  });
});
