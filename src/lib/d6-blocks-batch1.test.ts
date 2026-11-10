/**
 * Phase 11 D6: authored header/hero/footer/CTA ×2 — checklist smoke.
 */
import { describe, expect, test } from "bun:test";
import {
  loadBlocksRegistry,
  resetBlocksRegistryCache,
} from "@/lib/blocks-registry";
import { validateBlock } from "@/lib/block-format";
import batch1 from "@/lib/blocks-registry/d6-batch1.json";

const D6_IDS = [
  "header-bar",
  "header-stacked",
  "hero-centered",
  "hero-split",
  "footer-simple",
  "footer-columns",
  "cta-banner",
  "cta-split",
] as const;

const CONTRAST_OK = new Set([
  "#0f172a|#f8fafc",
  "#f8fafc|#0f172a",
  "#ffffff|#0f172a",
  "#0f172a|#ffffff",
]);

function hexPair(bg: string, fg: string): string {
  return `${bg.toLowerCase()}|${fg.toLowerCase()}`;
}

describe("D6 batch 1 authored blocks", () => {
  test("eight blocks validate with original source + root colours", () => {
    expect(batch1).toHaveLength(8);
    for (const raw of batch1) {
      const { block, errors } = validateBlock(raw);
      expect(errors, JSON.stringify(errors)).toEqual([]);
      expect(block).toBeTruthy();
      expect(block!.source).toEqual({ kind: "original" });
      expect(block!.scope).toBe("page");
      const root = block!.nodes[block!.root]!;
      expect(root.style?.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(root.style?.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(
        CONTRAST_OK.has(
          hexPair(root.style!.backgroundColor!, root.style!.color!),
        ) ||
          // footer-columns / cta-split use light paper + slate text on root
          (root.style!.backgroundColor === "#f8fafc" &&
            root.style!.color === "#0f172a"),
      ).toBe(true);
      expect(Object.keys(block!.nodes).length).toBeLessThanOrEqual(60);
      expect(D6_IDS).toContain(block!.id as (typeof D6_IDS)[number]);
    }
  });

  test("h1 only in hero blocks", () => {
    for (const raw of batch1) {
      const { block } = validateBlock(raw);
      const h1 = Object.values(block!.nodes).filter(
        (n) =>
          n.type === "heading" &&
          (n.props as { level?: number }).level === 1,
      );
      if (block!.category === "hero") expect(h1.length).toBe(1);
      else expect(h1.length).toBe(0);
    }
  });

  test("no network URLs; image src empty", () => {
    const dump = JSON.stringify(batch1);
    expect(dump).not.toMatch(/https?:\/\//i);
    for (const raw of batch1) {
      const { block } = validateBlock(raw);
      for (const n of Object.values(block!.nodes)) {
        if (n.type === "image") {
          // A2: `src` is an AssetRef `{ id, alt? }` (schema ImageProps); a block placeholder has an empty id.
          const s = (n.props as { src?: unknown }).src as { id?: string; alt?: string } | undefined;
          expect(s).toBeDefined();
          expect(s!.id).toBe("");
          expect(s!.alt ?? "").toBe("");
        }
      }
    }
  });

  test("validator rejects a real asset id in an image src (string or AssetRef)", () => {
    const img = (src: unknown) => ({
      ...(batch1[0] as Record<string, unknown>),
      id: "a2-img-probe",
      root: "r",
      nodes: {
        r: { id: "r", type: "section", props: { type: "section", children: ["i"] }, style: {} },
        i: { id: "i", type: "image", props: { type: "image", src }, style: {} },
      },
    });
    const msgs = (src: unknown) => validateBlock(img(src)).errors.map((e) => `${e.path}: ${e.message}`);
    expect(msgs({ id: "" })).not.toContain("nodes.i.props.src.id: image src must be empty placeholder");
    expect(msgs({ id: "3f2c9a1e-0000-4000-8000-000000000000" })).toContain(
      "nodes.i.props.src.id: image src must be empty placeholder",
    );
    expect(msgs("3f2c9a1e-0000-4000-8000-000000000000")).toContain("nodes.i.props.src: image src must be empty placeholder");
  });

  test("registry loads migrated + D6 without duplicate ids", async () => {
    resetBlocksRegistryCache();
    const list = await loadBlocksRegistry();
    const ids = list.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of D6_IDS) expect(ids).toContain(id);
    expect(ids.length).toBeGreaterThanOrEqual(11 + 8);
  });
});
