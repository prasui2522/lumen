/**
 * Phase 11 D9: Ctrl+K lists registry blocks; old template/block dropdowns gone.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

describe("D9 command palette + palette deprecation", () => {
  test("CommandPalette lazy-loads registry; no TEMPLATES/BLOCKS duplicates", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/CommandPalette.tsx"),
      "utf8",
    );
    expect(src).toContain("loadBlocksRegistry");
    expect(src).toContain("insertRegistryStyleBlock");
    expect(src).not.toContain('from "@/lib/templates"');
    expect(src).not.toContain('from "@/lib/blocks"');
    expect(src).not.toContain("heading=\"เทมเพลต\"");
    // Single บล็อก group
    expect(src.match(/heading="บล็อก"/g)?.length).toBe(1);
  });

  test("ElementPalette keeps บล็อก opener; drops เทมเพลต dropdown", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/ElementPalette.tsx"),
      "utf8",
    );
    expect(src).toContain('id="blocks-flyout-opener"');
    expect(src).not.toContain("TEMPLATES");
    expect(src).not.toContain("insertTemplate");
    expect(src).not.toContain(">เทมเพลต<");
  });
});
