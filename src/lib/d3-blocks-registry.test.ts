/**
 * Phase 11 D3: migrated registry trees match buildBlock / buildTemplate.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(list.length).toBeGreaterThanOrEqual(11);
    expect(list.filter((b) => b.id.startsWith("elements-") || b.id.startsWith("template-")).length).toBe(11);
    const migrated = list.filter((b) => b.id.startsWith("elements-") || b.id.startsWith("template-"));
    expect(migrated.every((b) => b.source.kind === "original")).toBe(true);
    // A2: later batches may carry MIT-adapted blocks; each needs full attribution and a notices line.
    const notices = readFileSync(join(import.meta.dir, "..", "..", "THIRD-PARTY-NOTICES.md"), "utf8");
    for (const b of list) {
      if (b.source.kind === "original") continue;
      expect(b.source.kind, b.id).toBe("mit");
      if (b.source.kind !== "mit") continue;
      expect(b.source.project.trim().length, b.id).toBeGreaterThan(0);
      expect(b.source.ref.trim().length, b.id).toBeGreaterThan(0);
      expect(b.source.retrieved, b.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(notices, b.id).toContain(`\`${b.id}\``);
    }
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
