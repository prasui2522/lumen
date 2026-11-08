import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PageDocument } from "@/schema";
import { SITE_JSON_HISTORY_KEY, SITE_JSON_PATH, viewFromParsedSite } from "./site-json-edit";

const page = (id: string, root: string): PageDocument["pages"] => [
  {
    id,
    name: id,
    path: id === "home" ? "/" : `/${id}`,
    root,
    nodes: {
      [root]: {
        id: root,
        type: "page",
        props: { type: "page", children: [] },
      } as never,
    },
  },
];

function doc(version: PageDocument["version"], pages: NonNullable<PageDocument["pages"]>): PageDocument {
  const home = pages[0]!;
  return {
    version,
    meta: { title: "T" },
    root: home.root,
    nodes: home.nodes,
    pages,
  };
}

describe("viewFromParsedSite", () => {
  test("keeps the open document version and the open page", () => {
    const current = doc(4, page("home", "p"));
    const parsed = doc(1, [
      ...page("home", "p")!,
      ...page("about", "a")!,
    ]);
    parsed.root = "p";
    const next = viewFromParsedSite(parsed, current, "about");
    expect(next.doc.version).toBe(4);
    expect(next.openPageId).toBe("about");
    expect(next.doc.root).toBe("a");
    expect(next.doc.pages).toHaveLength(2);
  });

  test("falls back to the first page when the open id is gone", () => {
    const current = doc(5, page("home", "p"));
    const parsed = doc(1, page("home", "p"));
    const next = viewFromParsedSite(parsed, current, "missing");
    expect(next.openPageId).toBe("home");
    expect(next.doc.version).toBe(5);
    expect(next.doc.root).toBe("p");
  });
});

describe("code-view site.json editing", () => {
  test("only site.json is editable and applies through parse_site_json", () => {
    const src = readFileSync(
      join(import.meta.dir, "..", "components", "editor", "code-view.tsx"),
      "utf8",
    );
    expect(src).toContain('invoke<PageDocument>("parse_site_json"');
    expect(src).toContain("SITE_JSON_HISTORY_KEY");
    expect(SITE_JSON_HISTORY_KEY).toBe("code-site-json");
    expect(src).toContain("EditorState.readOnly.of(true)");
    expect(src).toContain("editable");
    expect(src).toContain("JSON ไม่ถูกต้อง");
    expect(src).toContain(SITE_JSON_PATH);
  });
});
