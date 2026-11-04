import { createNode } from "@/lib/document-ops";
import type { Node, NodeId } from "@/schema";
import type { BuiltTemplate } from "@/lib/templates";

/**
 * Add-menu blocks (PHASE-5B-SPEC). Static trees of existing nodes.
 * Not a node kind, not a template, and not a document version change.
 * The page child is the block root. No extra section.
 */
export const BLOCKS = [
  { id: "card", name: "การ์ด" },
  { id: "alert", name: "แจ้งเตือน" },
  { id: "buttons", name: "ปุ่มเรียง" },
  { id: "badge", name: "ป้าย" },
  { id: "divider", name: "เส้นคั่น" },
  { id: "list", name: "ข้อความเรียง" },
] as const;

export type BlockId = (typeof BLOCKS)[number]["id"];

export function isBlockId(v: string): v is BlockId {
  return BLOCKS.some((b) => b.id === v);
}

/**
 * Plain colors already in the app, not a token name and not a CSS variable.
 * Border matches the canvas image placeholder. Muted fill matches the
 * compiler fixture page. Ink matches the default page/heading text.
 * The alert tint is a light wash of the default button blue (#0ea5e9).
 */
const BORDER = "#e2e8f0";
const MUTED = "#f8fafc";
const TINT = "#e0f2fe";
const INK = "#0f172a";

function heading(content: string): Node {
  const n = createNode("heading");
  return { ...n, props: { type: "heading", level: 2, content } };
}

function text(content: string, style: Node["style"] = {}): Node {
  const n = createNode("text");
  return { ...n, props: { type: "text", content }, style };
}

function button(label: string, style: Node["style"] = {}): Node {
  const n = createNode("button");
  return { ...n, props: { type: "button", label }, style };
}

function column(children: NodeId[], style: Node["style"]): Node {
  const n = createNode("container");
  return { ...n, props: { type: "container", children }, style };
}

function row(children: NodeId[], gap: number): Node {
  const n = createNode("container");
  return { ...n, props: { type: "container", children, direction: "row", gap } };
}

function tree(root: Node, rest: Node[], focusId: NodeId): BuiltTemplate {
  return { nodes: [root, ...rest], sectionId: root.id, focusId };
}

export function buildBlock(id: BlockId): BuiltTemplate {
  if (id === "card") {
    const h = heading("การ์ด");
    const t = text("รายละเอียดสั้น ๆ");
    const root = column([h.id, t.id], {
      padding: 16,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: BORDER,
      borderRadius: 8,
    });
    return tree(root, [h, t], h.id);
  }
  if (id === "alert") {
    const h = heading("หมายเหตุ");
    const t = text("ข้อความแจ้งเตือน");
    const root = column([h.id, t.id], {
      padding: 16,
      backgroundColor: TINT,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: BORDER,
    });
    return tree(root, [h, t], h.id);
  }
  if (id === "buttons") {
    const ok = button("ยืนยัน");
    const cancel = button("ยกเลิก", {
      backgroundColor: "transparent",
      color: INK,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: BORDER,
    });
    const root = row([ok.id, cancel.id], 8);
    return tree(root, [ok, cancel], ok.id);
  }
  if (id === "badge") {
    const t = text("ป้าย", {
      fontSize: 12,
      padding: { t: 2, r: 8, b: 2, l: 8 },
      borderRadius: 8,
      backgroundColor: MUTED,
    });
    return tree(t, [], t.id);
  }
  if (id === "divider") {
    const n = createNode("spacer");
    const s: Node = {
      ...n,
      props: { type: "spacer", size: 1 },
      style: { backgroundColor: BORDER },
    };
    return tree(s, [], s.id);
  }
  const a = text("ข้อแรก");
  const b = text("ข้อสอง");
  const c = text("ข้อสาม");
  const root = column([a.id, b.id, c.id], {});
  root.props = { type: "container", children: [a.id, b.id, c.id], gap: 8 };
  return tree(root, [a, b, c], a.id);
}
