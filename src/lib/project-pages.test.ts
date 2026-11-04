import { describe, expect, test } from "bun:test";
import {
  ensurePages,
  isProjectDirty,
  makeProjectPage,
  switchToPage,
  syncOpenIntoPages,
} from "./project-pages";
import type { PageDocument } from "@/schema";

function baseDoc(): PageDocument {
  const home = makeProjectPage("หน้าแรก", "/");
  // makeProjectPage always uses a fresh root; force path "/"
  home.path = "/";
  const about = makeProjectPage("เกี่ยวกับ", "/about");
  return {
    version: 5,
    meta: { title: "T" },
    root: home.root,
    nodes: home.nodes,
    pages: [home, about],
  };
}

describe("isProjectDirty", () => {
  test("switching pages without edits is not dirty", () => {
    const saved = ensurePages(baseDoc());
    const aboutId = saved.pages![1]!.id;
    const switched = switchToPage(saved, aboutId)!;
    expect(isProjectDirty(switched, saved)).toBe(false);
    // sync then switch (PagesPanel path)
    const synced = syncOpenIntoPages(saved);
    const again = switchToPage(synced, aboutId)!;
    expect(isProjectDirty(again, saved)).toBe(false);
  });

  test("renaming a page is dirty", () => {
    const saved = ensurePages(baseDoc());
    const pages = saved.pages!.map((p, i) => (i === 1 ? { ...p, name: "X" } : p));
    const edited = { ...saved, pages };
    expect(isProjectDirty(edited, saved)).toBe(true);
  });

  test("editing open-tree nodes is dirty after sync", () => {
    const saved = ensurePages(baseDoc());
    const root = saved.nodes[saved.root]!;
    const nodes = {
      ...saved.nodes,
      [saved.root]: { ...root, style: { ...root.style, fontSize: 20 } },
    };
    const edited = syncOpenIntoPages({ ...saved, nodes });
    expect(isProjectDirty(edited, saved)).toBe(true);
  });
});
