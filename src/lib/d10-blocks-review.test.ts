/**
 * Phase 11 D10 automated checklist smoke (human reviewer sign-off still owed).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import {
  loadBlocksRegistry,
  resetBlocksRegistryCache,
} from "@/lib/blocks-registry";
import { validateBlock } from "@/lib/block-format";

const ROOT = join(import.meta.dir, "..", "..");
const DIST = join(ROOT, "dist", "assets");

describe("D10 blocks review (automated)", () => {
  test("every registry block: original/mit source, root colours, no network, ≤60 nodes soft", async () => {
    resetBlocksRegistryCache();
    const list = await loadBlocksRegistry();
    expect(list.length).toBe(33);
    for (const b of list) {
      expect(validateBlock(b).errors).toEqual([]);
      expect(b.source.kind === "original" || b.source.kind === "mit").toBe(true);
      if (b.source.kind === "mit") {
        expect(b.source.project.trim()).toBeTruthy();
        expect(b.source.ref.trim()).toBeTruthy();
        expect(b.source.retrieved.trim()).toBeTruthy();
      }
      const root = b.nodes[b.root]!;
      // Migrated templates may lack root colours; authored batches require them.
      if (!b.id.startsWith("template-") && !b.id.startsWith("elements-")) {
        expect(root.style?.backgroundColor, b.id).toMatch(/^#/);
        expect(root.style?.color, b.id).toMatch(/^#/);
      }
      expect(Object.keys(b.nodes).length, b.id).toBeLessThanOrEqual(60);
      const dump = JSON.stringify(b);
      expect(dump).not.toMatch(/https?:\/\//i);
      const h1 = Object.values(b.nodes).filter(
        (n) =>
          n.type === "heading" &&
          (n.props as { level?: number }).level === 1,
      );
      if (b.category === "hero") expect(h1.length, b.id).toBeGreaterThanOrEqual(1);
      else expect(h1.length, b.id).toBe(0);
    }
  });

  test("notices file bundled mentions shadcn / Lucide", () => {
    const notices = join(ROOT, "THIRD-PARTY-NOTICES.md");
    expect(existsSync(notices)).toBe(true);
    const text = readFileSync(notices, "utf8");
    expect(text.toLowerCase()).toContain("shadcn");
    expect(text.toLowerCase()).toMatch(/lucide|isc/);
  });

  test("flyout + registry chunks within budget when dist present", () => {
    if (!existsSync(DIST)) return;
    const files = readdirSync(DIST);
    const flyout = files.find((f) => f.startsWith("blocks-flyout-") && f.endsWith(".js"));
    expect(flyout, "blocks-flyout chunk").toBeTruthy();
    const flyGz = gzipSync(readFileSync(join(DIST, flyout!)), { level: 9 }).byteLength;
    expect(flyGz).toBeLessThanOrEqual(6 * 1024);

    const regFiles = files.filter(
      (f) =>
        (f.startsWith("migrated-") ||
          f.startsWith("d6-batch1-") ||
          f.startsWith("d7-batch2-") ||
          f.startsWith("d8-batch3-")) &&
        f.endsWith(".js"),
    );
    expect(regFiles.length).toBeGreaterThanOrEqual(1);
    let regTotal = 0;
    for (const f of regFiles) {
      regTotal += gzipSync(readFileSync(join(DIST, f)), { level: 9 }).byteLength;
    }
    expect(regTotal).toBeLessThanOrEqual(30 * 1024);

    const index = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    if (index) {
      const entry = readFileSync(join(DIST, index), "utf8");
      expect(entry).not.toContain("header-bar");
      expect(entry).not.toContain("blocks-flyout");
    }
  });
});
