/**
 * Phase 11 D4: flyout shell constants + registry categories for the panel.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLOCK_CATEGORIES,
  BLOCKS_CLOSE,
  BLOCKS_EMPTY,
  BLOCKS_SEARCH,
} from "@/components/editor/blocks-flyout";
import {
  loadBlocksRegistry,
  resetBlocksRegistryCache,
} from "@/lib/blocks-registry";

const ROOT = join(import.meta.dir, "..", "..");

describe("D4 blocks flyout shell", () => {
  test("Thai strings + all categories present", () => {
    expect(BLOCKS_SEARCH).toBe("ค้นหาบล็อก");
    expect(BLOCKS_EMPTY).toBe("ไม่พบบล็อก");
    expect(BLOCKS_CLOSE).toBe("ปิดแผงบล็อก");
    expect(BLOCK_CATEGORIES.map((c) => c.id)).toContain("all");
    expect(BLOCK_CATEGORIES.map((c) => c.id)).toContain("elements");
    expect(BLOCK_CATEGORIES.map((c) => c.id)).toContain("hero");
  });

  test("registry covers every non-all category that has migrated blocks", async () => {
    resetBlocksRegistryCache();
    const list = await loadBlocksRegistry();
    const cats = new Set(list.map((b) => b.category));
    for (const c of cats) {
      expect(BLOCK_CATEGORIES.some((x) => x.id === c), c).toBe(true);
    }
  });

  test("EditorPage lazy-loads blocks-flyout without whenIdle", () => {
    const src = readFileSync(join(ROOT, "src/pages/EditorPage.tsx"), "utf8");
    expect(src).toContain('import("@/components/editor/blocks-flyout")');
    expect(src.includes("whenIdle(() => void BlocksFlyout")).toBe(false);
  });

  test("palette opener exists", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/ElementPalette.tsx"),
      "utf8",
    );
    expect(src).toContain('id="blocks-flyout-opener"');
    expect(src).not.toContain("BLOCKS.map");
  });
});
