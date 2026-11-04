// Pre-A4: breadcrumb href row — type URL or pick a page via เลือกหน้า.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Node, PageDocument } from "@/schema";
import { createNode, insertNode } from "@/lib/document-ops";
import { placedDocument } from "@/lib/a25-doc";
import { BODY, CSS, ENTRY } from "@/lib/a25-kinds.test";
import { CHROME, bootBrowser, click, closeBrowser, openPage, press, rectOf, sleep, type Browser } from "@/lib/cdp-kit.test";

let b: Browser | null = null;
beforeAll(async () => {
  if (!CHROME) return;
  b = await bootBrowser(ENTRY, BODY, CSS);
  if (b.bundleError) throw new Error(b.bundleError);
}, 60000);
afterAll(() => closeBrowser(b));

test("reports which browser the href-pairs tests used", () => {
  console.log(CHROME ? `href-pairs: ${CHROME}` : "href-pairs: NO headless Chromium, SKIPPED");
});

function doc(): PageDocument {
  let d = placedDocument();
  const kids = (d.nodes.root.props as { children: string[] }).children;
  const next = insertNode(d, { ...createNode("breadcrumb"), id: "bc" }, "root", kids.length === 0 ? 0 : 1);
  if (!next) throw new Error("insert");
  return next;
}

const node = (id: string) => b!.cdp.eval<Node>(`window.__stores.projects.getState().openDocument.nodes[${JSON.stringify(id)}]`);

describe.skipIf(!CHROME)("breadcrumb href + page picker", () => {
  test("type a path into the first href field; เลือกหน้า and เพิ่มรายการ exist", async () => {
    await openPage(b!, doc(), `window.__SELECT="bc";`);
    // Wait for lazy HrefField
    for (let i = 0; i < 40; i++) {
      const ready = await b!.cdp.eval<boolean>(`!!document.getElementById('p6-href-h-0')`);
      if (ready) break;
      await sleep(50);
    }
    expect(await b!.cdp.eval<boolean>(`!!document.getElementById('p6-href-h-0')`)).toBe(true);
    expect(await b!.cdp.eval<boolean>(`!!document.querySelector('[aria-label="เลือกหน้า"]')`)).toBe(true);
    expect(await b!.cdp.eval<string>(`[...document.querySelectorAll('button')].map(b=>b.textContent).join('|')`)).toContain(
      "เพิ่มรายการ",
    );

    const box = await rectOf(b!.cdp, "#p6-href-h-0");
    await click(b!.cdp, box.x + 8, box.y + box.h / 2);
    await b!.cdp.eval(`(()=>{const el=document.getElementById('p6-href-h-0');el.focus();el.select();})()`);
    await b!.cdp.send("Input.insertText", { text: "/about" });
    await press(b!.cdp, "Enter", "Enter", 13);
    await sleep(80);
    expect(((await node("bc")).props as { items: { href: string }[] }).items[0]!.href).toBe("/about");
  });
});
