// N5 in a REAL Chromium: the editor route with a document the canvas cannot draw (aspectRatio 9/16) lands on the Thai error
// page, not React Router's English "Unexpected Application Error". Also a source check that App.tsx wires it.
// Skipped, and reported as skipped, ONLY when no headless Chromium is installed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { placedDocument } from "@/lib/a25-doc";
import { CHROME, bootBrowser, click, closeBrowser, openPage, rectOf, sleep, type Browser } from "@/lib/cdp-kit.test";

const ENTRY = join(import.meta.dir, "..", "components", "editor", "a25-error-entry.tsx");
let b: Browser | null = null;
beforeAll(async () => {
  if (!CHROME) return;
  b = await bootBrowser(ENTRY, `<div id="root"></div>`);
  if (b.bundleError) throw new Error(b.bundleError);
}, 60000);
afterAll(() => closeBrowser(b));

test("reports which browser the A2.5 error-page test used", () => {
  console.log(CHROME ? `a25-error: ${CHROME}` : "a25-error: NO headless Chromium, the behavioural test is SKIPPED");
});

test("App.tsx mounts the app's Thai error element on the editor route, and preloads its chunk at idle", () => {
  const app = readFileSync(join(import.meta.dir, "..", "App.tsx"), "utf8");
  expect(app).toMatch(/path: "\/editor\/:projectId",[\s\S]*?errorElement: editorErrorElement/);
  expect(app).toContain("preloadEditorErrorPage()");
  expect(app).not.toContain("EditorErrorPage.preload"); // the page itself stays out of the entry chunk's static imports
  expect(readFileSync(join(import.meta.dir, "..", "pages", "editor-error-element.tsx"), "utf8")).toContain('import("@/pages/EditorErrorPage")');
});

describe.skipIf(!CHROME)("N5: the editor route's error page", () => {
  const bad = () => {
    const d = placedDocument();
    return { ...d, nodes: { ...d.nodes, ratio: { ...d.nodes.ratio, props: { ...d.nodes.ratio.props, ratio: "9/16" } } } };
  };

  test("an unknown aspect ratio (9/16) shows the Thai error page: role=alert, heading focused, links home, details collapsed", async () => {
    await openPage(b!, bad());
    const cdp = b!.cdp;
    for (let i = 0; i < 40 && !(await cdp.eval(`!!document.querySelector('[role=alert]')`)); i++) await sleep(50);
    const text = await cdp.eval<string>(`document.body.innerText`);
    expect(text).toContain("เปิดตัวแก้ไขไม่ได้");
    expect(text).toContain("กลับไปรายการโปรเจกต์");
    expect(text).toContain("โหลดใหม่");
    expect(text).not.toContain("Unexpected Application Error");
    expect(text).not.toContain("Hey developer");
    expect(await cdp.eval(`document.activeElement&&document.activeElement.tagName`)).toBe("H1");
    expect(await cdp.eval(`document.documentElement.lang||''`)).toBeDefined();
    // the technical line names the cause, inside a collapsed <details>
    expect(await cdp.eval(`document.querySelector('details').open`)).toBe(false);
    expect(await cdp.eval(`document.querySelector('details p').textContent`)).toContain("9/16");
    // the link really leads home (client-side)
    const r = await rectOf(cdp, `a[href="/"]`);
    await click(cdp, r.x + r.w / 2, r.y + r.h / 2);
    await sleep(150);
    expect(await cdp.eval(`document.getElementById('home')&&document.getElementById('home').textContent`)).toBe("รายการโปรเจกต์");
  });

  test("a good document does NOT show the error page", async () => {
    await openPage(b!, placedDocument());
    expect(await b!.cdp.eval(`document.body.innerText.includes('เปิดตัวแก้ไขไม่ได้')`)).toBe(false);
    expect(await b!.cdp.eval(`!!document.querySelector('[data-node-id="ratio"]')`)).toBe(true);
  });
});
