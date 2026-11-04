// Pre-A4 / shadcn-props: string lists (toggleGroup) + href lists (pagination / dropdown).
import { describe, expect, test } from "bun:test";
import { createNode, setPhase6bProp } from "@/lib/document-ops";
import type { LabelHrefItem, Node, PageDocument } from "@/schema";
import { MAX_SELECT_OPTIONS } from "@/lib/select-options";

function bareDoc(n: Node): PageDocument {
  return {
    version: 1,
    meta: { title: "lists", lang: "th" },
    root: "root",
    nodes: {
      root: { id: "root", type: "page", props: { type: "page", children: [n.id] }, style: {} },
      [n.id]: n,
    },
  };
}

describe("pre-A4 list editors", () => {
  test("radio options: add a third line beyond the default two", () => {
    const n = { ...createNode("radio"), id: "r" };
    expect((n.props as { options: string[] }).options).toEqual(["One", "Two"]);
    const d = setPhase6bProp(bareDoc(n), "r", {
      kind: "options",
      value: ["แดง", "เขียว", "น้ำเงิน"],
    })!;
    expect((d.nodes.r.props as { options: string[] }).options).toEqual(["แดง", "เขียว", "น้ำเงิน"]);
  });

  test("toggleGroup items: grow and clamp active when shrinking", () => {
    const n = { ...createNode("toggleGroup"), id: "tg" };
    let d = bareDoc(n);
    d = setPhase6bProp(d, "tg", { kind: "num", key: "active", value: 1 })!;
    d = setPhase6bProp(d, "tg", { kind: "items", value: ["A", "B", "C", "D"] })!;
    expect((d.nodes.tg.props as { items: string[]; active: number }).items).toEqual(["A", "B", "C", "D"]);
    expect((d.nodes.tg.props as { active: number }).active).toBe(1);
    d = setPhase6bProp(d, "tg", { kind: "items", value: ["only"] })!;
    expect((d.nodes.tg.props as { items: string[]; active: number }).items).toEqual(["only"]);
    expect((d.nodes.tg.props as { active: number }).active).toBe(0);
  });

  test("pagination and dropdownMenu use labelHrefItems; cap 100", () => {
    const pag = { ...createNode("pagination"), id: "p" };
    let d = setPhase6bProp(bareDoc(pag), "p", {
      kind: "labelHrefItems",
      value: [
        { label: "1", href: "/1" },
        { label: "2", href: "" },
        { label: "3", href: "/3" },
      ],
    })!;
    expect((d.nodes.p.props as { items: LabelHrefItem[] }).items).toHaveLength(3);
    expect((d.nodes.p.props as { items: LabelHrefItem[] }).items[0]!.href).toBe("/1");

    const dd = { ...createNode("dropdownMenu"), id: "d" };
    d = setPhase6bProp(bareDoc(dd), "d", {
      kind: "labelHrefItems",
      value: [
        { label: "ก", href: "/" },
        { label: "ข", href: "" },
      ],
    })!;
    expect((d.nodes.d.props as { items: LabelHrefItem[] }).items.map((i) => i.label)).toEqual(["ก", "ข"]);

    const many = Array.from({ length: 120 }, (_, i) => ({ label: `i${i}`, href: "" }));
    d = setPhase6bProp(d, "d", { kind: "labelHrefItems", value: many })!;
    expect((d.nodes.d.props as { items: LabelHrefItem[] }).items).toHaveLength(MAX_SELECT_OPTIONS);
  });

  test("select still refuses items patch; toggleGroup refuses options patch; pagination refuses string items", () => {
    expect(setPhase6bProp(bareDoc({ ...createNode("select"), id: "s" }), "s", { kind: "items", value: ["a"] })).toBeNull();
    expect(setPhase6bProp(bareDoc({ ...createNode("toggleGroup"), id: "t" }), "t", { kind: "options", value: ["a"] })).toBeNull();
    expect(setPhase6bProp(bareDoc({ ...createNode("pagination"), id: "p" }), "p", { kind: "items", value: ["1"] })).toBeNull();
  });

  test("sheet/drawer sides include top/bottom; slider min/max/step; empty CTA", () => {
    let d = setPhase6bProp(bareDoc({ ...createNode("sheet"), id: "s" }), "s", {
      kind: "side",
      value: "top",
    })!;
    expect((d.nodes.s.props as { side: string }).side).toBe("top");
    d = setPhase6bProp(bareDoc({ ...createNode("drawer"), id: "dr" }), "dr", {
      kind: "side",
      value: "left",
    })!;
    expect((d.nodes.dr.props as { side: string }).side).toBe("left");

    d = setPhase6bProp(bareDoc({ ...createNode("slider"), id: "sl" }), "sl", {
      kind: "num",
      key: "max",
      value: 50,
    })!;
    expect((d.nodes.sl.props as { max?: number; value: number }).max).toBe(50);
    expect((d.nodes.sl.props as { value: number }).value).toBe(40);

    d = setPhase6bProp(bareDoc({ ...createNode("empty"), id: "e" }), "e", {
      kind: "str",
      key: "actionLabel",
      value: "เริ่มใหม่",
    })!;
    d = setPhase6bProp(d, "e", { kind: "str", key: "actionHref", value: "/" })!;
    expect((d.nodes.e.props as { actionLabel?: string; actionHref?: string }).actionLabel).toBe("เริ่มใหม่");
    expect((d.nodes.e.props as { actionHref?: string }).actionHref).toBe("/");
  });
});
