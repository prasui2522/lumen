import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addPage, ensurePages } from "@/lib/project-pages";
import { resizedSize } from "@/lib/preview-chrome";
import { viteFrameAllowed, type SidecarStatus } from "@/lib/preview-sidecar";
import type { PageDocument } from "@/schema";

const ROOT = join(import.meta.dir, "..", "..");

const stopped: SidecarStatus = {
  state: "stopped",
  port: null,
  pssMb: null,
  error: null,
  errorCode: null,
  session: null,
};

describe("preview resume after idle stop", () => {
  test("a remembered running port is ignored until a fresh status confirms it", () => {
    const stale: SidecarStatus = { ...stopped, state: "running", port: 47301 };
    expect(viteFrameAllowed(false, stale)).toBe(false);
    expect(viteFrameAllowed(true, stale)).toBe(true);
    expect(viteFrameAllowed(true, stopped)).toBe(false);
    expect(viteFrameAllowed(true, { ...stopped, state: "running", port: null })).toBe(false);
  });

  test("PreviewStage refreshes status before opening the Vite frame", () => {
    const src = readFileSync(join(ROOT, "src/components/editor/PreviewStage.tsx"), "utf8");
    expect(src).toContain("sidecarStatus()");
    expect(src).toContain("publishSidecar");
    expect(src).toContain("viteFrameAllowed");
  });
});

describe("preview selection resize", () => {
  test("edges and corners change width and height, never below 8", () => {
    const start = { w: 100, h: 40 };
    expect(resizedSize(start, "e", 12, 0)).toEqual({ w: 112, h: 40 });
    expect(resizedSize(start, "w", 12, 0)).toEqual({ w: 88, h: 40 });
    expect(resizedSize(start, "s", 0, 5)).toEqual({ w: 100, h: 45 });
    expect(resizedSize(start, "n", 0, 5)).toEqual({ w: 100, h: 35 });
    expect(resizedSize(start, "se", 10, 10)).toEqual({ w: 110, h: 50 });
    expect(resizedSize(start, "w", 500, 0)).toEqual({ w: 8, h: 40 });
    expect(resizedSize(start, "n", 0, 500)).toEqual({ w: 100, h: 8 });
  });

  test("Tier 1 may post wb:boxes; Preview stage has no selection chrome (visitor view)", () => {
    const rt = readFileSync(join(ROOT, "export-templates/vite-react/src/preview-runtime.tsx"), "utf8");
    expect(rt).toContain('type: "wb:boxes"');
    const stage = readFileSync(join(ROOT, "src/components/editor/preview/DeviceStage.tsx"), "utf8");
    expect(stage).not.toContain("PreviewSelection");
    expect(stage).not.toContain("onSelect=");
    const frame = readFileSync(join(ROOT, "src/components/editor/preview/Tier1Frame.tsx"), "utf8");
    expect(frame).toContain('case "wb:boxes"');
  });
});

describe("add page command", () => {
  test("Ctrl+K still has เพิ่มหน้า and it calls addPage", () => {
    const src = readFileSync(join(ROOT, "src/components/editor/CommandPalette.tsx"), "utf8");
    expect(src).toContain("เพิ่มหน้า");
    expect(src).toContain('value="add-page"');
    expect(src).toMatch(/addPage\(ensurePages\(doc\), cur\)/);
    const pages = readFileSync(join(ROOT, "src/components/editor/PagesPanel.tsx"), "utf8");
    expect(pages).toContain('aria-label={t("addPage")}');
    expect(pages).toContain('size="icon-sm"');
  });

  test("addPage appends a page", () => {
    const doc = {
      version: 1,
      meta: { title: "t" },
      root: "p",
      nodes: { p: { id: "p", type: "page", name: "หน้า", props: { type: "page", children: [] }, style: {} } },
    } as PageDocument;
    const { doc: next } = addPage(ensurePages(doc), "p");
    expect(next.pages?.length).toBe(2);
  });
});
