import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { documentForSave } from "@/lib/breakpoints";
import { FIELDS, fieldEffective, fieldsFor, isFieldOverridden } from "@/lib/style-fields";
import { styleToCss } from "@/lib/style-css";
import { DEFAULT_STYLES, type Node, type NodeType, type PageDocument, type StyleProps } from "@/schema";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const GOLDEN = JSON.parse(read("src-tauri/src/fixtures/a2/default-styles.json")) as Record<string, Record<string, unknown>>;
const defaults = DEFAULT_STYLES as Record<string, Record<string, unknown>>;

describe("A2.3 part 2: Designer ruling (display inline-flex, overflow auto)", () => {
  test("the three default sources agree for badge and scrollArea", () => {
    expect(defaults.badge.display).toBe("inline-flex");
    expect(GOLDEN.badge.display).toBe("inline-flex");
    expect(defaults.scrollArea.overflow).toBe("auto");
    expect(GOLDEN.scrollArea.overflow).toBe("auto");
    expect(defaults.badge).toEqual(GOLDEN.badge);
    expect(defaults.scrollArea).toEqual(GOLDEN.scrollArea);
    // defaults.rs literal values (mirror)
    const rs = read("src-tauri/src/defaults.rs");
    expect(rs).toContain('display: Some("inline-flex".into())');
    expect(rs).toMatch(/NodeType::ScrollArea[\s\S]{0,400}overflow: Some\("auto"\.into\(\)\)/);
  });

  test("the TS unions accept the new values and the old ones (compile-time + runtime)", () => {
    const s: StyleProps = { display: "inline-flex", overflow: "auto" };
    const t: StyleProps = { display: "inline-block", overflow: "scroll" };
    const u: StyleProps = { display: "flex", overflow: "hidden" };
    const v: StyleProps = { display: "none", overflow: "visible" };
    expect([s, t, u, v].map((x) => styleToCss(x))).toEqual([
      expect.objectContaining({ display: "inline-flex", overflow: "auto" }),
      expect.objectContaining({ display: "inline-block", overflow: "scroll" }),
      expect.objectContaining({ display: "flex", overflow: "hidden" }),
      expect.objectContaining({ display: "none", overflow: "visible" }),
    ]);
  });

  test("the TODO and the 'ruling pending' notes are gone", () => {
    expect(read("src/schema.ts")).not.toMatch(/TODO.*(badge|inline-flex|overflow)/i);
    expect(read("src/lib/kind-looks.json")).not.toMatch(/ruling pending/i);
    expect(read("src-tauri/src/defaults.rs")).not.toMatch(/Designer ruling pending|TODO.*inline-flex/i);
  });

  test("the style panel: overflow is segmented, offers เลื่อน (auto), is offered to the A2 containers except scrollArea (A2.5)", () => {
    const f = FIELDS.find((x) => x.id === "overflow")!;
    expect(f.control).toBe("segmented");
    expect(f.options!.map((o) => o.value)).toEqual(["visible", "hidden", "auto"]);
    expect(f.options!.find((o) => o.value === "auto")!.label).toBe("เลื่อน");
    for (const t of ["section", "container", "image"] as NodeType[]) expect(fieldsFor("display", t).some((x) => x.id === "overflow")).toBe(true);
    for (const t of ["card", "alert", "aspectRatio", "buttonGroup"] as NodeType[]) expect(fieldsFor("display", t).some((x) => x.id === "overflow")).toBe(true);
    // scrollArea is the scroller itself (its axis is the orientation prop); leaves have nothing to overflow
    for (const t of ["scrollArea", "badge", "separator", "skeleton", "spinner"] as NodeType[]) expect(fieldsFor("display", t).some((x) => x.id === "overflow")).toBe(false);
  });

  test("a section with overflow:auto is an override showing 'auto'; one without shows its default", () => {
    const f = FIELDS.find((x) => x.id === "overflow")!;
    const sec = { id: "s", type: "section", props: { type: "section", children: [] }, style: { overflow: "auto" } } as unknown as Node;
    expect(isFieldOverridden(f, sec)).toBe(true);
    expect(fieldEffective(f, sec, { overflow: "auto" })).toBe("auto");
    const plain = { ...sec, style: {} } as Node;
    expect(isFieldOverridden(f, plain)).toBe(false);
  });

  test("a save keeps display / overflow values untouched and does not change the version marker", () => {
    const doc: PageDocument = {
      version: 1,
      meta: { title: "t" },
      root: "r",
      nodes: {
        r: { id: "r", type: "page", props: { type: "page", children: ["b", "s"] }, style: {} },
        b: { id: "b", type: "badge", props: { type: "badge", label: "ป้าย" }, style: { display: "inline-flex" } },
        s: { id: "s", type: "scrollArea", props: { type: "scrollArea", children: [], orientation: "both" }, style: { overflow: "scroll" } },
      },
    } as PageDocument;
    const saved = documentForSave(doc);
    expect(saved.version).toBe(4);
    expect(saved.nodes.b.style).toEqual({ display: "inline-flex" });
    expect(saved.nodes.s.style).toEqual({ overflow: "scroll" });
    expect(JSON.parse(JSON.stringify(saved)).nodes.s.style.overflow).toBe("scroll");
  });
});
