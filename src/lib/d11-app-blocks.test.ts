/**
 * App-shell blocks: dashboard, sidebar, login. Structure adapted from shadcn/ui
 * blocks and re-authored as static node trees.
 */
import { describe, expect, test } from "bun:test";
import { insertBlock } from "@/lib/block-insert";
import { validateBlock } from "@/lib/block-format";
import { BLOCK_CATEGORIES } from "@/components/editor/blocks-flyout";
import {
  loadBlocksRegistry,
  resetBlocksRegistryCache,
} from "@/lib/blocks-registry";
import batch from "@/lib/blocks-registry/d11-app.json";
import type { PageDocument } from "@/schema";

const IDS = [
  "dashboard-sidebar",
  "sidebar-icons",
  "sidebar-submenus",
  "login-split",
  "login-muted",
  "signup-muted",
] as const;

const emptyDoc = (): PageDocument => ({
  version: 2,
  meta: { title: "t", lang: "th" },
  root: "p",
  nodes: {
    p: { id: "p", type: "page", props: { type: "page", children: [] }, style: {} },
  },
});

describe("D11 app-shell blocks", () => {
  test("six blocks validate, cite shadcn, and contain no network URL or script", () => {
    expect(batch).toHaveLength(6);
    expect(JSON.stringify(batch)).not.toMatch(/https?:\/\//i);
    expect(JSON.stringify(batch)).not.toMatch(/<script/i);
    for (const raw of batch) {
      const { block, errors } = validateBlock(raw);
      expect(errors, JSON.stringify(errors)).toEqual([]);
      expect(IDS).toContain(block!.id as (typeof IDS)[number]);
      expect(block!.source).toEqual({
        kind: "mit",
        project: "shadcn/ui",
        ref: "ui.shadcn.com/blocks",
        retrieved: "2026-11-10",
      });
    }
  });

  test("flyout lists the back-office categories after the storefront group", () => {
    const ids = BLOCK_CATEGORIES.map((c) => c.id);
    expect(ids).toContain("dashboard");
    expect(ids).toContain("sidebar");
    expect(ids).toContain("login");
    const dash = BLOCK_CATEGORIES.find((c) => c.id === "dashboard");
    expect(dash?.group).toBe("back");
    expect(BLOCK_CATEGORIES.find((c) => c.id === "hero")?.group).toBe("front");
    expect(ids.indexOf("elements")).toBeLessThan(ids.indexOf("dashboard"));
  });

  test("registry includes the six blocks and inserting the dashboard yields a chart and a table", async () => {
    resetBlocksRegistryCache();
    const list = await loadBlocksRegistry();
    for (const id of IDS) expect(list.some((b) => b.id === id), id).toBe(true);
    const dash = list.find((b) => b.id === "dashboard-sidebar")!;
    const result = insertBlock(emptyDoc(), null, dash);
    expect(result).not.toBeNull();
    const types = Object.values(result!.doc.nodes).map((n) => n.type);
    expect(types).toContain("chart");
    expect(types).toContain("table");
    expect(JSON.stringify(result!.doc)).not.toMatch(/<script/i);
  });
});
