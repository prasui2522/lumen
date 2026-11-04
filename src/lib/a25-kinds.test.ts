import { join } from "node:path";

// The nine A2 kinds and their palette tile names (aria-label "เพิ่ม" + the English label), for the A2.5 tests.
export const A2_KINDS_FOR_TEST = [
  { type: "card", tile: "เพิ่มCard" },
  { type: "alert", tile: "เพิ่มAlert" },
  { type: "badge", tile: "เพิ่มBadge" },
  { type: "separator", tile: "เพิ่มSeparator" },
  { type: "skeleton", tile: "เพิ่มSkeleton" },
  { type: "spinner", tile: "เพิ่มSpinner" },
  { type: "aspectRatio", tile: "เพิ่มAspect Ratio" },
  { type: "scrollArea", tile: "เพิ่มScroll Area" },
  { type: "buttonGroup", tile: "เพิ่มButton Group" },
] as const;

// ---- the shared page of the A2.5 real-Chromium tests ----
export const ENTRY = join(import.meta.dir, "..", "components", "editor", "a25-browser-entry.tsx");
export const BODY = `<div style="display:flex;height:760px"><div id="layers" style="width:260px;overflow:auto"></div><div id="root" style="width:560px;height:760px;overflow:auto"></div><div id="style" style="width:280px;overflow:auto"></div></div>`;
// The few layout rules the app's Tailwind gives the canvas (the bundle has no Tailwind): a scrolling backdrop with a 480px card.
export const CSS = `[aria-label="ผืนผ้าใบ"]{height:760px;overflow:auto;padding:24px}[aria-label="ผืนผ้าใบ"]>div{width:480px;height:480px}`;
export const BACKDROP = { x: 260 + 10, y: 400 };
export const EMPTY = { version: 4, meta: { title: "t", lang: "th" }, root: "root", nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } } };


import { describe, expect, test } from "bun:test";
import { NODE_TYPE_LABEL, PALETTE_TYPES, type PaletteType } from "@/lib/document-ops";
describe("a25 test kinds", () => {
  test("the nine A2 kinds are palette types and their tile names are 'เพิ่ม' + the English label", () => {
    for (const k of A2_KINDS_FOR_TEST) {
      expect(PALETTE_TYPES).toContain(k.type as PaletteType);
      expect(k.tile).toBe(`เพิ่ม${NODE_TYPE_LABEL[k.type as PaletteType]}`);
    }
    expect(A2_KINDS_FOR_TEST.length).toBe(9);
  });
});
