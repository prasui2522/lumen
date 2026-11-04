// Menubar panel — nested menus with HrefField (URL or เลือกหน้า).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { MenubarMenu, Node, PageDocument } from "@/schema";
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

test("reports which browser the pair-editor tests used", () => {
  console.log(CHROME ? `pairs: ${CHROME}` : "pairs: NO headless Chromium, the behavioural tests are SKIPPED");
});

function doc(): PageDocument {
  let d = placedDocument();
  const kids = (d.nodes.root.props as { children: string[] }).children;
  const next = insertNode(d, { ...createNode("menubar"), id: "m" }, "root", kids.length === 0 ? 0 : 1);
  if (!next) throw new Error("insert");
  return next;
}

const node = (id: string) => b!.cdp.eval<Node>(`window.__stores.projects.getState().openDocument.nodes[${JSON.stringify(id)}]`);

describe.skipIf(!CHROME)("Menubar nested href editor", () => {
  test("HrefField + เพิ่มเมนู; type path on first File item", async () => {
    await openPage(b!, doc(), `window.__SELECT="m";`);
    for (let i = 0; i < 40; i++) {
      const ready = await b!.cdp.eval<boolean>(`!!document.getElementById('p6-mb-h-0-0')`);
      if (ready) break;
      await sleep(50);
    }
    expect(await b!.cdp.eval<boolean>(`!!document.getElementById('p6-mb-h-0-0')`)).toBe(true);
    expect(await b!.cdp.eval<boolean>(`!!document.querySelector('[aria-label="เลือกหน้า"]')`)).toBe(true);
    expect(await b!.cdp.eval<string>(`[...document.querySelectorAll('button')].map(b=>b.textContent).join('|')`)).toContain(
      "เพิ่มเมนู",
    );

    await b!.cdp.eval(`(()=>{const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent?.includes('เพิ่มเมนู'));btns[btns.length-1]?.click();})()`);
    await sleep(80);
    expect(((await node("m")).props as { items: MenubarMenu[] }).items).toHaveLength(3);

    const box = await rectOf(b!.cdp, "#p6-mb-h-0-0");
    await click(b!.cdp, box.x + 8, box.y + box.h / 2);
    await b!.cdp.eval(`(()=>{const el=document.getElementById('p6-mb-h-0-0');el.focus();el.select();})()`);
    await b!.cdp.send("Input.insertText", { text: "/" });
    await press(b!.cdp, "Enter", "Enter", 13);
    await sleep(80);
    expect(((await node("m")).props as { items: MenubarMenu[] }).items[0]!.items[0]!.href).toBe("/");
  });
});
