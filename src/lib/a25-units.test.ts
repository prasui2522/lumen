import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  A2_SPINNER_MAX_SIZE,
  A2_SPINNER_MIN_SIZE,
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  createNode,
  nodeDisplayName,
  setNodeProp,
  type PaletteType,
} from "@/lib/document-ops";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { FIELDS, fieldsFor, hasLayoutProps, layoutDirection, overflowSegmentValue } from "@/lib/style-fields";
import { A2_CANVAS_ONLY_CSS, A2_STYLESHEET } from "@/lib/a2-looks";
import { placedDocument } from "@/lib/a25-doc";
import { ASPECT_RATIOS } from "@/schema";
import type { Node } from "@/schema";

const A2 = ["card", "alert", "badge", "separator", "skeleton", "spinner", "aspectRatio", "scrollArea", "buttonGroup"] as const satisfies readonly PaletteType[];
const EN: Record<(typeof A2)[number], string> = {
  card: "Card", alert: "Alert", badge: "Badge", separator: "Separator", skeleton: "Skeleton",
  spinner: "Spinner", aspectRatio: "Aspect Ratio", scrollArea: "Scroll Area", buttonGroup: "Button Group",
};

const found = (q: string) => filterPaletteGroups(q).flatMap((g) => g.types);

describe("A2.5 palette: nine tiles", () => {
  test("each A2 kind is a palette type, has meta, has an English tile label, and creates a node of its own type", () => {
    for (const t of A2) {
      expect(PALETTE_TYPES).toContain(t);
      expect(PALETTE_META[t]).toBeDefined();
      expect(NODE_TYPE_LABEL[t]).toBe(EN[t]);
      const n = createNode(t);
      expect(n.type).toBe(t);
      expect(n.props.type).toBe(t);
    }
  });
  test("the Phase 5B Thai names are search synonyms that find the tile", () => {
    expect(found("การ์ด")).toContain("card");
    expect(found("แจ้งเตือน")).toContain("alert");
    expect(found("ป้าย")).toContain("badge");
    expect(found("เส้นคั่น")).toContain("separator");
    for (const t of A2) expect(found(EN[t])).toContain(t);
  });
});

describe("A2.5.1 F13 (reversed): English layer names", () => {
  test("every A2 kind shows its English component name, a node's own name wins, a blank name falls back", () => {
    const want = {
      card: "Card", alert: "Alert", badge: "Badge", separator: "Separator", skeleton: "Skeleton",
      spinner: "Spinner", aspectRatio: "Aspect Ratio", scrollArea: "Scroll Area", buttonGroup: "Button Group",
    } as const;
    for (const t of A2) {
      const n = createNode(t);
      expect(nodeDisplayName(n)).toBe(want[t]);
      expect(nodeDisplayName(n)).toBe(NODE_TYPE_LABEL[t]);
      expect(/[\u0E00-\u0E7F]/.test(nodeDisplayName(n))).toBe(false);
      expect(nodeDisplayName({ ...n, name: "ของฉัน" })).toBe("ของฉัน");
      expect(nodeDisplayName({ ...n, name: "  " })).toBe(want[t]);
    }
  });
  test("a derived default is never stored in the document", () => {
    for (const t of A2) expect(createNode(t).name).toBeUndefined();
  });
});

describe("A2.5.1 palette Thai synonyms", () => {
  test("every Thai synonym finds its kind", () => {
    const cases: [string, string][] = [
      ["การ์ด", "card"], ["แจ้งเตือน", "alert"], ["ป้าย", "badge"], ["เส้นคั่น", "separator"],
      ["ปุ่มเรียง", "buttonGroup"], ["กลุ่มปุ่ม", "buttonGroup"],
    ];
    for (const [q, t] of cases) expect(found(q)).toContain(t);
  });
});

describe("A2.5 Style panel fields (T10 T11 T12 T73 T74, N7)", () => {
  const ids = (section: Parameters<typeof fieldsFor>[0], t: Parameters<typeof fieldsFor>[1]) => fieldsFor(section, t).map((f) => f.id);
  test("overflow is offered to card / alert / aspectRatio / buttonGroup, not scrollArea, with แสดง ซ่อน เลื่อน", () => {
    for (const t of ["card", "alert", "aspectRatio", "buttonGroup"] as const) expect(ids("display", t)).toContain("overflow");
    expect(ids("display", "scrollArea")).not.toContain("overflow");
    const f = FIELDS.find((x) => x.id === "overflow")!;
    expect("options" in f && f.options?.map((o) => o.label)).toEqual(["แสดง", "ซ่อน", "เลื่อน"]);
  });
  test("N7: a stored `scroll` selects เลื่อน exactly like `auto`", () => {
    expect(overflowSegmentValue("scroll")).toBe("auto");
    expect(overflowSegmentValue("auto")).toBe("auto");
    expect(overflowSegmentValue("hidden")).toBe("hidden");
    expect(overflowSegmentValue("visible")).toBe("visible");
    expect(overflowSegmentValue(undefined)).toBeUndefined();
    expect(overflowSegmentValue(3)).toBeUndefined();
  });
  test("layout props belong to container + the five A2 container kinds only, with the right directions", () => {
    for (const t of ["container", "card", "alert", "aspectRatio", "scrollArea", "buttonGroup"]) expect(hasLayoutProps(t)).toBe(true);
    for (const t of ["badge", "separator", "skeleton", "spinner", "text", "page"]) expect(hasLayoutProps(t)).toBe(false);
    expect(layoutDirection(createNode("card"))).toBe("column");
    expect(layoutDirection(createNode("buttonGroup"))).toBe("row");
    expect(layoutDirection(createNode("badge"))).toBeNull();
  });
  test("spinner colour and the leaf kinds are restylable", () => {
    expect(ids("display", "spinner")).toContain("spinnerColor");
    for (const t of A2) expect(fieldsFor("background", t).length + fieldsFor("size", t).length + fieldsFor("display", t).length).toBeGreaterThan(0);
  });
});

describe("A2.5 setNodeProp: aspectRatio / spinner / scrollArea / separator / badge", () => {
  const docWith = (n: Node) => {
    const d = placedDocument();
    return { ...d, nodes: { ...d.nodes, [n.id]: n } };
  };
  test("ratio accepts exactly the five ASPECT_RATIOS", () => {
    const n = { ...createNode("aspectRatio"), id: "ar" };
    const cur = (n.props as { ratio: string }).ratio;
    const other = ASPECT_RATIOS.find((r) => r !== cur)!;
    const d = docWith(n);
    const next = setNodeProp(d, "ar", "ratio", other)!;
    expect((next.nodes.ar.props as { ratio: string }).ratio).toBe(other);
    expect(setNodeProp(d, "ar", "ratio", "9/16")).toBeNull();
    expect(setNodeProp(d, "ar", "ratio", 3)).toBeNull();
    expect(setNodeProp(d, "ar", "ratio", cur)).toBeNull();
    expect(ASPECT_RATIOS.length).toBe(5);
  });
  test("spinner size is clamped 12..64 and rounded; non-finite is refused; name blank removes the key", () => {
    expect(A2_SPINNER_MIN_SIZE).toBe(12);
    expect(A2_SPINNER_MAX_SIZE).toBe(64);
    const n = { ...createNode("spinner"), id: "sp" };
    const d = docWith(n);
    const size = (v: number) => (setNodeProp(d, "sp", "size", v)?.nodes.sp.props as { size: number } | undefined)?.size;
    expect(size(1)).toBe(12);
    expect(size(999)).toBe(64);
    expect(size(40.4)).toBe(40);
    expect(setNodeProp(d, "sp", "size", Number.NaN)).toBeNull();
    expect(setNodeProp(d, "sp", "size", "40")).toBeNull();
    const named = setNodeProp(d, "sp", "name", "กำลังบันทึก")!;
    expect(named.nodes.sp.name).toBe("กำลังบันทึก");
    const cleared = setNodeProp(named, "sp", "name", "   ")!;
    expect("name" in cleared.nodes.sp).toBe(false);
  });
  test("scrollArea orientation accepts three values; label blank removes the key; separator takes two", () => {
    const sa = { ...createNode("scrollArea"), id: "sa" };
    const d = docWith(sa);
    const o = (v: string) => (setNodeProp(d, "sa", "orientation", v)?.nodes.sa.props as { orientation: string } | undefined)?.orientation;
    expect(o("horizontal")).toBe("horizontal");
    expect(o("both")).toBe("both");
    expect(setNodeProp(d, "sa", "orientation", "diagonal")).toBeNull();
    const l = setNodeProp(d, "sa", "label", "รายการ")!;
    expect((l.nodes.sa.props as { label?: string }).label).toBe("รายการ");
    expect("label" in (setNodeProp(l, "sa", "label", "  ")!.nodes.sa.props as object)).toBe(false);
    const sep = { ...createNode("separator"), id: "se" };
    const d2 = docWith(sep);
    expect(setNodeProp(d2, "se", "orientation", "vertical")).not.toBeNull();
    expect(setNodeProp(d2, "se", "orientation", "both")).toBeNull();
  });
  test("badge label is a required string", () => {
    const b = { ...createNode("badge"), id: "bd" };
    const d = docWith(b);
    expect((setNodeProp(d, "bd", "label", "ใหม่")!.nodes.bd.props as { label: string }).label).toBe("ใหม่");
    expect(setNodeProp(d, "bd", "label", 4)).toBeNull();
  });
});

describe("A2.5 F2: the canvas-only hit area never reaches an export", () => {
  test("A2_CANVAS_ONLY_CSS is not in the shared looks the exporter reads, nor in the kind-looks file", () => {
    expect(A2_CANVAS_ONLY_CSS).toContain("data-cv-hit");
    expect(A2_STYLESHEET).not.toContain("data-cv-hit");
    expect(A2_STYLESHEET).not.toContain("top:-4px");
    const raw = readFileSync(new URL("./kind-looks.json", import.meta.url), "utf8");
    expect(raw).not.toContain("cv-hit");
    const rs = readFileSync(new URL("../../src-tauri/src/compiler.rs", import.meta.url), "utf8");
    expect(rs).not.toContain("cv-hit");
    expect(rs).not.toContain("data-a2-canvas");
  });
});

describe("A2.5 B9: the focus redirect delay is zero", () => {
  test("FOCUS_REDIRECT_DELAY_MS is 0", async () => {
    const m = await import("@/lib/a2-looks");
    expect(m.FOCUS_REDIRECT_DELAY_MS).toBe(0);
  });
});
