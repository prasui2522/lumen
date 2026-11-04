import { createNode, findParent } from "@/lib/document-ops";
import {
  getChildren,
  isLocked,
  type Node,
  type NodeId,
  type PageDocument,
} from "@/schema";

/**
 * Section templates (PHASE-4-SPEC P4-S1). An insert action, not a saved type:
 * the tree is ordinary palette nodes, and the document version is not touched.
 */
export const TEMPLATES = [
  { id: "hero", name: "แนะนำ", description: "หัวข้อ ข้อความ และปุ่มกลางหน้า" },
  { id: "split", name: "ข้อความและรูป", description: "รูปคู่กับหัวข้อและข้อความ" },
  { id: "cta", name: "ชวนทำ", description: "หัวข้อ ข้อความ และปุ่มชวนทำ" },
  { id: "features", name: "จุดเด่น", description: "หัวข้อกับสามจุดเด่น ไม่มีไอคอน" },
  { id: "footer", name: "ท้ายหน้า", description: "ข้อความลิขสิทธิ์และลิงก์ท้ายหน้า" },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];

export function isTemplateId(v: string): v is TemplateId {
  return TEMPLATES.some((t) => t.id === v);
}

export type BuiltTemplate = {
  nodes: Node[];
  /** Page child. The rest of the tree hangs off it. */
  sectionId: NodeId;
  /** First heading, or the copyright text when the template has no heading. */
  focusId: NodeId;
};

function heading(level: 1 | 2 | 3, content: string, center = false): Node {
  const n = createNode("heading");
  return {
    ...n,
    props: { type: "heading", level, content },
    style: center ? { textAlign: "center" } : {},
  };
}

function text(content: string, center = false): Node {
  const n = createNode("text");
  return {
    ...n,
    props: { type: "text", content },
    style: center ? { textAlign: "center" } : {},
  };
}

function button(label: string): Node {
  const n = createNode("button");
  return { ...n, props: { type: "button", label } };
}

function link(label: string): Node {
  const n = createNode("link");
  return { ...n, props: { type: "link", label, href: "#" } };
}

function image(): Node {
  return createNode("image");
}

function section(children: NodeId[], center = false): Node {
  const n = createNode("section");
  return {
    ...n,
    props: { type: "section", children },
    style: center ? { textAlign: "center" } : {},
  };
}

/** Column box. Direction stays the container default, so it is omitted. */
function box(children: NodeId[]): Node {
  const n = createNode("container");
  return { ...n, props: { type: "container", children } };
}

/** Side-by-side row. Gap is not a type default (0), so it is set. */
function row(children: NodeId[]): Node {
  const n = createNode("container");
  return { ...n, props: { type: "container", children, direction: "row", gap: 16 } };
}

function pack(list: Node[], sectionNode: Node, focusId: NodeId): BuiltTemplate {
  if (list.length >= 15) throw new Error("template exceeds 14 nodes");
  return { nodes: list, sectionId: sectionNode.id, focusId };
}

export function buildTemplate(id: TemplateId): BuiltTemplate {
  if (id === "hero") {
    const h = heading(1, "ยินดีต้อนรับ", true);
    const t = text("แนะนำตัวสั้น ๆ", true);
    const b = button("เริ่มต้น");
    const s = section([h.id, t.id, b.id], true);
    return pack([s, h, t, b], s, h.id);
  }
  if (id === "split") {
    const img = image();
    const left = box([img.id]);
    const h = heading(2, "เรื่องราว");
    const t = text("ข้อความคู่กับรูป");
    const right = box([h.id, t.id]);
    const r = row([left.id, right.id]);
    const s = section([r.id]);
    return pack([s, r, left, img, right, h, t], s, h.id);
  }
  if (id === "cta") {
    const h = heading(2, "พร้อมหรือยัง");
    const t = text("ชวนให้ลงมือทำ");
    const b = button("ติดต่อ");
    const s = section([h.id, t.id, b.id]);
    return pack([s, h, t, b], s, h.id);
  }
  if (id === "features") {
    const items: { title: string; body: string }[] = [
      { title: "เร็ว", body: "โหลดไม่นาน" },
      { title: "ชัด", body: "อ่านง่าย" },
      { title: "ใช้งานง่าย", body: "แก้ได้ทันที" },
    ];
    const built = items.map((item) => {
      const h = heading(3, item.title);
      const t = text(item.body);
      const b = box([h.id, t.id]);
      return { h, t, b };
    });
    const h = heading(2, "จุดเด่น");
    const r = row(built.map((x) => x.b.id));
    const s = section([h.id, r.id]);
    const nodes: Node[] = [s, h, r];
    for (const x of built) nodes.push(x.b, x.h, x.t);
    return pack(nodes, s, h.id);
  }
  const copy = text("© 2026");
  const links = [link("หน้าแรก"), link("เกี่ยวกับ"), link("ติดต่อ")];
  const r = row(links.map((n) => n.id));
  const s = section([copy.id, r.id]);
  return pack([s, copy, r, ...links], s, copy.id);
}

/**
 * End of the page, unless the selection is a section (or inside one) that is
 * a direct child of the page — then just after that section. Not the palette
 * insert target, which appends inside a selected container.
 */
export function templateInsertIndex(doc: PageDocument, selectedId: NodeId | null): number | null {
  const page = doc.nodes[doc.root];
  if (!page || page.props.type !== "page" || isLocked(page)) return null;
  const kids = getChildren(page);
  if (!selectedId || selectedId === doc.root || !doc.nodes[selectedId]) return kids.length;
  let cur: NodeId | null = selectedId;
  while (cur && cur !== doc.root) {
    const node = doc.nodes[cur];
    if (node?.type === "section") {
      const parent = findParent(doc, cur);
      if (parent?.parentId === doc.root) return parent.index + 1;
    }
    const parent = findParent(doc, cur);
    if (!parent) break;
    cur = parent.parentId;
  }
  return kids.length;
}

/** One new document. Caller writes it once so undo drops the whole tree. */
export function applyTemplate(
  doc: PageDocument,
  selectedId: NodeId | null,
  built: BuiltTemplate,
): PageDocument | null {
  const index = templateInsertIndex(doc, selectedId);
  if (index === null) return null;
  const page = doc.nodes[doc.root];
  if (!page || page.props.type !== "page") return null;
  const kids = [...getChildren(page)];
  kids.splice(index, 0, built.sectionId);
  const nodes: PageDocument["nodes"] = {
    ...doc.nodes,
    [doc.root]: { ...page, props: { ...page.props, children: kids } },
  };
  for (const node of built.nodes) {
    if (nodes[node.id]) return null;
    nodes[node.id] = node;
  }
  return { ...doc, nodes };
}
