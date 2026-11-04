// PHASE-11 A5.1: carousel kind — schema mirror, createNode, props, palette, canvas SSR.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node, PageDocument } from "@/schema";
import {
  A5_LAYOUT_DEFAULTS,
  A5_TYPES,
  DEFAULT_STYLES,
  isA5Type,
  isContainerType,
  isVersion4Kind,
} from "@/schema";
import {
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  createNode,
  insertNode,
  setNodeProp,
} from "@/lib/document-ops";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { documentForSave } from "@/lib/breakpoints";
import { a5Section, slideBasis } from "@/lib/a5-looks";
import looks from "@/lib/kind-looks.json";
import { CarouselView } from "@/components/editor/a5-view";

const RS = join(import.meta.dir, "..", "..", "src-tauri", "src");
const DEFAULTS_RS = readFileSync(join(RS, "defaults.rs"), "utf8");

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a51", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};
const car = (): Node => ({ ...createNode("carousel"), id: "c" });

describe("A5.1 schema mirror", () => {
  test("A5_TYPES = Rust is_a5_kind; version-4 marker; container", () => {
    const body = DEFAULTS_RS.slice(DEFAULTS_RS.indexOf("pub fn is_a5_kind(t: NodeType) -> bool {"));
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::Carousel");
    expect([...A5_TYPES]).toEqual(["carousel", "chart", "calendar"]);
    expect(isA5Type("carousel") && isVersion4Kind("carousel")).toBe(true);
    expect(isContainerType("carousel")).toBe(true);
    expect(documentForSave(doc1(car())).version).toBe(4);
  });
  test("DEFAULT_STYLES + A5_LAYOUT_DEFAULTS", () => {
    expect(DEFAULT_STYLES.carousel).toEqual({ display: "flex", width: "100%" });
    expect(A5_LAYOUT_DEFAULTS.carousel).toEqual({
      direction: "row",
      gap: 16,
      align: "stretch",
      justify: "start",
    });
  });
});

describe("A5.1 document ops + palette", () => {
  test("createNode defaults; Layers English name", () => {
    const n = car();
    expect(n.props).toEqual({ type: "carousel", children: [] });
    expect(NODE_TYPE_LABEL.carousel).toBe("Carousel");
    expect(PALETTE_TYPES.includes("carousel")).toBe(true);
    expect(PALETTE_META.carousel.group).toBe("Data");
    expect(filterPaletteGroups("แกลเลอรี").some((g) => g.types.includes("carousel"))).toBe(true);
  });

  test("setNodeProp slidesPerView clamps 1–4; 1 is sparse", () => {
    let d = doc1(car());
    d = setNodeProp(d, "c", "slidesPerView", 3)!;
    expect((d.nodes.c!.props as { slidesPerView?: number }).slidesPerView).toBe(3);
    d = setNodeProp(d, "c", "slidesPerView", 9)!;
    expect((d.nodes.c!.props as { slidesPerView?: number }).slidesPerView).toBe(4);
    d = setNodeProp(d, "c", "slidesPerView", 1)!;
    expect((d.nodes.c!.props as { slidesPerView?: number }).slidesPerView).toBeUndefined();
  });
});

describe("A5.1 looks + canvas", () => {
  test("a5 section + slideBasis maths", () => {
    const a5 = a5Section(looks);
    expect(a5.kinds.carousel.css.join("")).toContain(".t-carousel");
    expect(slideBasis(1, 16)).toBe("calc((100% - 0px) / 1)");
    expect(slideBasis(2, 16)).toBe("calc((100% - 16px) / 2)");
    expect(slideBasis(3, 8)).toBe("calc((100% - 16px) / 3)");
  });

  test("CarouselView SSR: region + slide wrappers", () => {
    const node: Node = {
      id: "c",
      type: "carousel",
      props: { type: "carousel", children: ["a", "b"], slidesPerView: 2, gap: 16 },
      style: {},
    };
    const html = renderToStaticMarkup(
      createElement(CarouselView, {
        node,
        handlers: {},
        style: DEFAULT_STYLES.carousel,
        renderChild: (id: string) => createElement("span", { key: id }, id),
      }),
    );
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain("t-carousel__slide");
    expect(html).toContain("calc((100% - 16px) / 2)");
  });
});
