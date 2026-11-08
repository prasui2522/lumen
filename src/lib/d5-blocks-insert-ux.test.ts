/**
 * Phase 11 D5: drag MIME, menu strings, insert routes parity.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLOCKS_INSERT,
  BLOCKS_INSERT_AFTER,
  BLOCKS_INSERT_END,
  BLOCKS_INSERT_INTO,
  BLOCKS_INSERT_OPTIONS,
} from "@/components/editor/blocks-flyout";
import { BLOCK_DRAG_MIME } from "@/lib/drag-session";
import type { DragPayload } from "@/lib/drag-session";

const ROOT = join(import.meta.dir, "..", "..");

describe("D5 blocks insert UX", () => {
  test("MIME + DragPayload block variant exist", () => {
    expect(BLOCK_DRAG_MIME).toBe("application/x-webapp-block");
    const p: DragPayload = {
      kind: "block",
      blockId: "template-hero",
      scope: "page",
    };
    expect(p.kind).toBe("block");
  });

  test("Thai insert menu strings", () => {
    expect(BLOCKS_INSERT).toBe("แทรก");
    expect(BLOCKS_INSERT_END).toBe("แทรกท้ายหน้า");
    expect(BLOCKS_INSERT_AFTER).toBe("แทรกหลังส่วนที่เลือก");
    expect(BLOCKS_INSERT_INTO).toBe("แทรกในองค์ประกอบที่เลือก");
    expect(BLOCKS_INSERT_OPTIONS).toBe("ตัวเลือกการแทรก");
  });

  test("flyout wires drag + menu + Enter", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/blocks-flyout.tsx"),
      "utf8",
    );
    expect(src).toContain("BLOCK_DRAG_MIME");
    expect(src).toContain("BLOCKS_INSERT_END");
    expect(src).toContain('e.key !== "Enter"');
    expect(src).toContain("draggable=");
  });

  test("flyout keeps card meta only + virtualises the grid", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/blocks-flyout.tsx"),
      "utf8",
    );
    expect(src).toContain("toBlockCard");
    expect(src).toContain("setCards(null)");
    expect(src).toContain("CARD_ROW");
    expect(src).toContain("getCachedBlocksRegistry");
    expect(src).not.toMatch(/setBlocks\(list\)/);
  });

  test("canvas handles block drop + page snap", () => {
    const src = readFileSync(
      join(ROOT, "src/components/editor/DesignCanvas.tsx"),
      "utf8",
    );
    expect(src).toContain("resolvePageBlockDrop");
    expect(src).toContain('payload.kind === "block"');
    expect(src).toContain("insertBlock");
  });
});
