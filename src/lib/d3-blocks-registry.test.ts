/**
 * Phase 11 D3: migrated registry trees match buildBlock / buildTemplate.
 */
import { describe, expect, test } from "bun:test";
import { BLOCKS, buildBlock } from "@/lib/blocks";
import { TEMPLATES, buildTemplate } from "@/lib/templates";
import {
  builtFromRegistryBlock,
  findRegistryBlock,
  loadBlocksRegistry,
  normaliseBuiltTree,
  registryIdForLegacyBlock,
  registryIdForLegacyTemplate,
  resetBlocksRegistryCache,
} from "@/lib/blocks-registry";
import { validateBlock } from "@/lib/block-format";

describe("D3 blocks registry", () => {
  test("all migrated entries validate and declare source", async () => {
    resetBlocksRegistryCache();
    const list = await loadBlocksRegistry();
    expect(list.length).toBe(11);
    expect(list.every((b) => b.source.kind === "original")).toBe(true);
    for (const b of list) {
      expect(validateBlock(b).errors).toEqual([]);
    }
  });

  test("each Phase 5B block matches registry after id normalisation", async () => {
    const list = await loadBlocksRegistry();
    for (const b of BLOCKS) {
      const reg = findRegistryBlock(list, registryIdForLegacyBlock(b.id))!;
      expect(reg, b.id).toBeTruthy();
      const fromCode = normaliseBuiltTree(buildBlock(b.id));
      const fromReg = normaliseBuiltTree(builtFromRegistryBlock(reg));
      expect(fromReg, b.id).toEqual(fromCode);
    }
  });

  test("each Phase 4 template matches registry after id normalisation", async () => {
    const list = await loadBlocksRegistry();
    for (const t of TEMPLATES) {
      const reg = findRegistryBlock(list, registryIdForLegacyTemplate(t.id))!;
      expect(reg, t.id).toBeTruthy();
      const fromCode = normaliseBuiltTree(buildTemplate(t.id));
      const fromReg = normaliseBuiltTree(builtFromRegistryBlock(reg));
      expect(fromReg, t.id).toEqual(fromCode);
    }
  });
});
