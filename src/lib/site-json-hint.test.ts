import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { NODE_TYPES, siteJsonHintLabels } from "./site-json-hint";

describe("R4 site.json hints", () => {
  test("type and style contexts", () => {
    expect(siteJsonHintLabels('{"type":"hea')).toContain("heading");
    expect(siteJsonHintLabels('{"style":{ "fon')).toContain("fontSize");
    expect(siteJsonHintLabels("{")).toContain("nodes");
  });

  test("node types stay aligned with schema.ts", () => {
    const schema = readFileSync(new URL("../schema.ts", import.meta.url), "utf8");
    const block = schema.slice(schema.indexOf("export type NodeType"), schema.indexOf("export type Node ="));
    for (const kind of NODE_TYPES) {
      expect(block).toContain(`"${kind}"`);
    }
  });

  test("code view wires search and completion", () => {
    const src = readFileSync(new URL("../components/editor/code-view.tsx", import.meta.url), "utf8");
    expect(src).toContain("siteJsonComplete");
    expect(src).toContain("ค้นหา");
    expect(src).toContain("searchKeymap");
  });
});
