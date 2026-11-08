/**
 * Phase 11 D7: features / pricing / FAQ ×2.
 */
import { describe, expect, test } from "bun:test";
import { validateBlock } from "@/lib/block-format";
import {
  loadBlocksRegistry,
  resetBlocksRegistryCache,
} from "@/lib/blocks-registry";
import batch2 from "@/lib/blocks-registry/d7-batch2.json";
import { ICON_NAMES } from "@/lib/icon-paths";

const IDS = [
  "features-three",
  "features-list",
  "pricing-two",
  "pricing-single",
  "faq-accordion",
  "faq-compact",
] as const;

const ICON_SET = new Set<string>(ICON_NAMES);

describe("D7 batch 2 authored blocks", () => {
  test("six blocks validate; FAQ uses accordion; pricing uses list+icon", () => {
    expect(batch2).toHaveLength(6);
    for (const raw of batch2) {
      const { block, errors } = validateBlock(raw);
      expect(errors, JSON.stringify(errors)).toEqual([]);
      expect(IDS).toContain(block!.id as (typeof IDS)[number]);
      const types = Object.values(block!.nodes).map((n) => n.type);
      if (block!.category === "faq") {
        expect(types).toContain("accordion");
      }
      if (block!.category === "pricing") {
        expect(types).toContain("list");
        expect(types).toContain("icon");
      }
      const root = block!.nodes[block!.root]!;
      expect(root.style?.backgroundColor).toBeTruthy();
      expect(root.style?.color).toBeTruthy();
    }
  });

  test("icon names are curated", () => {
    for (const raw of batch2) {
      const { block } = validateBlock(raw);
      for (const n of Object.values(block!.nodes)) {
        if (n.type !== "icon") continue;
        const name = (n.props as { name: string }).name;
        expect(ICON_SET.has(name), name).toBe(true);
      }
    }
  });

  test("registry includes D7 ids", async () => {
    resetBlocksRegistryCache();
    const list = await loadBlocksRegistry();
    for (const id of IDS) {
      expect(list.some((b) => b.id === id), id).toBe(true);
    }
  });
});
