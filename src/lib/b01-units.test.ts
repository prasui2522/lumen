// B0.1 (Designer pass on B0): Vite template constants mirror the static export.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import looks from "./kind-looks.json";

const ROOT = join(import.meta.dir, "..", "..");
const rn = readFileSync(join(ROOT, "export-templates/vite-react/src/lib/render-node.tsx"), "utf8");
const rs = readFileSync(join(ROOT, "src-tauri/src/compiler.rs"), "utf8");
const constOf = (name: string) => new RegExp(`export const ${name} = "([^"]*)"`).exec(rn)?.[1];

describe("B0.1 Vite template mirrors the static markup", () => {
  test("spinner path and label = kind-looks.json a2.texts", () => {
    expect(constOf("SPINNER_PATH")).toBe((looks as any).a2.texts.spinnerPath);
    expect(constOf("SPINNER_LABEL")).toBe((looks as any).a2.texts.spinnerLabel);
  });
  test("page attribute = compiler.rs PAGE_ATTR", () => {
    expect(constOf("PAGE_ATTR")).toBe(/pub const PAGE_ATTR: &str = "([^"]+)"/.exec(rs)?.[1]);
  });
  test("PLAIN_KINDS (restate type defaults) = compiler.rs RESTATE_KINDS", () => {
    const ts = /const PLAIN_KINDS = new Set\(\[([^\]]*)\]\)/.exec(rn)![1].match(/"[^"]+"/g)!.map((s) => s.slice(1, -1));
    const rsList = /RESTATE_KINDS: \[NodeType; \d+\] = \[([^\]]*)\]/s.exec(rs)![1].match(/NodeType::(\w+)/g)!.map((s) => s.slice(10));
    expect(ts.map((t) => t.toLowerCase()).sort()).toEqual(rsList.map((t) => t.toLowerCase()).sort());
  });
});
