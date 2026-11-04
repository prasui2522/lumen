// Pre-A4: Radio Group panel — multiline options grow past the default two.
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

test("reports which browser the list-editor tests used", () => {
  console.log(CHROME ? `lists: ${CHROME}` : "lists: NO headless Chromium, the behavioural tests are SKIPPED");
});

function doc(): PageDocument {
  let d = placedDocument();
  const kids = (d.nodes.root.props as { children: string[] }).children;
  const next = insertNode(d, { ...createNode("radio"), id: "r" }, "root", kids.length === 0 ? 0 : 1);
  if (!next) throw new Error("insert");
  return next;
}

const node = (id: string) => b!.cdp.eval<Node>(`window.__stores.projects.getState().openDocument.nodes[${JSON.stringify(id)}]`);

describe.skipIf(!CHROME)("Radio Group options lines", () => {
  test("textarea adds a third option and the canvas shows three labels", async () => {
    await openPage(b!, doc(), `window.__SELECT="r";`);
    expect(await b!.cdp.eval<string | null>(`document.getElementById('p6-options')?.tagName ?? null`)).toBe("TEXTAREA");
    const box = await rectOf(b!.cdp, "#p6-options");
    await click(b!.cdp, box.x + 8, box.y + 8);
    await b!.cdp.eval(`(()=>{const el=document.getElementById('p6-options');el.focus();el.select();})()`);
    await b!.cdp.send("Input.insertText", { text: "แดง\nเขียว\nน้ำเงิน" });
    await press(b!.cdp, "Tab", "Tab", 9);
    await sleep(100);
    expect(((await node("r")).props as { options: string[] }).options).toEqual(["แดง", "เขียว", "น้ำเงิน"]);
    const labels = await b!.cdp.eval<string>(
      `[...document.querySelectorAll('[data-node-id="r"] label')].map(l=>l.textContent).join('|')`,
    );
    expect(labels).toBe("แดง|เขียว|น้ำเงิน");
  });
});
