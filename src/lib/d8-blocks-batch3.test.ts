/**
 * Phase 11 D8: testimonials / contact / logoCloud / stats ×2.
 */
import { describe, expect, test } from "bun:test";
import { validateBlock } from "@/lib/block-format";
import {
  loadBlocksRegistry,
  resetBlocksRegistryCache,
} from "@/lib/blocks-registry";
import batch3 from "@/lib/blocks-registry/d8-batch3.json";

const IDS = [
  "testimonials-cards",
  "testimonials-quote",
  "contact-split",
  "contact-simple",
  "logo-cloud-row",
  "logo-cloud-grid",
  "stats-row",
  "stats-cards",
] as const;

describe("D8 batch 3 authored blocks", () => {
  test("eight blocks validate; no network URLs; logo boxes generic", () => {
    expect(batch3).toHaveLength(8);
    expect(JSON.stringify(batch3)).not.toMatch(/https?:\/\//i);
    for (const raw of batch3) {
      const { block, errors } = validateBlock(raw);
      expect(errors, JSON.stringify(errors)).toEqual([]);
      expect(IDS).toContain(block!.id as (typeof IDS)[number]);
      const root = block!.nodes[block!.root]!;
      expect(root.style?.backgroundColor).toBeTruthy();
      expect(root.style?.color).toBeTruthy();
      if (block!.category === "logoCloud") {
        for (const n of Object.values(block!.nodes)) {
          if (n.type === "image") {
            throw new Error("logo cloud must use neutral boxes, not images");
          }
        }
      }
    }
  });

  test("registry includes D8 + full v1 marketing count (≥ 22 authored + 11 migrated)", async () => {
    resetBlocksRegistryCache();
    const list = await loadBlocksRegistry();
    for (const id of IDS) expect(list.some((b) => b.id === id), id).toBe(true);
    // 11 migrated + 8 D6 + 6 D7 + 8 D8 + 6 D11 = 39
    expect(list.length).toBe(39);
    const marketing = list.filter((b) => b.category !== "elements");
    // 5 migrated templates + 22 authored + 6 app-shell = 33
    expect(marketing.length).toBe(33);
  });
});
