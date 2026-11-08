/**
 * Phase 11 D2: insertBlock id remapping + locked refusal.
 */
import { describe, expect, test } from "bun:test";
import type { PageDocument } from "@/schema";
import { insertBlock, materialiseBlock } from "@/lib/block-insert";
import type { StyleBlock } from "@/lib/block-format";

const pageBlock: StyleBlock = {
  formatVersion: 1,
  id: "hero-simple",
  category: "hero",
  scope: "page",
  name: "ฮีโร่",
  nameEn: "Hero",
  keywords: [],
  source: { kind: "original" },
  thumb: [{ x: 0, y: 0, w: 100, h: 40, tone: "fill" }],
  root: "r",
  nodes: {
    r: {
      type: "section",
      props: { type: "section", children: ["h"] },
      style: { backgroundColor: "#0f172a", color: "#f8fafc" },
    },
    h: {
      type: "heading",
      props: { type: "heading", level: 1, content: "หัว" },
    },
  },
};

const inlineBlock: StyleBlock = {
  ...pageBlock,
  id: "card-inline",
  category: "elements",
  scope: "inline",
  root: "c",
  nodes: {
    c: {
      type: "card",
      props: { type: "card", children: ["t"] },
      style: { backgroundColor: "#ffffff", color: "#0f172a" },
    },
    t: {
      type: "text",
      props: { type: "text", content: "hi" },
    },
  },
};

function emptyDoc(): PageDocument {
  return {
    version: 2,
    meta: { title: "d2" },
    root: "page",
    nodes: {
      page: {
        id: "page",
        type: "page",
        props: { type: "page", children: [] },
        style: {},
      },
    },
  };
}

describe("D2 insertBlock", () => {
  test("ids unique and not equal to registry localIds; refs remapped", () => {
    const { nodes, rootId, idMap } = materialiseBlock(pageBlock);
    expect(rootId).not.toBe("r");
    expect(idMap.r).toBe(rootId);
    expect(idMap.h).not.toBe("h");
    const root = nodes.find((n) => n.id === rootId)!;
    expect(root.props).toMatchObject({
      type: "section",
      children: [idMap.h],
    });
    expect(nodes.every((n) => n.id !== "r" && n.id !== "h")).toBe(true);
  });

  test("page insert + double insert unique ids", () => {
    const d0 = emptyDoc();
    const a = insertBlock(d0, null, pageBlock)!;
    const b = insertBlock(a.doc, null, pageBlock)!;
    expect(a.rootId).not.toBe(b.rootId);
    const pageKids = (b.doc.nodes.page!.props as { children: string[] }).children;
    expect(pageKids).toEqual([a.rootId, b.rootId]);
  });

  test("invalid block inserts nothing", () => {
    const bad = { ...pageBlock, nodes: { r: { type: "wizard", props: { type: "wizard" } } } };
    expect(insertBlock(emptyDoc(), null, bad)).toBeNull();
  });

  test("locked page refuses", () => {
    const d = emptyDoc();
    d.nodes.page!.locked = true;
    expect(insertBlock(d, null, pageBlock)).toBeNull();
  });

  test("inline insert into container", () => {
    const d = emptyDoc();
    d.nodes.box = {
      id: "box",
      type: "container",
      props: { type: "container", children: [] },
      style: {},
    };
    (d.nodes.page!.props as { children: string[] }).children = ["box"];
    const out = insertBlock(d, "box", inlineBlock)!;
    expect(
      (out.doc.nodes.box!.props as { children: string[] }).children,
    ).toEqual([out.rootId]);
    expect(out.doc.nodes[out.rootId]!.type).toBe("card");
  });
});
