// PHASE-11 A5.5: calendar kind — schema, leap year, BE/CE, weekStart, goldens.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Node, PageDocument } from "@/schema";
import { A5_TYPES, DEFAULT_STYLES, isA5Type, isVersion4Kind } from "@/schema";
import {
  NODE_TYPE_LABEL,
  PALETTE_TYPES,
  createNode,
  insertNode,
  setNodeProp,
} from "@/lib/document-ops";
import { PALETTE_META, filterPaletteGroups } from "@/lib/palette-meta";
import { documentForSave } from "@/lib/breakpoints";
import {
  daysInMonth,
  renderCalendarHtml,
  type CalendarModel,
} from "@/lib/calendar-render";
import { CalendarGlyph } from "@/components/editor/calendar-render";

const RS = join(import.meta.dir, "..", "..", "src-tauri", "src");
const DEFAULTS_RS = readFileSync(join(RS, "defaults.rs"), "utf8");
const FIX = join(RS, "fixtures", "a5");

const doc1 = (n: Node): PageDocument => {
  const d = {
    version: 1,
    meta: { title: "a55", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as unknown as PageDocument;
  const out = insertNode(d, n, "root", 0);
  if (!out) throw new Error("insert");
  return out;
};

describe("A5.5 schema mirror", () => {
  test("A5_TYPES includes calendar; version-4", () => {
    const body = DEFAULTS_RS.slice(DEFAULTS_RS.indexOf("pub fn is_a5_kind(t: NodeType) -> bool {"));
    expect(body.slice(0, body.indexOf("\n}"))).toContain("NodeType::Calendar");
    expect([...A5_TYPES]).toEqual(["carousel", "chart", "calendar"]);
    expect(isA5Type("calendar") && isVersion4Kind("calendar")).toBe(true);
    expect(documentForSave(doc1({ ...createNode("calendar"), id: "c" })).version).toBe(4);
  });

  test("createNode + palette", () => {
    const n = createNode("calendar");
    expect(n.props).toEqual({
      type: "calendar",
      year: 2569,
      month: 11,
      weekStart: 0,
      era: "be",
    });
    expect(DEFAULT_STYLES.calendar.width).toBe("100%");
    expect(NODE_TYPE_LABEL.calendar).toBe("Calendar");
    expect(PALETTE_TYPES.includes("calendar")).toBe(true);
    expect(PALETTE_META.calendar.group).toBe("Data");
    expect(filterPaletteGroups("ปฏิทิน").some((g) => g.types.includes("calendar"))).toBe(true);
  });

  test("era flip keeps CE instant; selectedDay sparse", () => {
    let d = doc1({ ...createNode("calendar"), id: "c" });
    d = setNodeProp(d, "c", "era", "ce")!;
    expect((d.nodes.c!.props as { year: number; era: string }).year).toBe(2026);
    expect((d.nodes.c!.props as { era: string }).era).toBe("ce");
    d = setNodeProp(d, "c", "selectedDay", 15)!;
    expect((d.nodes.c!.props as { selectedDay?: number }).selectedDay).toBe(15);
    d = setNodeProp(d, "c", "selectedDay", undefined)!;
    expect((d.nodes.c!.props as { selectedDay?: number }).selectedDay).toBeUndefined();
  });
});

describe("A5.5 goldens + leap", () => {
  test("Feb 2028 has 29 days", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
  });

  test.each(["a55-feb2028", "a55-be", "a55-mon"] as const)("%s", (name) => {
    const model = JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8")) as CalendarModel;
    expect(renderCalendarHtml(model)).toBe(readFileSync(join(FIX, `${name}.html`), "utf8"));
  });

  test("CalendarGlyph SSR", () => {
    const model: CalendarModel = {
      year: 2028,
      month: 2,
      weekStart: 0,
      era: "ce",
      selectedDay: 29,
    };
    const html = renderToStaticMarkup(createElement(CalendarGlyph, { model }));
    expect(html).toContain("t-calendar");
    expect(html).toContain(renderCalendarHtml(model));
  });
});
