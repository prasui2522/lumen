import { describe, expect, test } from "bun:test";
import type { ButtonProps, PageDocument } from "@/schema";
import { createNode, insertNode, setNodeProp } from "./document-ops";
import { makeProjectPage } from "./project-pages";

function docWithButton(props: Partial<ButtonProps> = {}, locked = false): { doc: PageDocument; id: string } {
  const home = makeProjectPage("หน้าแรก", "/");
  const base: PageDocument = { version: 5, meta: { title: "T" }, root: home.root, nodes: home.nodes };
  const btn = createNode("button");
  const node = { ...btn, props: { ...(btn.props as ButtonProps), ...props }, ...(locked ? { locked: true } : {}) };
  const doc = insertNode(base, node, base.root, 0)!;
  return { doc, id: node.id };
}

const props = (doc: PageDocument, id: string) => doc.nodes[id]!.props as ButtonProps;

describe("setNodeProp button href (spec §2 write rule)", () => {
  test("non-blank → trimmed href + action link", () => {
    const { doc, id } = docWithButton();
    const next = setNodeProp(doc, id, "href", "  /login  ")!;
    expect(props(next, id)).toMatchObject({ href: "/login", action: "link", label: "ปุ่ม" });
  });
  test("blank → href removed + action none", () => {
    const { doc, id } = docWithButton({ href: "/login", action: "link" });
    const next = setNodeProp(doc, id, "href", "   ")!;
    expect(props(next, id).action).toBe("none");
    expect("href" in props(next, id)).toBe(false);
  });
  test("same value or already unlinked → no write", () => {
    const a = docWithButton({ href: "/login", action: "link" });
    expect(setNodeProp(a.doc, a.id, "href", "/login ")).toBeNull();
    const b = docWithButton();
    expect(setNodeProp(b.doc, b.id, "href", "")).toBeNull();
    const c = docWithButton({ action: "none" });
    expect(setNodeProp(c.doc, c.id, "href", "")).toBeNull();
  });
  test("stale href on an unlinked button is relinked or cleared", () => {
    const { doc, id } = docWithButton({ href: "/old", action: "none" });
    expect(props(setNodeProp(doc, id, "href", "/old")!, id).action).toBe("link");
    expect("href" in props(setNodeProp(doc, id, "href", "")!, id)).toBe(false);
  });
  test("locked button → null", () => {
    const { doc, id } = docWithButton({}, true);
    expect(setNodeProp(doc, id, "href", "/login")).toBeNull();
  });
});
