// PHASE-11 A3.2 in a REAL Chromium: the restyled switch on the canvas selects and never toggles (ruling 5), focus stays
// off the input, the node drags, the shared look draws track + thumb, forced colors / reduced motion are handled.
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

test("reports which browser the A3.2 tests used", () => {
  console.log(CHROME ? `a32: ${CHROME}` : "a32: NO headless Chromium, the behavioural tests are SKIPPED");
});

function doc(): PageDocument {
  let d = placedDocument();
  const add = (n: Node) => {
    const kids = (d.nodes.root.props as { children: string[] }).children;
    const next = insertNode(d, n, "root", kids.length === 0 ? 0 : 1);
    if (!next) throw new Error("insert");
    d = next;
  };
  add({ ...createNode("switch"), id: "sw2", props: { type: "switch", label: "เปิดอยู่", checked: true } });
  add({ ...createNode("switch"), id: "sw" });
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
const look = (id: string, sel: string, props: string[]) =>
  b!.cdp.eval<string>(`(()=>{const c=getComputedStyle(document.querySelector('[data-node-id="${id}"] ${sel}'));return ${JSON.stringify(props)}.map(p=>c[p]).join('|')})()`);

describe.skipIf(!CHROME)("A3.2 switch on the canvas", () => {
  test("a click on the track selects the node and never toggles it; Space does not toggle either", async () => {
    await openPage(b!, doc());
    const r = await show(`[data-node-id="sw"] .sw-track`);
    expect(r.w).toBe(40);
    expect(r.h).toBe(22);
    await click(b!.cdp, r.x + 10, r.y + 11);
    await sleep(60);
    expect(await selected()).toBe("sw");
    expect(await inputChecked("sw")).toBe(false);
    expect(((await node("sw")).props as { checked: boolean }).checked).toBe(false);
    expect(await activeDesc(b!.cdp)).not.toContain("INPUT");
    await press(b!.cdp, " ", "Space", 32);
    await sleep(60);
    expect(await inputChecked("sw")).toBe(false);
    expect(((await node("sw")).props as { checked: boolean }).checked).toBe(false);
    const t = await show(`[data-node-id="sw"] > span:last-child`);
    await click(b!.cdp, t.x + 4, t.y + t.h / 2);
    await sleep(60);
    expect(await selected()).toBe("sw");
    expect(await inputChecked("sw")).toBe(false);
  });

  test("root and input are not focusable; Tab never lands on the switch", async () => {
    await openPage(b!, doc());
    const f = await b!.cdp.eval<string>(`[...document.querySelectorAll('[data-node-id^="sw"]')].map(e=>e.tagName+':'+e.tabIndex+':'+e.querySelector('input').tabIndex).join(',')`);
    expect(f).not.toContain("LABEL");
    for (const part of f.split(",")) expect(part.endsWith(":-1")).toBe(true);
    for (let i = 0; i < 6; i++) {
      await press(b!.cdp, "Tab", "Tab", 9);
      await sleep(20);
      expect(await b!.cdp.eval<string>(`(document.activeElement&&document.activeElement.closest('.t-switch'))?'IN':'out'`)).toBe("out");
    }
  });

  test("a press on the track starts a drag of the switch node", async () => {
    await openPage(b!, doc());
    const r = await show(`[data-node-id="sw"] .sw-track`);
    await recordEvents(b!.cdp);
    const ev = await dragFrom(b!.cdp, r.x + 10, r.y + 11);
    expect(ev).toContain("mousedown:sw");
    expect(ev).toContain("dragstart:sw");
  });

  test("the shared look: off/on track, thumb moves 18px, hidden input, row extras", async () => {
    await openPage(b!, doc());
    expect(await look("sw", ".sw-track", ["backgroundColor", "borderTopColor", "borderRadius"])).toBe("rgb(203, 213, 225)|rgb(100, 116, 139)|11px");
    expect(await look("sw2", ".sw-track", ["backgroundColor", "borderTopColor"])).toBe("rgb(15, 23, 42)|rgb(15, 23, 42)");
    expect(await look("sw", ".sw-thumb", ["width", "backgroundColor", "transform"])).toBe("16px|rgb(255, 255, 255)|none");
    expect(await look("sw2", ".sw-thumb", ["transform"])).toBe("matrix(1, 0, 0, 1, 18, 0)");
    expect(await look("sw", "input", ["position", "opacity", "width"])).toBe("absolute|0|1px");
    const row = await b!.cdp.eval<string>(`(()=>{const c=getComputedStyle(document.querySelector('[data-node-id="sw"]'));return c.display+'|'+c.alignItems+'|'+c.columnGap+'|'+c.position})()`);
    expect(row).toBe("flex|center|8px|relative");
  });

  test("reduced motion turns the transitions off", async () => {
    await openPage(b!, doc());
    expect(await look("sw", ".sw-thumb", ["transitionDuration"])).toBe("0.15s");
    await b!.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    try {
      await sleep(60);
      expect(await look("sw", ".sw-thumb", ["transitionProperty"])).toBe("none");
      expect(await look("sw", ".sw-track", ["transitionProperty"])).toBe("none");
    } finally {
      await b!.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    }
  });

  test("forced colors: system colours, on and off look different", async () => {
    await openPage(b!, doc());
    await b!.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] });
    try {
      await sleep(80);
      expect(await b!.cdp.eval<boolean>(`matchMedia('(forced-colors: active)').matches`)).toBe(true);
      expect(await look("sw", ".sw-track", ["forcedColorAdjust"])).toBe("none");
      const off = await look("sw", ".sw-track", ["backgroundColor"]);
      const on = await look("sw2", ".sw-track", ["backgroundColor"]);
      expect(on).not.toBe(off);
      const shot = async (id: string) => {
        const r = await show(`[data-node-id="${id}"] .sw-track`);
        const o = await b!.cdp.send("Page.captureScreenshot", { format: "png", clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
        return (o.result ?? o).data as string;
      };
      expect(await shot("sw2")).not.toBe(await shot("sw"));
    } finally {
      await b!.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "none" }] });
    }
  });
});

describe.skipIf(!CHROME)("A3.2 exported switch (Rust golden in Chromium)", () => {
  const FX = new URL("../../src-tauri/src/fixtures/a3/", import.meta.url);
  const load = async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(new URL("a32-switch.html", FX), "utf8");
    const css = readFileSync(new URL("a32-switch.css", FX), "utf8");
    const page = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);
    await b!.cdp.eval(`(()=>{document.open();document.write(${JSON.stringify(page)});document.close();return 1})()`);
    await sleep(100);
  };
  const states = () => b!.cdp.eval<string>(`[...document.querySelectorAll('input.sw')].map(i=>i.checked?1:0).join('')`);
  test("a click toggles only that switch; Tab + Space toggle with the ring on the track", async () => {
    await load();
    expect(await states()).toBe("1001");
    const r = await rectOf(b!.cdp, "label:nth-child(2) .sw-track");
    await click(b!.cdp, r.x + 10, r.y + 11);
    await sleep(60);
    expect(await states()).toBe("1101"); // two switches are independent
    const t = await rectOf(b!.cdp, "label:nth-child(1) span:last-child");
    await click(b!.cdp, t.x + 4, t.y + t.h / 2);
    await sleep(60);
    expect(await states()).toBe("0101");
    await b!.cdp.eval(`document.activeElement&&document.activeElement.blur()`);
    await press(b!.cdp, "Tab", "Tab", 9);
    await sleep(40);
    expect(await b!.cdp.eval<string>(`document.activeElement.className`)).toBe("sw");
    const ring = () => b!.cdp.eval<string>(`(()=>{const c=getComputedStyle(document.activeElement.nextElementSibling);return c.outlineStyle+'|'+c.outlineColor+'|'+c.outlineWidth})()`);
    expect(await ring()).toBe("solid|rgb(0, 119, 194)|2px");
    const idx = await b!.cdp.eval<number>(`[...document.querySelectorAll('input.sw')].indexOf(document.activeElement)`);
    expect(idx).toBeGreaterThanOrEqual(0);
    const before = await states();
    await press(b!.cdp, " ", "Space", 32);
    await sleep(60);
    const after = await states();
    // Space flips exactly the focused switch
    expect([...after].map((c, i) => (c !== before[i] ? i : -1)).filter((i) => i >= 0)).toEqual([idx]);
  });
});
