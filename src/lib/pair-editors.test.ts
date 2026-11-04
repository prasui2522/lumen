// Pre-A4 / menubar-href: pair lists (tabs / accordion / breadcrumb / navigationMenu)
// and nested menubar menus with linkable items.
import { describe, expect, test } from "bun:test";
import { createNode, setPhase6bProp } from "@/lib/document-ops";
import type { MenubarMenu, Node, PageDocument } from "@/schema";
import {
  formatLabelHrefItems,
  formatLabelTextItems,
  parseLabelHrefItems,
  parseLabelTextItems,
} from "@/lib/pair-options";
import { MAX_SELECT_OPTIONS } from "@/lib/select-options";

function bareDoc(n: Node): PageDocument {
  return {
    version: 1,
    meta: { title: "pairs", lang: "th" },
    root: "root",
    nodes: {
      root: { id: "root", type: "page", props: { type: "page", children: [n.id] }, style: {} },
      [n.id]: n,
    },
  };
}

describe("pair parse / format", () => {
  test("label|text round-trip; no pipe → empty second field", () => {
    expect(parseLabelTextItems("File | Content\nEdit | More")).toEqual([
      { label: "File", text: "Content" },
      { label: "Edit", text: "More" },
    ]);
    expect(parseLabelTextItems("Only")).toEqual([{ label: "Only", text: "" }]);
    expect(formatLabelTextItems([{ label: "File", text: "Content" }])).toBe("File | Content");
  });

  test("label|href round-trip", () => {
    expect(parseLabelHrefItems("Home | /\nPage | /about")).toEqual([
      { label: "Home", href: "/" },
      { label: "Page", href: "/about" },
    ]);
    expect(formatLabelHrefItems([{ label: "Home", href: "/" }])).toBe("Home | /");
  });
});

describe("pair list replace", () => {
  test("menubar defaults are File/Edit menus with linkable items", () => {
    const n = { ...createNode("menubar"), id: "m" };
    const menus = (n.props as { items: MenubarMenu[] }).items;
    expect(menus.map((m) => m.label)).toEqual(["File", "Edit"]);
    expect(menus[0]!.items.map((it) => it.label)).toEqual(["New Tab", "New Window"]);
  });

  test("menubarMenus grows a View menu and sets a page href", () => {
    const n = { ...createNode("menubar"), id: "m" };
    const d = setPhase6bProp(bareDoc(n), "m", {
      kind: "menubarMenus",
      value: [
        {
          label: "File",
          items: [
            { label: "หน้าแรก", href: "/" },
            { label: "สร้างไฟล์ใหม่", href: "/new" },
          ],
        },
        { label: "Edit", items: [{ label: "Undo", href: "" }] },
        { label: "View", items: [{ label: "Zoom", href: "" }] },
      ],
    })!;
    const menus = (d.nodes.m.props as { items: MenubarMenu[] }).items;
    expect(menus).toHaveLength(3);
    expect(menus[0]!.items[0]).toEqual({ label: "หน้าแรก", href: "/" });
    expect(menus[0]!.items[1]!.href).toBe("/new");
  });

  test("menubarMenus caps menus and items at 100", () => {
    const manyMenus = Array.from({ length: 120 }, (_, i) => ({
      label: `M${i}`,
      items: Array.from({ length: 120 }, (_, j) => ({ label: `I${j}`, href: `/${i}/${j}` })),
    }));
    const d = setPhase6bProp(bareDoc({ ...createNode("menubar"), id: "m" }), "m", {
      kind: "menubarMenus",
      value: manyMenus,
    })!;
    const menus = (d.nodes.m.props as { items: MenubarMenu[] }).items;
    expect(menus).toHaveLength(MAX_SELECT_OPTIONS);
    expect(menus[0]!.items).toHaveLength(MAX_SELECT_OPTIONS);
  });

  test("tabs grow past two and clamp active when shrinking", () => {
    let d = bareDoc({ ...createNode("tabs"), id: "t" });
    expect((d.nodes.t.props as { items: unknown[] }).items).toHaveLength(2);
    d = setPhase6bProp(d, "t", {
      kind: "labelTextItems",
      value: [
        { label: "Tab 1", text: "One" },
        { label: "Tab 2", text: "Two" },
        { label: "Tab 3", text: "Three" },
      ],
    })!;
    expect((d.nodes.t.props as { items: { label: string }[] }).items.map((i) => i.label)).toEqual([
      "Tab 1",
      "Tab 2",
      "Tab 3",
    ]);
    d = setPhase6bProp(d, "t", { kind: "num", key: "active", value: 2 })!;
    d = setPhase6bProp(d, "t", {
      kind: "labelTextItems",
      value: [{ label: "Only", text: "One" }],
    })!;
    expect((d.nodes.t.props as { active: number; items: unknown[] }).active).toBe(0);
    expect((d.nodes.t.props as { items: unknown[] }).items).toHaveLength(1);

    d = bareDoc({ ...createNode("accordion"), id: "a" });
    d = setPhase6bProp(d, "a", { kind: "num", key: "open", value: 1 })!;
    d = setPhase6bProp(d, "a", {
      kind: "labelTextItems",
      value: [{ label: "One", text: "Content" }],
    })!;
    expect((d.nodes.a.props as { open: number }).open).toBe(0);
  });

  test("breadcrumb / navigationMenu href pairs grow, shrink, and cap at 100", () => {
    let d = setPhase6bProp(bareDoc({ ...createNode("breadcrumb"), id: "b" }), "b", {
      kind: "labelHrefItems",
      value: [
        { label: "Home", href: "/" },
        { label: "Docs", href: "/docs" },
        { label: "API", href: "/api" },
      ],
    })!;
    expect((d.nodes.b.props as { items: unknown[] }).items).toHaveLength(3);
    d = setPhase6bProp(d, "b", { kind: "pair", index: 1, key: "href", value: "/guide" })!;
    expect((d.nodes.b.props as { items: { href: string }[] }).items[1]!.href).toBe("/guide");

    const many = Array.from({ length: 120 }, (_, i) => ({ label: `L${i}`, href: `/${i}` }));
    d = setPhase6bProp(bareDoc({ ...createNode("navigationMenu"), id: "n" }), "n", {
      kind: "labelHrefItems",
      value: many,
    })!;
    expect((d.nodes.n.props as { items: unknown[] }).items).toHaveLength(MAX_SELECT_OPTIONS);
  });

  test("wrong patch kind is refused", () => {
    expect(
      setPhase6bProp(bareDoc({ ...createNode("menubar"), id: "m" }), "m", {
        kind: "labelHrefItems",
        value: [{ label: "x", href: "/" }],
      }),
    ).toBeNull();
    expect(
      setPhase6bProp(bareDoc({ ...createNode("menubar"), id: "m" }), "m", {
        kind: "labelTextItems",
        value: [{ label: "x", text: "y" }],
      }),
    ).toBeNull();
    expect(
      setPhase6bProp(bareDoc({ ...createNode("breadcrumb"), id: "b" }), "b", {
        kind: "labelTextItems",
        value: [{ label: "x", text: "y" }],
      }),
    ).toBeNull();
    expect(
      setPhase6bProp(bareDoc({ ...createNode("breadcrumb"), id: "b" }), "b", {
        kind: "menubarMenus",
        value: [{ label: "File", items: [] }],
      }),
    ).toBeNull();
    // dropdown / pagination now accept labelHrefItems (shadcn link items).
    expect(
      setPhase6bProp(bareDoc({ ...createNode("dropdownMenu"), id: "d" }), "d", {
        kind: "labelHrefItems",
        value: [{ label: "x", href: "/" }],
      }),
    ).not.toBeNull();
  });
});
