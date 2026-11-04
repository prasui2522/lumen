// Shared by the A2.5 tests: the document the palette creates for the nine A2 kinds (a25-placed.test.ts keeps it in sync with
// the Rust fixture a25-placed.json).
import type { Node, PageDocument } from "@/schema";
import { createNode, insertNode, type PaletteType } from "@/lib/document-ops";

const mk = (type: PaletteType, id: string, patch: (n: Node) => Node = (n) => n): Node => patch({ ...createNode(type), id });

/** The palette-created nodes, in a fixed order with fixed ids, plus the F3 (spacer in aspectRatio) and F5 (input in buttonGroup) shapes. */
export function placedDocument(): PageDocument {
  let doc: PageDocument = {
    version: 4,
    meta: { title: "a25-placed", lang: "th" },
    root: "root",
    nodes: { root: { id: "root", type: "page", props: { type: "page", children: [] }, style: {} } },
  } as PageDocument;
  const add = (n: Node, parent = "root") => {
    const kids = (doc.nodes[parent].props as { children: string[] }).children;
    const next = insertNode(doc, n, parent, kids.length);
    if (!next) throw new Error(`cannot insert ${n.id}`);
    doc = next;
  };
  const text = (id: string, content: string) => mk("text", id, (n) => ({ ...n, props: { ...n.props, content } as Node["props"] }));
  add(mk("card", "card"));
  add(text("card-t", "ในการ์ด"), "card");
  add(mk("alert", "alert"));
  add(text("alert-t", "ข้อความแจ้งเตือน"), "alert");
  add(mk("badge", "badge"));
  add(mk("separator", "sep"));
  add(mk("skeleton", "skel"));
  add(mk("spinner", "spin"));
  add(mk("aspectRatio", "ratio"));
  add(mk("spacer", "ratio-sp"), "ratio"); // F3
  add(mk("scrollArea", "scroll"));
  add(text("scroll-t", "เลื่อนได้"), "scroll");
  add(mk("buttonGroup", "group"));
  add(mk("button", "group-b1"), "group");
  add(mk("input", "group-in"), "group"); // F5
  add(mk("button", "group-b2"), "group");
  return doc;
}

