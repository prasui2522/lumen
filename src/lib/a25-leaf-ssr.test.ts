import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A2LeafView } from "@/components/editor/a2-view";
import { createNode } from "@/lib/document-ops";

// F2: the canvas-only hit area is for an interactive (editable) separator only; a read-only render gets none.
test("F2: data-cv-hit only on an interactive separator, never on other leaves", () => {
  const sep = { ...createNode("separator"), id: "s" };
  const html = (handlers: Record<string, unknown>, n = sep) => renderToStaticMarkup(createElement(A2LeafView, { node: n, handlers, style: n.style }));
  expect(html({ onClick: () => undefined })).toContain("data-cv-hit");
  expect(html({})).not.toContain("data-cv-hit");
  const badge = { ...createNode("badge"), id: "b" };
  expect(html({ onClick: () => undefined }, badge)).not.toContain("data-cv-hit");
});
