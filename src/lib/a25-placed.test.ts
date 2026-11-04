// A2.5: what the palette really creates for the nine A2 kinds, as one document. The fixture
// src-tauri/src/fixtures/a2/a25-placed.json IS that document (the Rust golden test compiles it), so this test keeps the
// editor and the exporter honest about each other: `A25_BLESS=1 bun test src/lib/a25-placed.test.ts` rewrites it.
import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setNodeProp, setNodeStyle } from "@/lib/document-ops";
import { placedDocument } from "@/lib/a25-doc";

const FIXTURE = join(import.meta.dir, "..", "..", "src-tauri", "src", "fixtures", "a2", "a25-placed.json");

describe("A2.5: the nine palette kinds, placed", () => {
  test("the fixture is what the editor creates (A25_BLESS=1 rewrites it)", () => {
    const doc = placedDocument();
    const json = JSON.stringify(JSON.parse(JSON.stringify(doc)), null, 2) + "\n";
    if (process.env.A25_BLESS) writeFileSync(FIXTURE, json);
    expect(readFileSync(FIXTURE, "utf8")).toBe(json);
  });

  test("every new node is sparse: required props only, an empty style (nothing a default already says is stored)", () => {
    const doc = placedDocument();
    for (const id of ["card", "alert", "badge", "sep", "skel", "spin", "ratio", "scroll", "group"]) {
      expect(doc.nodes[id].style).toEqual({});
      expect(doc.nodes[id].name).toBeUndefined();
    }
    expect(doc.nodes.ratio.props).toEqual({ type: "aspectRatio", ratio: "16/9", children: ["ratio-sp"] });
    expect(doc.nodes.scroll.props).toMatchObject({ type: "scrollArea", orientation: "vertical" });
    expect(doc.nodes.badge.props).toEqual({ type: "badge", label: "ป้าย" });
  });

  test("restyling keeps the fixture shape valid (setNodeStyle on a new card)", () => {
    const doc = setNodeStyle(placedDocument(), "card", "padding", 12 as never);
    expect(doc!.nodes.card.style.padding).toBeDefined();
  });

  test("setNodeProp on a fresh spinner / scrollArea (T11) names them; empty clears the name", () => {
    const doc = placedDocument();
    const named = setNodeProp(doc, "spin", "name", "กำลังบันทึก")!;
    expect(named.nodes.spin.name).toBe("กำลังบันทึก");
    const cleared = setNodeProp(named, "spin", "name", "")!;
    expect(cleared.nodes.spin.name).toBeUndefined();
    const lab = setNodeProp(doc, "scroll", "label", "รายการ")!;
    expect((lab.nodes.scroll.props as { label?: string }).label).toBe("รายการ");
  });
});
