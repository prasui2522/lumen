// Tabs panel — explicit เพิ่มแท็บ (not the old pipe textarea).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { LabelTextItem, Node, PageDocument } from "@/schema";
import { createNode, insertNode } from "@/lib/document-ops";
import { placedDocument } from "@/lib/a25-doc";
import { BODY, CSS, ENTRY } from "@/lib/a25-kinds.test";
import { CHROME, bootBrowser, closeBrowser, openPage, sleep, type Browser } from "@/lib/cdp-kit.test";

let b: Browser | null = null;
beforeAll(async () => {
  if (!CHROME) return;
  b = await bootBrowser(ENTRY, BODY, CSS);
  if (b.bundleError) throw new Error(b.bundleError);
}, 60000);
afterAll(() => closeBrowser(b));

test("reports which browser the tabs-editor tests used", () => {
  console.log(CHROME ? `tabs: ${CHROME}` : "tabs: NO headless Chromium, SKIPPED");
});

function doc(): PageDocument {
  let d = placedDocument();
  const kids = (d.nodes.root.props as { children: string[] }).children;
  const next = insertNode(d, { ...createNode("tabs"), id: "t" }, "root", kids.length === 0 ? 0 : 1);
  if (!next) throw new Error("insert");
  return next;
}

const node = (id: string) => b!.cdp.eval<Node>(`window.__stores.projects.getState().openDocument.nodes[${JSON.stringify(id)}]`);

describe.skipIf(!CHROME)("Tabs add button", () => {
  test("เพิ่มแท็บ grows past Tab 1 / Tab 2", async () => {
    await openPage(b!, doc(), `window.__SELECT="t";`);
    for (let i = 0; i < 40; i++) {
      const ready = await b!.cdp.eval<boolean>(`!!document.getElementById('p6-lt-l-0')`);
      if (ready) break;
      await sleep(50);
    }
    expect(await b!.cdp.eval<boolean>(`!!document.getElementById('p6-lt-l-0')`)).toBe(true);
    expect(await b!.cdp.eval<string>(`[...document.querySelectorAll('button')].map(b=>b.textContent).join('|')`)).toContain(
      "เพิ่มแท็บ",
    );
    await b!.cdp.eval(`(()=>{const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent?.includes('เพิ่มแท็บ'));btns[btns.length-1]?.click();})()`);
    await sleep(80);
    const items = ((await node("t")).props as { items: LabelTextItem[] }).items;
    expect(items).toHaveLength(3);
    expect(items[2]!.label).toContain("แท็บ");
  });
});
