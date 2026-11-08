/**
 * Phase 11 D — Preview 1024/719 proxy: authored blocks must not set fixed
 * widths/minWidths that force horizontal scroll under the phone frame (719).
 * Real WebKitGTK scroll still owed; this catches the common layout offenders.
 */
import { describe, expect, test } from "bun:test";
import {
  loadBlocksRegistry,
  resetBlocksRegistryCache,
} from "@/lib/blocks-registry";
import type { Node, StyleProps } from "@/lib/schema";

const PHONE_W = 719;
const TABLET_W = 1024;

function styleWidths(style: StyleProps | undefined): number[] {
  if (!style) return [];
  const out: number[] = [];
  for (const key of ["width", "minWidth", "maxWidth"] as const) {
    const v = style[key];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function collectWidths(nodes: Record<string, Node>): { id: string; w: number; where: string }[] {
  const hits: { id: string; w: number; where: string }[] = [];
  for (const n of Object.values(nodes)) {
    for (const w of styleWidths(n.style)) {
      hits.push({ id: n.id, w, where: "base" });
    }
    const bps = n.styleBreakpoints;
    if (!bps) continue;
    for (const [bp, st] of Object.entries(bps)) {
      for (const w of styleWidths(st as StyleProps)) {
        hits.push({ id: n.id, w, where: bp });
      }
    }
  }
  return hits;
}

describe("D blocks viewport (1024/719 proxy)", () => {
  test("no fixed width/minWidth above phone frame (719) without a phone override", async () => {
    resetBlocksRegistryCache();
    const list = await loadBlocksRegistry();
    expect(list.length).toBeGreaterThanOrEqual(22);
    const offenders: string[] = [];
    for (const b of list) {
      // Page blocks are the Preview scroll risk; inline cards are fine narrower.
      if (b.scope !== "page") continue;
      const hits = collectWidths(b.nodes as Record<string, Node>);
      for (const h of hits) {
        if (h.w <= PHONE_W) continue;
        // Allowed if phone breakpoint shrinks or clears the width.
        const node = (b.nodes as Record<string, Node>)[h.id]!;
        const phone = node.styleBreakpoints?.phone as StyleProps | undefined;
        const phoneWs = styleWidths(phone);
        const phoneOk =
          phone != null &&
          (phoneWs.some((w) => w <= PHONE_W) ||
            phone.width === undefined && h.where === "base" && phone.minWidth !== undefined && phone.minWidth <= PHONE_W);
        if (!phoneOk) offenders.push(`${b.id} node=${h.id} ${h.where}=${h.w}`);
      }
      // Soft check: tablet frame also must not force >1024 fixed minWidth.
      for (const h of hits) {
        if (h.w > TABLET_W && h.where === "base") {
          offenders.push(`${b.id} node=${h.id} base>${TABLET_W}=${h.w}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
