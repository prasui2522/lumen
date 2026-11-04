// PHASE-11 A3.1 in a REAL Chromium: the checkbox on the canvas selects and never toggles (ruling 5), focus stays off the
// input, the node drags, the shared look draws the box + checkmark, and the panel fields T20 / T21 write the props.
// Skipped, and reported as skipped, ONLY when no headless Chromium is installed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Node, PageDocument } from "@/schema";
import { createNode, insertNode } from "@/lib/document-ops";
import { placedDocument } from "@/lib/a25-doc";
import { BODY, CSS, ENTRY } from "@/lib/a25-kinds.test";
import { CHROME, activeDesc, bootBrowser, click, closeBrowser, dragFrom, openPage, press, recordEvents, rectOf, sleep, type Browser } from "@/lib/cdp-kit.test";

let b: Browser | null = null;
beforeAll(async () => {
  if (!CHROME) return;
  b = await bootBrowser(ENTRY, BODY, CSS);
  if (b.bundleError) throw new Error(b.bundleError);
}, 60000);
afterAll(() => closeBrowser(b));

test("reports which browser the A3.1 tests used", () => {
  console.log(CHROME ? `a31: ${CHROME}` : "a31: NO headless Chromium, the behavioural tests are SKIPPED");
});

function doc(): PageDocument {
  let d = placedDocument();
  const add = (n: Node) => {
    const kids = (d.nodes.root.props as { children: string[] }).children;
    const next = insertNode(d, n, "root", kids.length === 0 ? 0 : 1);
    if (!next) throw new Error("insert");
    d = next;
  };
  add({ ...createNode("checkbox"), id: "cb2", props: { type: "checkbox", label: "ติ๊กแล้ว", checked: true } });
  add({ ...createNode("checkbox"), id: "cb" });
  return d;
}
const node = (id: string) => b!.cdp.eval<Node>(`window.__stores.projects.getState().openDocument.nodes[${JSON.stringify(id)}]`);
const selected = () => b!.cdp.eval<string | null>(`window.__stores.editor.getState().selectedNodeId`);
const show = async (sel: string) => {
  await b!.cdp.eval(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:"center"})`);
  await sleep(30);
  return rectOf(b!.cdp, sel);
};
const inputChecked = (id: string) => b!.cdp.eval<boolean>(`document.querySelector('[data-node-id="${id}"] input').checked`);

describe.skipIf(!CHROME)("A3.1 checkbox on the canvas", () => {
  test("a click on the box selects the node and never toggles it; Space does not toggle either", async () => {
    await openPage(b!, doc());
    const r = await show(`[data-node-id="cb"] input`);
    expect(r.w).toBe(16);
    expect(r.h).toBe(16);
    await click(b!.cdp, r.x + 8, r.y + 8);
    await sleep(60);
    expect(await selected()).toBe("cb");
    expect(await inputChecked("cb")).toBe(false);
    expect(((await node("cb")).props as { checked: boolean }).checked).toBe(false);
    // focus is never on the input (no focusable root inside the canvas)
    expect(await activeDesc(b!.cdp)).not.toContain("INPUT");
    await press(b!.cdp, " ", "Space", 32);
    await sleep(60);
    expect(await inputChecked("cb")).toBe(false);
    expect(((await node("cb")).props as { checked: boolean }).checked).toBe(false);
    // the label text too
    const t = await show(`[data-node-id="cb"] span`);
    await click(b!.cdp, t.x + 4, t.y + t.h / 2);
    await sleep(60);
    expect(await selected()).toBe("cb");
    expect(await inputChecked("cb")).toBe(false);
  });

  test("the root and the input are not focusable; Tab never lands on the checkbox input", async () => {
    await openPage(b!, doc());
    const f = await b!.cdp.eval<string>(`[...document.querySelectorAll('[data-node-id^="cb"]')].map(e=>e.tagName+':'+e.tabIndex+':'+e.querySelector('input').tabIndex).join(',')`);
    expect(f).not.toContain("LABEL");
    for (const part of f.split(",")) expect(part.endsWith(":-1")).toBe(true);
    for (let i = 0; i < 6; i++) {
      await press(b!.cdp, "Tab", "Tab", 9);
      await sleep(20);
      expect(await b!.cdp.eval<string>(`(document.activeElement&&document.activeElement.closest('.t-checkbox'))?'IN':'out'`)).toBe("out");
    }
  });

  test("a press on the box starts a drag of the checkbox node", async () => {
    await openPage(b!, doc());
    const r = await show(`[data-node-id="cb"] input`);
    await recordEvents(b!.cdp);
    const ev = await dragFrom(b!.cdp, r.x + 8, r.y + 8);
    expect(ev).toContain("mousedown:cb");
    expect(ev).toContain("dragstart:cb");
  });

  test("the shared look: 16px box, ink fill + data: SVG checkmark only when checked", async () => {
    await openPage(b!, doc());
    const s = (id: string) =>
      b!.cdp.eval<string>(`(()=>{const c=getComputedStyle(document.querySelector('[data-node-id="${id}"] input'));return [c.appearance,c.width,c.backgroundColor,c.backgroundImage.slice(0,24),c.borderRadius].join('|')})()`);
    expect(await s("cb")).toBe("none|16px|rgb(255, 255, 255)|none|4px");
    expect(await s("cb2")).toBe('none|16px|rgb(15, 23, 42)|url("data:image/svg+xml,|4px');
    const row = await b!.cdp.eval<string>(`(()=>{const c=getComputedStyle(document.querySelector('[data-node-id="cb"]'));return c.display+'|'+c.alignItems+'|'+c.columnGap})()`);
    expect(row).toBe("flex|center|8px");
  });
});

describe.skipIf(!CHROME)("A3.1.1 contrast + forced colors", () => {
  test("the box border is {{muted}} #64748b (>= 3:1 on white)", async () => {
    await openPage(b!, doc());
    expect(await b!.cdp.eval<string>(`getComputedStyle(document.querySelector('[data-node-id="cb"] input')).borderTopColor`)).toBe("rgb(100, 116, 139)");
  });
  test("forced-colors: the native box comes back, so checked and unchecked look different", async () => {
    await openPage(b!, doc());
    await b!.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] });
    try {
      await sleep(80);
      expect(await b!.cdp.eval<boolean>(`matchMedia('(forced-colors: active)').matches`)).toBe(true);
      const s = (id: string) =>
        b!.cdp.eval<string>(`(()=>{const c=getComputedStyle(document.querySelector('[data-node-id="${id}"] input'));return c.appearance+'|'+c.backgroundImage})()`);
      expect(await s("cb")).toBe("auto|none");
      expect(await s("cb2")).toBe("auto|none");
      const shot = async (id: string) => {
        const r = await show(`[data-node-id="${id}"] input`);
        const o = await b!.cdp.send("Page.captureScreenshot", { format: "png", clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
        return (o.result ?? o).data as string;
      };
      const on = await shot("cb2");
      const off = await shot("cb");
      expect(on.length).toBeGreaterThan(0);
      expect(on).not.toBe(off);
    } finally {
      await b!.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "none" }] });
    }
  });
});

describe.skipIf(!CHROME)("A3.1 panel fields", () => {
  const open = (sel: string) => openPage(b!, doc(), `window.__SELECT=${JSON.stringify(sel)};`);
  test("T20 ติ๊กอยู่ toggles the saved state (and the canvas follows); T21 ป้ายกำกับ writes the label", async () => {
    await open("cb");
    const t = await b!.cdp.eval<string>(`document.getElementById('style').innerText`);
    expect(t).toContain("ติ๊กอยู่");
    expect(t).toContain("ป้ายกำกับ");
    const sw = await rectOf(b!.cdp, "#pf-checkbox-checked");
    await click(b!.cdp, sw.x + sw.w / 2, sw.y + sw.h / 2);
    await sleep(80);
    expect(((await node("cb")).props as { checked: boolean }).checked).toBe(true);
    expect(await inputChecked("cb")).toBe(true);
    const lb = await rectOf(b!.cdp, "#pf-checkbox-label");
    await click(b!.cdp, lb.x + lb.w / 2, lb.y + lb.h / 2);
    await b!.cdp.eval(`document.getElementById('pf-checkbox-label').select()`);
    await b!.cdp.send("Input.insertText", { text: "รับข่าวสาร" });
    await press(b!.cdp, "Enter", "Enter", 13);
    await sleep(80);
    expect(((await node("cb")).props as { label: string }).label).toBe("รับข่าวสาร");
    expect(await b!.cdp.eval<string>(`document.querySelector('[data-node-id="cb"] span').textContent`)).toBe("รับข่าวสาร");
  });
});
