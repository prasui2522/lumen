/**
 * Phase 11 D1: block format validator.
 */
import { describe, expect, test } from "bun:test";
import { validateBlock } from "@/lib/block-format";

const base = {
  formatVersion: 1,
  id: "hero-simple",
  category: "hero",
  scope: "page",
  name: "ฮีโร่เรียบ",
  nameEn: "Simple hero",
  keywords: ["hero"],
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
      props: { type: "heading", level: 1, content: "หัวข้อ" },
    },
  },
};

describe("D1 validateBlock", () => {
  test("accepts a minimal original page block", () => {
    const { block, errors } = validateBlock(base);
    expect(errors).toEqual([]);
    expect(block?.id).toBe("hero-simple");
    expect(block?.root).toBe("r");
  });

  test("requires source", () => {
    const { source: _s, ...rest } = base;
    const { errors } = validateBlock(rest);
    expect(errors.some((e) => e.path === "source")).toBe(true);
  });

  test("rejects unknown node type", () => {
    const { errors } = validateBlock({
      ...base,
      nodes: {
        r: { type: "wizard", props: { type: "wizard" } },
      },
    });
    expect(errors.some((e) => e.message.includes("unknown type"))).toBe(true);
  });

  test("rejects network URL and non-empty image src", () => {
    const { errors } = validateBlock({
      ...base,
      nodes: {
        r: {
          type: "section",
          props: { type: "section", children: ["img"] },
          style: { backgroundColor: "#fff", color: "#000" },
        },
        img: {
          type: "image",
          props: {
            type: "image",
            src: "https://evil.example/a.png",
            alt: "",
          },
        },
      },
    });
    expect(errors.some((e) => e.message.includes("network URL"))).toBe(true);
  });

  test("rejects dangling child and cycles", () => {
    const dangling = validateBlock({
      ...base,
      nodes: {
        r: {
          type: "section",
          props: { type: "section", children: ["missing"] },
        },
      },
    });
    expect(dangling.errors.some((e) => e.message.includes("dangling"))).toBe(
      true,
    );

    const cyclic = validateBlock({
      ...base,
      nodes: {
        r: {
          type: "container",
          props: { type: "container", children: ["a"] },
        },
        a: {
          type: "container",
          props: { type: "container", children: ["r"] },
        },
      },
    });
    expect(cyclic.errors.some((e) => e.message.includes("cycle"))).toBe(true);
  });

  test("rejects thumb longer than 12", () => {
    const thumb = Array.from({ length: 13 }, (_, i) => ({
      x: i,
      y: 0,
      w: 1,
      h: 1,
      tone: "ink",
    }));
    const { errors } = validateBlock({ ...base, thumb });
    expect(errors.some((e) => e.path === "thumb")).toBe(true);
  });
});
