// PHASE-11 A3.4 in a REAL Chromium: Native Select tile props — T22 options textarea writes the list.
// Skipped, and reported as skipped, ONLY when no headless Chromium is installed.
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

test("reports which browser the A3.4 tests used", () => {
  console.log(CHROME ? `a34: ${CHROME}` : "a34: NO headless Chromium, the behavioural tests are SKIPPED");
});

function doc(): PageDocument {
  let d = placedDocument();
  const kids = (d.nodes.root.props as { children: string[] }).children;
  const next = insertNode(d, { ...createNode("select"), id: "s" }, "root", kids.length === 0 ? 0 : 1);
  if (!next) throw new Error("insert");
  return next;
}

const node = (id: string) => b!.cdp.eval<Node>(`window.__stores.projects.getState().openDocument.nodes[${JSON.stringify(id)}]`);

describe.skipIf(!CHROME)("A3.4 select panel T22", () => {
  test("ตัวเลือก textarea replaces options; canvas <select> follows", async () => {
    await openPage(b!, doc(), `window.__SELECT="s";`);
    const t = await b!.cdp.eval<string>(`document.getElementById('style').innerText`);
    expect(t).toContain("ตัวเลือก (หนึ่งบรรทัดต่อหนึ่งตัวเลือก)");
    expect(await b!.cdp.eval<string | null>(`document.getElementById('p6-options')?.tagName ?? null`)).toBe("TEXTAREA");
    const box = await rectOf(b!.cdp, "#p6-options");
    await click(b!.cdp, box.x + 8, box.y + 8);
    await b!.cdp.eval(`(()=>{const el=document.getElementById('p6-options');el.focus();el.select();})()`);
    await b!.cdp.send("Input.insertText", { text: "แดง\nเขียว\nA & B" });
    await press(b!.cdp, "Tab", "Tab", 9);
    await sleep(100);
    expect(((await node("s")).props as { options: string[] }).options).toEqual(["แดง", "เขียว", "A & B"]);
    const labels = await b!.cdp.eval<string>(
      `[...document.querySelectorAll('[data-node-id="s"] option')].map(o=>o.textContent).join('|')`,
    );
    expect(labels).toBe("แดง|เขียว|A & B");
  });
});
