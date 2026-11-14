import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { followPreviewRoute } from "./preview-page-nav";
import { isSafeWbNavigatePath } from "./wb-navigate";
import { frameMessage } from "./preview-runtime";
import { viteFrameOrigin, viteFrameUrl, viteFrameAllowed } from "./preview-sidecar";
import { pageMarkerHref, resolvePageMarker } from "./preview-links";
import type { PageDocument } from "@/schema";

const ROOT = join(import.meta.dir, "../..");

function multiPageDoc(): PageDocument {
  return {
    version: 1,
    meta: { title: "t" },
    root: "r1",
    nodes: {
      r1: { id: "r1", type: "page", props: { type: "page", children: [] }, style: {} },
    },
    pages: [
      {
        id: "home",
        name: "หน้าแรก",
        path: "/",
        root: "r1",
        nodes: {
          r1: { id: "r1", type: "page", props: { type: "page", children: [] }, style: {} },
        },
      },
      {
        id: "about",
        name: "เกี่ยวกับ",
        path: "/about",
        root: "r2",
        nodes: {
          r2: { id: "r2", type: "page", props: { type: "page", children: [] }, style: {} },
        },
      },
    ],
  } as PageDocument;
}

describe("isSafeWbNavigatePath", () => {
  test("allows same-site paths only", () => {
    expect(isSafeWbNavigatePath("/")).toBe(true);
    expect(isSafeWbNavigatePath("/about")).toBe(true);
    expect(isSafeWbNavigatePath("/a/b")).toBe(true);
    expect(isSafeWbNavigatePath("//evil.example/x")).toBe(false);
    expect(isSafeWbNavigatePath("/a\\b")).toBe(false);
    expect(isSafeWbNavigatePath("rel")).toBe(false);
    expect(isSafeWbNavigatePath(42)).toBe(false);
    expect(isSafeWbNavigatePath(null)).toBe(false);
  });

  test("app and template helpers stay identical", () => {
    const app = readFileSync(join(ROOT, "src/lib/wb-navigate.ts"), "utf8").replace(
      /Keep in lockstep with `[^`]+`\./,
      "LOCKSTEP.",
    );
    const tpl = readFileSync(
      join(ROOT, "export-templates/vite-react/src/lib/wb-navigate.ts"),
      "utf8",
    ).replace(/Keep in lockstep with `[^`]+`\./, "LOCKSTEP.");
    expect(tpl).toBe(app);
    const runtime = readFileSync(
      join(ROOT, "export-templates/vite-react/src/preview-runtime.tsx"),
      "utf8",
    );
    expect(runtime).toContain('import { isSafeWbNavigatePath } from "./lib/wb-navigate"');
    expect(runtime).toContain("if (!isSafeWbNavigatePath(m.path)) return;");
  });
});

describe("followPreviewRoute (wb:route → editor page)", () => {
  test("switches to another page and ignores unknown / current paths", () => {
    const doc = multiPageDoc();
    const toAbout = followPreviewRoute(doc, "/about", "home");
    expect(toAbout?.pageId).toBe("about");
    expect(toAbout?.pageName).toBe("เกี่ยวกับ");
    expect(toAbout?.doc.pages?.find((p) => p.id === "about")).toBeTruthy();

    expect(followPreviewRoute(doc, "/about", "about")).toBeNull();
    expect(followPreviewRoute(doc, "/missing", "home")).toBeNull();
    expect(followPreviewRoute(doc, "/", "home")).toBeNull();
  });

  test("DeviceStage wires followPreviewRoute", () => {
    const src = readFileSync(join(ROOT, "src/components/editor/preview/DeviceStage.tsx"), "utf8");
    expect(src).toContain("followPreviewRoute");
    expect(src).toContain("openPageFromRoute");
  });

  test("marker href resolves to the same page switch as wb:route", () => {
    const doc = multiPageDoc();
    const pages = doc.pages!;
    const marker = pageMarkerHref("/about");
    const viaMarker = resolvePageMarker(marker, pages, "home");
    const viaRoute = followPreviewRoute(doc, "/about", "home");
    expect(viaMarker?.id).toBe("about");
    expect(viaRoute?.pageId).toBe("about");
    expect(resolvePageMarker(pageMarkerHref("/about"), pages, "about")).toBeNull();
  });
});

describe("Vite frame message origin (dev-build)", () => {
  test("viteFrameOrigin follows the bridge or 127.0.0.1 URL", () => {
    expect(viteFrameOrigin("http://127.0.0.1:5173/", 5173)).toBe("http://127.0.0.1:5173");
    expect(viteFrameOrigin("wbpreview://localhost/", 5173)).toBe("wbpreview://localhost");
    expect(viteFrameUrl(5173, "/about")).toContain("127.0.0.1:5173/about");
  });

  test("frameMessage accepts Vite origin from the frame window only", () => {
    const win = {};
    const frame = { contentWindow: win } as unknown as HTMLIFrameElement;
    const origin = "http://127.0.0.1:5173";
    expect(
      frameMessage({ source: win, origin, data: { type: "wb:route", path: "/about" } }, frame, origin),
    ).toEqual({ type: "wb:route", path: "/about" });
    expect(
      frameMessage(
        { source: win, origin: "null", data: { type: "wb:route", path: "/about" } },
        frame,
        origin,
      ),
    ).toBeNull();
    expect(
      frameMessage(
        { source: {}, origin, data: { type: "wb:route", path: "/about" } },
        frame,
        origin,
      ),
    ).toBeNull();
  });

  test("ViteFrame still uses the sandbox tokens and origin-aware frameMessage", () => {
    const src = readFileSync(join(ROOT, "src/components/editor/preview/ViteFrame.tsx"), "utf8");
    expect(src).toContain('export const VITE_FRAME_SANDBOX = "allow-scripts allow-same-origin"');
    expect(src).toContain("frameMessage(e, ref.current, origin)");
    expect(src).toContain("viteFrameOrigin");
    expect(viteFrameAllowed(true, {
      state: "running",
      port: 5173,
      pssMb: null,
      error: null,
      errorCode: null,
      session: 1,
    })).toBe(true);
  });
});
